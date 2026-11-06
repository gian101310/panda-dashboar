using System;
using System.Globalization;
using System.Text.Json;
using System.Linq;
using cAlgo.API;
using cAlgo.API.Internals;

namespace cAlgo
{
    [Indicator(IsOverlay = true, TimeZone = TimeZones.UTC, AutoRescale = false,
        AccessRights = AccessRights.None)]
    public class PandaRawScoreEngine : Indicator
    {
        private static readonly string[] SupportedPairs = {
            "AUDJPY", "AUDCAD", "AUDNZD", "AUDUSD", "CADJPY",
            "EURAUD", "EURCAD", "EURGBP", "EURJPY", "EURNZD", "EURUSD",
            "GBPAUD", "GBPCAD", "GBPJPY", "GBPNZD", "GBPUSD",
            "NZDCAD", "NZDJPY", "NZDUSD", "USDCAD", "USDJPY"
        };

        private static readonly Color Text = Color.FromHex("#dce5ed");
        private static readonly Color Heading = Color.FromHex("#8fc6df");
        private static readonly Color Muted = Color.FromHex("#8b9aa8");
        private static readonly Color Buy = Color.FromHex("#00ff9f");
        private static readonly Color Sell = Color.FromHex("#ff4d6d");
        [Parameter("License Token", DefaultValue = "", Group = "Panda Feed")]
        public string LicenseToken { get; set; }

        [Parameter("Refresh (seconds)", DefaultValue = 30, MinValue = 15, MaxValue = 120)]
        public int RefreshSeconds { get; set; }

        [Parameter("Show text", DefaultValue = true, Group = "Display")]
        public bool ShowPanel { get; set; }

        [Output("Visibility Sentinel", LineColor = "Transparent", PlotType = PlotType.Line)]
        public IndicatorDataSeries VisibilitySentinel { get; set; }

        private StackPanel _overlay;
        private TextBlock _title, _base, _quote, _advBase, _advQuote;
        private TextBlock _currentHeading, _advHeading, _atrHeading;
        private TextBlock _atr, _spread, _rawScores, _gap, _bias, _execution, _status;
        private string _pair;
        private DateTime _nextRequest = DateTime.MinValue;
        private bool _requestInFlight, _destroyed;
        private string _activeAccount;
        private int _accountGeneration;
        private DateTime _expiresAt = DateTime.MinValue;
        private const string Endpoint = "https://pandaengine.app/api/trend-confluence-feed";

        protected override void Initialize()
        {
            var letters = new string(SymbolName.ToUpperInvariant().Where(char.IsLetter).ToArray());
            var matches = SupportedPairs.Where(letters.Contains).ToArray();
            _pair = matches.Length == 1 ? matches[0] : null;

            _overlay = new StackPanel {
                Orientation = Orientation.Vertical, Width = 405, Margin = 12,
                HorizontalAlignment = HorizontalAlignment.Right,
                VerticalAlignment = VerticalAlignment.Top
            };
            _title = Line("PANDA ENGINE  |  " + (_pair ?? "NO PAIR"), Heading, 13, true);
            _currentHeading = Line("CURRENT SCORE", Heading, 10, true);
            _advHeading = Line("ADV FORECAST", Heading, 10, true);
            _atrHeading = Line("ATR / SPREAD", Heading, 10, true);
            _base = Line("", Text);
            _quote = Line("", Text);
            _advBase = Line("", Text);
            _advQuote = Line("", Text);
            _atr = Line("", Text);
            _spread = Line("", Text);
            _rawScores = Line("", Muted, 10);
            _gap = Line("", Text, 12, true);
            _bias = Line("", Text, 12, true);
            _execution = Line("", Muted, 10);
            _status = Line("Connecting to Panda engine...", Muted, 10);
            foreach (var line in new[] { _title, Spacer(), _currentHeading, _base, _quote,
                _rawScores, _gap, _bias, _execution, Spacer(), _advHeading, _advBase,
                _advQuote, Spacer(), _atrHeading, _atr, _spread, Spacer(), _status })
                _overlay.AddChild(line);
            Chart.AddControl(_overlay);

            Account.Switched += OnAccountSwitched;
            ResetAccount();
            Timer.TimerTick += OnTimerTick;
            Timer.Start(2);
            Refresh();
        }

        public override void Calculate(int index)
        {
            VisibilitySentinel[index] = double.NaN;
            UpdateVisibility();
            CheckAccount();
        }

        private static TextBlock Line(string value, Color color, double size = 11, bool bold = false)
        {
            return new TextBlock {
                Text = value, ForegroundColor = color, FontSize = size,
                FontWeight = bold ? FontWeight.Bold : FontWeight.Normal, Margin = 1,
                HorizontalAlignment = HorizontalAlignment.Right
            };
        }

        private static TextBlock Spacer()
        {
            return new TextBlock { Text = " ", FontSize = 5, Margin = 0 };
        }

        private void OnTimerTick()
        {
            UpdateVisibility();
            Refresh();
        }

        private void UpdateVisibility()
        {
            if (_overlay == null) return;
            var visible = ShowPanel;
            try
            {
                var indicator = ChartIndicators[InstanceId];
                if (indicator != null && indicator.LineOutputs.Count > 0)
                    visible &= indicator.LineOutputs[0].IsVisible;
            }
            catch { }
            _overlay.IsVisible = visible;
        }

        private void OnAccountSwitched(AccountSwitchedEventArgs args)
        {
            ResetAccount();
            Refresh();
        }
        private void CheckAccount()
        {
            if (_activeAccount != Account.Number.ToString(CultureInfo.InvariantCulture)) ResetAccount();
        }
        private void ResetAccount()
        {
            _activeAccount = Account.Number.ToString(CultureInfo.InvariantCulture);
            _accountGeneration++;
            _requestInFlight = false;
            _expiresAt = DateTime.MinValue;
            _nextRequest = DateTime.MinValue;
            if (_status != null) Clear("Checking registered account " + _activeAccount);
        }

        private void Refresh()
        {
            CheckAccount();
            _spread.Text = SpreadText();
            if (_pair == null) { Clear("Unsupported or ambiguous chart symbol"); return; }
            if (DateTime.UtcNow >= _expiresAt) Clear("Waiting for fresh Panda engine data");
            if (_requestInFlight || DateTime.UtcNow < _nextRequest) return;
            var token = (LicenseToken ?? "").Trim();
            if (token.Length != 64 || token.Any(c => !Uri.IsHexDigit(c))) { Clear("Enter your Panda License Token"); return; }
            _requestInFlight = true;
            _nextRequest = DateTime.UtcNow.AddSeconds(RefreshSeconds);
            var request = new HttpRequest(new Uri(Endpoint));
            request.Method = HttpMethod.Get;
            request.Timeout = TimeSpan.FromSeconds(12);
            request.Headers.Add("x-panda-confluence-token", token);
            request.Headers.Add("x-panda-account-number", _activeAccount);
            request.Headers.Add("x-panda-product-code", "ctrader_raw_score_engine");
            int generation = _accountGeneration;
            try { Http.SendAsync(request, response => BeginInvokeOnMainThread(() => Complete(response, generation))); }
            catch { _requestInFlight = false; _expiresAt = DateTime.MinValue; Clear("Panda feed unavailable"); }
        }

        private void Complete(HttpResponse response, int generation)
        {
            if (_destroyed || generation != _accountGeneration || _activeAccount != Account.Number.ToString(CultureInfo.InvariantCulture)) return;
            _requestInFlight = false;
            try
            {
                if (response == null || !response.IsSuccessful)
                {
                    string status = "Feed unavailable";
                    if (response != null && !string.IsNullOrWhiteSpace(response.Body))
                        using (var error = JsonDocument.Parse(response.Body)) status = TextValue(error.RootElement, "status");
                    _expiresAt = DateTime.MinValue;
                    Clear("ACCOUNT " + _activeAccount + "  |  " + status);
                    return;
                }
                using (var doc = JsonDocument.Parse(response.Body))
                {
                    var envelope = doc.RootElement;
                    if (envelope.GetProperty("schema_version").GetInt32() != 1)
                        throw new InvalidOperationException("Unsupported feed");
                    int age = Math.Min(600, envelope.GetProperty("max_age_seconds").GetInt32());
                    if (age <= 0) throw new InvalidOperationException("Invalid expiry");
                    JsonElement pair = default;
                    foreach (var candidate in envelope.GetProperty("pairs").EnumerateArray())
                        if (TextValue(candidate, "symbol") == _pair) { pair = candidate; break; }
                    if (pair.ValueKind != JsonValueKind.Object) throw new InvalidOperationException("Missing pair");
                    if (!DateTimeOffset.TryParse(TextValue(pair, "updated_at"), CultureInfo.InvariantCulture,
                        DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var timestamp))
                        throw new InvalidOperationException("Missing timestamp");
                    var now = DateTime.UtcNow;
                    if (timestamp.UtcDateTime > now.AddMinutes(1) || timestamp.UtcDateTime.AddSeconds(age) <= now)
                        throw new InvalidOperationException("Stale engine data");
                    var baseLine = Scores(pair, "base_", _pair.Substring(0, 3));
                    var quoteLine = Scores(pair, "quote_", _pair.Substring(3, 3));
                    var advBase = Scores(pair, "adv_base_", _pair.Substring(0, 3));
                    var advQuote = Scores(pair, "adv_quote_", _pair.Substring(3, 3));
                    if (!pair.TryGetProperty("gap", out var gapValue) || !gapValue.TryGetInt32(out var gap))
                        throw new InvalidOperationException("Missing engine gap");
                    bool invalid = pair.GetProperty("hard_invalid").GetBoolean();
                    string bias = invalid ? "HARD_INVALID" : TextValue(pair, "bias");
                    if (!new[] { "BUY", "SELL", "WAIT", "INVALID", "HARD_INVALID" }.Contains(bias))
                        throw new InvalidOperationException("Missing engine bias");
                    _base.Text = baseLine; _quote.Text = quoteLine;
                    _advBase.Text = advBase; _advQuote.Text = advQuote;
                    _rawScores.Text = "Engine timeframe scores (dominant values)";
                    _gap.Text = "ENGINE GAP: " + Signed(gap);
                    _bias.Text = "BIAS: " + bias;
                    _bias.ForegroundColor = bias == "BUY" ? Buy : bias == "SELL" ? Sell : Heading;
                    _gap.ForegroundColor = _bias.ForegroundColor;
                    _execution.Text = "EXECUTION: " + TextValue(pair, "execution") +
                        "   CONFIDENCE: " + TextValue(pair, "confidence");
                    _atr.Text = "ENGINE ATR: " + NumberText(pair, "atr") + " : " +
                        NumberText(pair, "atr_reference") + " MT4 points";
                    _expiresAt = timestamp.UtcDateTime.AddSeconds(age);
                    _status.Text = "PANDA ENGINE  |  " + timestamp.UtcDateTime.ToString("HH:mm:ss 'UTC'");
                }
            }
            catch { _expiresAt = DateTime.MinValue; Clear("Feed unavailable, stale, or missing score fields"); }
        }

        private static string Scores(JsonElement pair, string prefix, string currency)
        {
            return currency + "  D1:" + Score(pair, prefix + "d1") +
                "  H4:" + Score(pair, prefix + "h4") + "  H1:" + Score(pair, prefix + "h1");
        }
        private static string Score(JsonElement pair, string key)
        {
            if (!pair.TryGetProperty(key, out var field) || !field.TryGetInt32(out int value) || Math.Abs(value) > 6)
                throw new InvalidOperationException("Missing score");
            return Signed(value);
        }
        private static string TextValue(JsonElement item, string key)
        {
            return item.TryGetProperty(key, out var field) && field.ValueKind == JsonValueKind.String ? field.GetString() : "--";
        }
        private static string NumberText(JsonElement item, string key)
        {
            return item.TryGetProperty(key, out var field) && field.ValueKind == JsonValueKind.Number &&
                field.TryGetDouble(out var value) && double.IsFinite(value) && value >= 0
                ? value.ToString("0.##", CultureInfo.InvariantCulture) : "--";
        }
        private static string Signed(int value) => value > 0 ? "+" + value : value.ToString(CultureInfo.InvariantCulture);

        protected override void OnDestroy()
        {
            _destroyed = true;
            Account.Switched -= OnAccountSwitched;
            Timer.Stop();
            if (_overlay != null) Chart.RemoveControl(_overlay);
        }

        private string SpreadText()
        {
            if (Symbol.Ask <= 0 || Symbol.Bid <= 0 || Symbol.PipSize <= 0 || Symbol.TickSize <= 0)
                return "CTRADER SPREAD: --";
            var priceSpread = Math.Max(0, Symbol.Ask - Symbol.Bid);
            return "CTRADER SPREAD: " + (priceSpread / Symbol.PipSize).ToString("0.0", CultureInfo.InvariantCulture) +
                " pips  (" + (priceSpread / Symbol.TickSize).ToString("0", CultureInfo.InvariantCulture) + " points)";
        }

        private void Clear(string reason)
        {
            _base.Text = _quote.Text = _advBase.Text = _advQuote.Text = _atr.Text = _rawScores.Text = "";
            _gap.Text = "ENGINE GAP: --";
            _bias.Text = "BIAS: --";
            _execution.Text = "EXECUTION: --   CONFIDENCE: --";
            _gap.ForegroundColor = _bias.ForegroundColor = Heading;
            _status.Text = reason;
        }
    }
}
