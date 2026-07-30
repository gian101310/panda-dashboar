using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using cAlgo.API;

namespace cAlgo
{
    internal sealed class OverlayPair
    {
        [JsonPropertyName("symbol")] public string Symbol { get; set; }
        [JsonPropertyName("gap")] public double? Gap { get; set; }
        [JsonPropertyName("bias")] public string Bias { get; set; }
        [JsonPropertyName("hard_invalid")] public bool HardInvalid { get; set; }
        [JsonPropertyName("box_h4_trend")] public string BoxH4Trend { get; set; }
        [JsonPropertyName("box_h1_trend")] public string BoxH1Trend { get; set; }
        [JsonPropertyName("pl_zone")] public string PandaLinesZone { get; set; }
        [JsonPropertyName("pl_bias")] public string PandaLinesBias { get; set; }
        [JsonPropertyName("pl_g1_valid")] public bool PandaLinesValid { get; set; }
        [JsonPropertyName("base_currency")] public string BaseCurrency { get; set; }
        [JsonPropertyName("base_score_tf")] public string BaseScoreTf { get; set; }
        [JsonPropertyName("quote_currency")] public string QuoteCurrency { get; set; }
        [JsonPropertyName("quote_score_tf")] public string QuoteScoreTf { get; set; }
        [JsonPropertyName("updated_at")] public string UpdatedAt { get; set; }
    }

    internal sealed class DeviceActivationEnvelope
    {
        [JsonPropertyName("token")] public string Token { get; set; }
    }

    internal sealed class OverlayResponse
    {
        [JsonPropertyName("schema_version")] public int SchemaVersion { get; set; }
        [JsonPropertyName("server_time")] public string ServerTime { get; set; }
        [JsonPropertyName("max_age_seconds")] public int MaxAgeSeconds { get; set; }
        [JsonPropertyName("status")] public string Status { get; set; }
        [JsonPropertyName("device_activation")] public DeviceActivationEnvelope DeviceActivation { get; set; }
        [JsonPropertyName("pairs")] public List<OverlayPair> Pairs { get; set; }
    }

    internal sealed class FeedResult
    {
        public bool Success { get; set; }
        public string Status { get; set; }
        public DateTime ReceivedAtUtc { get; set; }
        public int MaxAgeSeconds { get; set; }
        public Dictionary<string, OverlayPair> Pairs { get; set; }
        public string DeviceActivation { get; set; }
    }

    internal static class PandaSymbolNormalizer
    {
        private static readonly string[] Pairs = {
            "AUDCAD", "AUDJPY", "AUDNZD", "AUDUSD", "CADJPY", "CHFJPY", "EURAUD",
            "EURCAD", "EURGBP", "EURJPY", "EURNZD", "EURUSD", "GBPAUD", "GBPCAD",
            "GBPJPY", "GBPNZD", "GBPUSD", "NZDCAD", "NZDJPY", "NZDUSD", "USDCAD",
            "USDCHF", "USDJPY"
        };

        public static string Normalize(string value)
        {
            var compact = new string((value ?? string.Empty).ToUpperInvariant().Where(char.IsLetter).ToArray());
            var matches = Pairs.Where(compact.Contains).ToArray();
            return matches.Length == 1 ? matches[0] : string.Empty;
        }
    }

    internal static class OverlaySnapshotParser
    {
        public static FeedResult Parse(string json, DateTime receivedAtUtc)
        {
            var response = JsonSerializer.Deserialize<OverlayResponse>(json ?? string.Empty,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            if (response == null || response.SchemaVersion != 1 || response.Pairs == null)
                throw new InvalidOperationException("Unsupported Panda overlay response");

            var pairs = response.Pairs
                .Where(pair => !string.IsNullOrWhiteSpace(pair.Symbol))
                .GroupBy(pair => pair.Symbol.ToUpperInvariant())
                .ToDictionary(group => group.Key, group => group.First());
            return new FeedResult {
                Success = true,
                Status = "LIVE",
                ReceivedAtUtc = receivedAtUtc,
                MaxAgeSeconds = response.MaxAgeSeconds > 0 ? response.MaxAgeSeconds : 600,
                Pairs = pairs,
                DeviceActivation = response.DeviceActivation?.Token
            };
        }
    }

    internal static class SharedOverlayFeed
    {
        private sealed class CacheEntry
        {
            public DateTime LastRequestUtc = DateTime.MinValue;
            public FeedResult LastResult;
            public bool RequestInFlight;
            public readonly List<Action<FeedResult>> Callbacks = new List<Action<FeedResult>>();
        }

        private static readonly object Gate = new object();
        private static readonly Dictionary<string, CacheEntry> Entries = new Dictionary<string, CacheEntry>();
        private static readonly TimeSpan RefreshInterval = TimeSpan.FromSeconds(60);
        public static void Request(Http http, string endpoint, string headerName, string credential,
            string deviceId, string deviceToken, Action<FeedResult> callback)
        {
            var key = headerName + ":" + credential + ":" + deviceId + ":" + deviceToken;
            CacheEntry entry;
            lock (Gate)
            {
                if (!Entries.TryGetValue(key, out entry))
                {
                    entry = new CacheEntry();
                    Entries[key] = entry;
                }
                if (entry.LastResult != null && DateTime.UtcNow - entry.LastRequestUtc < RefreshInterval)
                {
                    callback(entry.LastResult);
                    return;
                }
                entry.Callbacks.Add(callback);
                if (entry.RequestInFlight) return;
                entry.RequestInFlight = true;
                entry.LastRequestUtc = DateTime.UtcNow;
            }

            var request = new HttpRequest(new Uri(endpoint));
            request.Method = HttpMethod.Get;
            request.Timeout = TimeSpan.FromSeconds(12);
            request.Headers.Add(headerName, credential);
            if (!string.IsNullOrWhiteSpace(deviceId)) request.Headers.Add("x-panda-device-id", deviceId);
            if (!string.IsNullOrWhiteSpace(deviceToken)) request.Headers.Add("x-panda-device-token", deviceToken);
            http.SendAsync(request, response => Complete(key, response));
        }

        private static void Complete(string key, HttpResponse response)
        {
            FeedResult result;
            try
            {
                if (response == null || !response.IsSuccessful)
                {
                    var status = "ERROR";
                    if (response != null && !string.IsNullOrWhiteSpace(response.Body))
                    {
                        try { status = JsonSerializer.Deserialize<OverlayResponse>(response.Body)?.Status ?? "ERROR"; }
                        catch { }
                    }
                    result = new FeedResult { Success = false, Status = status, ReceivedAtUtc = DateTime.UtcNow };
                }
                else result = OverlaySnapshotParser.Parse(response.Body, DateTime.UtcNow);
            }
            catch
            {
                result = new FeedResult { Success = false, Status = "ERROR", ReceivedAtUtc = DateTime.UtcNow };
            }

            List<Action<FeedResult>> callbacks;
            lock (Gate)
            {
                var entry = Entries[key];
                entry.RequestInFlight = false;
                if (result.Success) entry.LastResult = result;
                callbacks = entry.Callbacks.ToList();
                entry.Callbacks.Clear();
            }
            foreach (var callback in callbacks) callback(result);
        }
    }

    public abstract class PandaDashboardOverlayBase : Indicator
    {
        protected const string FeedEndpoint = "https://pandaengine.app/api/ctrader-overlay";
        protected const double PanelHeight = 170;
        private const double PanelWidth = 260;

        private ChartDraggable _draggable;
        private string _symbol;
        private bool _minimized;
        private FeedResult _lastGoodResult;
        private string _status = "CONNECTING";
        private DateTime _lastUiRefreshUtc = DateTime.MinValue;

        protected abstract string CredentialHeader { get; }
        protected abstract string CredentialValue { get; }
        protected virtual string DeviceId { get { return string.Empty; } }
        protected virtual string DeviceToken { get { return string.Empty; } }
        protected virtual void SaveDeviceActivation(string token) { }

        protected override void Initialize()
        {
            _symbol = PandaSymbolNormalizer.Normalize(SymbolName);
            _minimized = LocalStorage.GetString("PandaOverlay Minimized") == "1";
            _draggable = Chart.Draggables.Add();
            _draggable.ShowGrip = true;
            _draggable.Child = BuildPanel();
            RestoreLocation();
            _draggable.LocationChanged += OnLocationChanged;
            Timer.TimerTick += OnTimerTick;
            Timer.Start(1);
            RefreshFeed();
        }

        public override void Calculate(int index) { }

        private void OnTimerTick()
        {
            if (DateTime.UtcNow - _lastUiRefreshUtc >= TimeSpan.FromSeconds(1)) Render();
            RefreshFeed();
        }

        private void RefreshFeed()
        {
            if (string.IsNullOrWhiteSpace(_symbol))
            {
                _status = "UNSUPPORTED SYMBOL";
                Render();
                return;
            }
            if (string.IsNullOrWhiteSpace(CredentialValue))
            {
                _status = "AUTH REQUIRED";
                Render();
                return;
            }
            SharedOverlayFeed.Request(Http, FeedEndpoint, CredentialHeader, CredentialValue, DeviceId, DeviceToken, result =>
                BeginInvokeOnMainThread(() => {
                    if (!string.IsNullOrWhiteSpace(result.DeviceActivation)) SaveDeviceActivation(result.DeviceActivation);
                    if (result.Success) { _lastGoodResult = result; _status = "LIVE"; }
                    else if (_lastGoodResult == null) _status = result.Status ?? "ERROR";
                    Render();
                }));
        }

        private void RestoreLocation()
        {
            double x;
            double y;
            var savedX = LocalStorage.GetString("PandaOverlay X");
            var savedY = LocalStorage.GetString("PandaOverlay Y");
            _draggable.X = double.TryParse(savedX, NumberStyles.Float, CultureInfo.InvariantCulture, out x) ? x : 12;
            _draggable.Y = double.TryParse(savedY, NumberStyles.Float, CultureInfo.InvariantCulture, out y)
                ? y : Math.Max(12, Chart.Height - PanelHeight - 12);
        }

        private void OnLocationChanged(ChartDraggableLocationChangedEventArgs args)
        {
            LocalStorage.SetString("PandaOverlay X", args.Draggable.X.ToString(CultureInfo.InvariantCulture), LocalStorageScope.Instance);
            LocalStorage.SetString("PandaOverlay Y", args.Draggable.Y.ToString(CultureInfo.InvariantCulture), LocalStorageScope.Instance);
            LocalStorage.Flush(LocalStorageScope.Instance);
        }

        private ControlBase BuildPanel()
        {
            var panel = new StackPanel {
                Orientation = Orientation.Vertical,
                Width = _minimized ? 210 : PanelWidth,
                BackgroundColor = Color.FromArgb(230, 9, 15, 25),
                Margin = 2
            };
            var header = new Grid(1, 3) { Margin = 7 };
            header.AddChild(Text(_symbol + " · PANDA", Color.White, 11, true), 0, 0);
            header.AddChild(Text(_status, StatusColor(), 9, true), 0, 1);
            var minimize = new Button { Text = _minimized ? "+" : "−", Width = 28, Height = 22, Margin = 1 };
            minimize.Click += Minimize;
            header.AddChild(minimize, 0, 2);
            panel.AddChild(header);
            if (!_minimized) AddExpandedRows(panel);
            else panel.AddChild(Text(CompactLine(), BiasColor(CurrentPair()?.Bias), 12, true));
            return panel;
        }

        private void AddExpandedRows(StackPanel panel)
        {
            var pair = CurrentPair();
            panel.AddChild(Row("SCORE", pair?.Gap.HasValue == true ? pair.Gap.Value.ToString("+0.0;-0.0;0.0") : "—", BiasColor(pair?.Bias), 22));
            panel.AddChild(Row("BIAS", Safe(pair?.Bias), BiasColor(pair?.Bias), 13));
            panel.AddChild(Row("BOX H4", Safe(pair?.BoxH4Trend), TrendColor(pair?.BoxH4Trend), 11));
            panel.AddChild(Row("BOX H1", Safe(pair?.BoxH1Trend), TrendColor(pair?.BoxH1Trend), 11));
            var pl = pair == null ? "—" : (pair.PandaLinesValid ? "CONFIRMED" : Safe(pair.PandaLinesZone));
            panel.AddChild(Row("PANDA LINES", pl, pair?.PandaLinesValid == true ? Color.LimeGreen : Color.Gold, 11));
            var xtf = pair == null ? "—" : FormatXtf(pair);
            panel.AddChild(Row("XTF", xtf, Color.LightBlue, 10));
            panel.AddChild(Text(Footer(pair), StatusColor(), 9, false));
        }

        private Grid Row(string label, string value, Color valueColor, double valueSize)
        {
            var row = new Grid(1, 2) { Margin = new Thickness(8, 2, 8, 2) };
            row.AddChild(Text(label, Color.Gray, 9, false), 0, 0);
            row.AddChild(Text(value, valueColor, valueSize, true), 0, 1);
            return row;
        }

        private static TextBlock Text(string value, Color color, double size, bool bold)
        {
            return new TextBlock {
                Text = value ?? "—",
                ForegroundColor = color,
                FontSize = size,
                FontWeight = bold ? FontWeight.ExtraBold : FontWeight.Normal,
                Margin = new Thickness(4, 2, 4, 2)
            };
        }

        private void Minimize(ButtonClickEventArgs args)
        {
            _minimized = !_minimized;
            LocalStorage.SetString("PandaOverlay Minimized", _minimized ? "1" : "0", LocalStorageScope.Instance);
            LocalStorage.Flush(LocalStorageScope.Instance);
            _draggable.Child = BuildPanel();
        }

        private void Render()
        {
            if (_draggable == null) return;
            if (_lastGoodResult != null && DateTime.UtcNow - _lastGoodResult.ReceivedAtUtc > TimeSpan.FromSeconds(_lastGoodResult.MaxAgeSeconds))
                _status = "STALE";
            _draggable.Child = BuildPanel();
            _lastUiRefreshUtc = DateTime.UtcNow;
        }

        private OverlayPair CurrentPair()
        {
            OverlayPair pair;
            return _lastGoodResult?.Pairs != null && _lastGoodResult.Pairs.TryGetValue(_symbol, out pair) ? pair : null;
        }

        private string CompactLine()
        {
            var pair = CurrentPair();
            var score = pair?.Gap.HasValue == true ? pair.Gap.Value.ToString("+0.0;-0.0;0.0") : "—";
            return score + "  " + Safe(pair?.Bias) + "  " + _status;
        }

        private string Footer(OverlayPair pair)
        {
            DateTime updated;
            var time = pair != null && DateTime.TryParse(pair.UpdatedAt, out updated) ? updated.ToLocalTime().ToString("HH:mm:ss") : "—";
            return "Dashboard sync · " + time + " · " + _status;
        }

        private static string FormatXtf(OverlayPair pair)
        {
            var left = string.IsNullOrWhiteSpace(pair.BaseScoreTf) ? "NONE" : pair.BaseCurrency + " " + pair.BaseScoreTf;
            var right = string.IsNullOrWhiteSpace(pair.QuoteScoreTf) ? "NONE" : pair.QuoteCurrency + " " + pair.QuoteScoreTf;
            return left + " | " + right;
        }

        private static string Safe(string value) { return string.IsNullOrWhiteSpace(value) ? "—" : value; }
        private Color StatusColor() { return _status == "LIVE" ? Color.LimeGreen : _status == "STALE" ? Color.Gold : Color.OrangeRed; }
        private static Color BiasColor(string bias) { return bias == "BUY" ? Color.LimeGreen : bias == "SELL" ? Color.Red : Color.Gray; }
        private static Color TrendColor(string trend) { return trend == "UPTREND" ? Color.LimeGreen : trend == "DOWNTREND" ? Color.Red : Color.Gray; }
    }
}
