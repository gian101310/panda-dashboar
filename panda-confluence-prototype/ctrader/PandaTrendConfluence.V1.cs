using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using cAlgo.API;
using cAlgo.API.Internals;

namespace cAlgo
{
    public enum TrendConfluenceRiskPlanVisibility
    {
        ReadyOnly,
        ContextReady,
        Always
    }

    internal sealed class TrendConfluenceV1FeedPair
    {
        [JsonPropertyName("symbol")] public string Symbol { get; set; }
        [JsonPropertyName("gap")] public double? Gap { get; set; }
        [JsonPropertyName("bias")] public string Bias { get; set; }
        [JsonPropertyName("hard_invalid")] public bool HardInvalid { get; set; }
        [JsonPropertyName("pl_zone")] public string PandaLineZone { get; set; }
        [JsonPropertyName("pl_g1_valid")] public bool PandaLinesValid { get; set; }
        [JsonPropertyName("box_h1_trend")] public string BoxH1Trend { get; set; }
        [JsonPropertyName("updated_at")] public string UpdatedAt { get; set; }
    }

    internal sealed class TrendConfluenceV1FeedEnvelope
    {
        [JsonPropertyName("schema_version")] public int SchemaVersion { get; set; }
        [JsonPropertyName("max_age_seconds")] public int MaxAgeSeconds { get; set; }
        [JsonPropertyName("status")] public string Status { get; set; }
        [JsonPropertyName("pairs")] public List<TrendConfluenceV1FeedPair> Pairs { get; set; }
    }

    [Indicator(IsOverlay = true, TimeZone = TimeZones.UTC, AccessRights = AccessRights.None)]
    public class PandaTrendConfluenceV1 : Indicator
    {
        [Parameter("License Token", DefaultValue = "", Group = "Panda Feed")]
        public string LicenseToken { get; set; }

        [Parameter("SuperTrend ATR period", DefaultValue = 10, MinValue = 2, MaxValue = 100, Group = "Trend")]
        public int AtrPeriod { get; set; }

        [Parameter("SuperTrend multiplier", DefaultValue = 3.0, MinValue = 0.1, MaxValue = 20, Step = 0.1, Group = "Trend")]
        public double Multiplier { get; set; }

        [Parameter("ADX period", DefaultValue = 14, MinValue = 2, MaxValue = 100, Group = "Trend")]
        public int AdxPeriod { get; set; }

        [Parameter("Swing length", DefaultValue = 3, MinValue = 2, MaxValue = 20, Group = "Structure")]
        public int SwingLength { get; set; }

        [Parameter("Level proximity (pips)", DefaultValue = 15, MinValue = 1, MaxValue = 100, Group = "H1 Pullback")]
        public double LevelProximityPips { get; set; }

        [Parameter("Level touch (pips)", DefaultValue = 2, MinValue = 0.5, MaxValue = 20, Group = "H1 Pullback")]
        public double LevelTouchPips { get; set; }

        [Parameter("M15 event expiry (bars)", DefaultValue = 3, MinValue = 1, MaxValue = 12, Group = "H1 Pullback")]
        public int M15EventExpiryBars { get; set; }

        [Parameter("Overextension (pips)", DefaultValue = 30, MinValue = 5, MaxValue = 200, Group = "H1 Pullback")]
        public double OverextensionPips { get; set; }

        [Parameter("Show risk/reward drawing", DefaultValue = true, Group = "Trade Plan")]
        public bool ShowRiskReward { get; set; }

        [Parameter("Plan preview mode", DefaultValue = TrendConfluenceRiskPlanVisibility.ContextReady, Group = "Trade Plan")]
        public TrendConfluenceRiskPlanVisibility PlanPreviewMode { get; set; }

        [Parameter("Plan lot size", DefaultValue = 0.01, MinValue = 0.01, MaxValue = 100, Step = 0.01, Group = "Trade Plan")]
        public double PlanLots { get; set; }

        [Parameter("H1 swing buffer (pips)", DefaultValue = 3, MinValue = 0, MaxValue = 50, Step = 0.5, Group = "Trade Plan")]
        public double SwingBufferPips { get; set; }

        [Parameter("Reward/Risk target", DefaultValue = 2.0, MinValue = 0.5, MaxValue = 10, Step = 0.25, Group = "Trade Plan")]
        public double RewardRiskTarget { get; set; }

        [Parameter("Maximum stop (pips)", DefaultValue = 60, MinValue = 5, MaxValue = 500, Group = "Trade Plan")]
        public double MaximumStopPips { get; set; }

        [Parameter("Drawing width (bars)", DefaultValue = 8, MinValue = 3, MaxValue = 50, Group = "Trade Plan")]
        public int RiskRewardWidthBars { get; set; }

        [Parameter("Show possible pullback area", DefaultValue = true, Group = "Pullback Area")]
        public bool ShowPullbackArea { get; set; }

        [Parameter("Minimum half-width (pips)", DefaultValue = 3, MinValue = 1, MaxValue = 50, Step = 0.5, Group = "Pullback Area")]
        public double PullbackMinimumPips { get; set; }

        [Parameter("H1 ATR width (%)", DefaultValue = 10, MinValue = 1, MaxValue = 100, Group = "Pullback Area")]
        public double PullbackAtrPercent { get; set; }

        [Parameter("Projection (H1 bars)", DefaultValue = 12, MinValue = 2, MaxValue = 72, Group = "Pullback Area")]
        public int PullbackProjectionBars { get; set; }

        [Parameter("Show panel", DefaultValue = true, Group = "Display")]
        public bool ShowPanel { get; set; }

        [Parameter("Show HH HL LH LL labels", DefaultValue = true, Group = "Display")]
        public bool ShowSwingLabels { get; set; }

        [Parameter("Show BOS CHoCH labels", DefaultValue = true, Group = "Display")]
        public bool ShowStructureEvents { get; set; }

        [Parameter("Show open FVG boxes", DefaultValue = true, Group = "Structure")]
        public bool ShowFvg { get; set; }

        [Parameter("Show FVG text labels", DefaultValue = true, Group = "Display")]
        public bool ShowFvgLabels { get; set; }

        [Parameter("Maximum open FVG boxes", DefaultValue = 8, MinValue = 1, MaxValue = 30, Group = "Structure")]
        public int MaxFvgBoxes { get; set; }

        [Parameter("Maximum structure labels", DefaultValue = 20, MinValue = 4, MaxValue = 60, Group = "Structure")]
        public int MaxStructureLabels { get; set; }

        [Output("Visibility Sentinel", LineColor = "Transparent", PlotType = PlotType.Line, Thickness = 1)]
        public IndicatorDataSeries VisibilitySentinel { get; set; }

        private sealed class TrendReading
        {
            public string Label;
            public int Direction;
            public double Strength;
            public double Adx;
            public int Consecutive;
            public double Line;
            public double Atr;
            public bool Ready;
        }

        private sealed class StructureReading
        {
            public int Direction;
            public string Event = "NONE";
            public double Level = double.NaN;
            public int EventIndex = -1;
            public readonly List<StructureMark> Marks = new List<StructureMark>();
            public readonly List<StructureMark> Events = new List<StructureMark>();
        }

        private sealed class StructureMark
        {
            public string Label;
            public int Index;
            public double Price;
            public int Direction;
        }

        private sealed class GapReading
        {
            public int Direction;
            public double Low;
            public double High;
            public int Index;
        }

        private sealed class LevelReading
        {
            public string Label;
            public double Price;
            public double DistancePips;
        }

        private sealed class PullbackDecision
        {
            public string Execution = "NONE";
            public string LineState = "UNAVAILABLE";
            public string LevelState = "UNAVAILABLE";
            public string State = "NO SETUP";
            public string Continuation = "NOT ASSESSED";
            public string Decision = "WAIT";
            public string Warning = "";
            public LevelReading Level;
        }

        private sealed class RiskPlan
        {
            public string Side;
            public string SwingLabel;
            public double Entry;
            public double Stop;
            public double Target;
            public double StopPips;
            public double RewardRisk;
            public double Lots;
            public string Status;
            public long TriggerKey;
            public bool Preview;
        }

        private sealed class PullbackZone
        {
            public string Side;
            public string Label;
            public double Anchor;
            public double Low;
            public double High;
            public double HalfWidthPips;
            public string State;
        }

        private readonly List<TrendReading> _readings = new List<TrendReading>();
        private Bars _m15;
        private Bars _h1;
        private Bars _h4;
        private Bars _d1;
        private Bars _dailyLevels;
        private Bars _weeklyLevels;
        private Bars _monthlyLevels;
        private ChartDraggable _draggable;
        private bool _minimized;
        private bool _showDetails;
        private DateTime _lastRefresh = DateTime.MinValue;
        private DateTime _lastFeedRequest = DateTime.MinValue;
        private DateTime _feedReceivedAt = DateTime.MinValue;
        private bool _feedRequestInFlight;
        private int _maxAgeSeconds = 600;
        private string _feedStatus = "CONNECTING";
        private string _pandaBias = "WAIT";
        private double? _pandaGap;
        private bool _hardInvalid;
        private string _pandaLineZone = "UNKNOWN";
        private bool _pandaLinesValid;
        private string _boxH1Trend = "UNKNOWN";
        private RiskPlan _riskPlan;
        private string _planDrawError = "";
        private const string RiskRewardObjectName = "PandaTrendConfluenceV1.RiskReward";
        private PullbackZone _pullbackZone;
        private const string PullbackZoneObjectName = "PandaTrendConfluenceV1.PullbackZone";
        private const string PullbackZoneLabelName = "PandaTrendConfluenceV1.PullbackZoneLabel";
        private string _pandaUpdatedAt = "";
        private const string FeedEndpoint = "https://pandaengine.app/api/trend-confluence-feed";
        private const string PanelXKey = "Panda Trend Confluence V1 Panel X";
        private const string PanelYKey = "Panda Trend Confluence V1 Panel Y";
        private const double MarketMinH1Strength = 65;
        private const double MarketMinH1Adx = 25;
        private const double MarketMinM15Strength = 50;
        private const string MinimizedKey = "Panda Trend Confluence V1 Panel Minimized";
        private static readonly Color Buy = Color.FromHex("#00ff9f");
        private static readonly Color Sell = Color.FromHex("#ff4d6d");
        private static readonly Color Accent = Color.FromHex("#00b4ff");
        private static readonly Color Warn = Color.FromHex("#ffd166");
        private static readonly Color Muted = Color.FromHex("#9aa4b2");
        private static readonly Color RiskDrawingColor = Color.FromArgb(255, 254, 0, 0);
        private static readonly Color RewardDrawingColor = Color.FromArgb(255, 1, 255, 1);

        protected override void Initialize()
        {
            _m15 = MarketData.GetBars(TimeFrame.Minute15, SymbolName);
            _h1 = MarketData.GetBars(TimeFrame.Hour, SymbolName);
            _h4 = MarketData.GetBars(TimeFrame.Hour4, SymbolName);
            _d1 = MarketData.GetBars(TimeFrame.Daily, SymbolName);
            _dailyLevels = MarketData.GetBars(TimeFrame.Daily, SymbolName);
            _weeklyLevels = MarketData.GetBars(TimeFrame.Weekly, SymbolName);
            _monthlyLevels = MarketData.GetBars(TimeFrame.Monthly, SymbolName);
            _draggable = Chart.Draggables.Add();
            _draggable.ShowGrip = true;
            _minimized = LocalStorage.GetString(MinimizedKey, LocalStorageScope.Instance) == "1";
            RestorePanelLocation();
            _draggable.LocationChanged += OnPanelLocationChanged;
            RefreshFeed();
            Refresh();
            Timer.TimerTick += OnTimerTick;
            Timer.Start(2);
        }

        public override void Calculate(int index)
        {
            VisibilitySentinel[index] = double.NaN;
            UpdatePanelVisibility();
            if (IsLastBar && Server.Time - _lastRefresh >= TimeSpan.FromSeconds(2))
                Refresh();
        }

        private void OnTimerTick()
        {
            UpdatePanelVisibility();
            RefreshFeed();
            Refresh();
        }

        private void UpdatePanelVisibility()
        {
            if (_draggable == null) return;
            bool indicatorVisible = true;
            try
            {
                var chartIndicator = ChartIndicators[InstanceId];
                if (chartIndicator != null && chartIndicator.LineOutputs.Count > 0)
                    indicatorVisible = chartIndicator.LineOutputs[0].IsVisible;
            }
            catch { }
            _draggable.IsVisible = ShowPanel && indicatorVisible;
        }

        private void RefreshFeed()
        {
            if (_feedRequestInFlight || DateTime.UtcNow - _lastFeedRequest < TimeSpan.FromSeconds(60)) return;
            var token = (LicenseToken ?? string.Empty).Trim();
            if (token.Length == 0)
            {
                _feedStatus = "AUTH REQUIRED";
                return;
            }
            _feedRequestInFlight = true;
            _lastFeedRequest = DateTime.UtcNow;
            var request = new HttpRequest(new Uri(FeedEndpoint));
            request.Method = HttpMethod.Get;
            request.Timeout = TimeSpan.FromSeconds(12);
            request.Headers.Add("x-panda-confluence-token", token);
            request.Headers.Add("x-panda-account-number", Account.Number.ToString());
            request.Headers.Add("x-panda-product-code", "ctrader_trend_confluence_v1");
            try
            {
                Http.SendAsync(request, response => BeginInvokeOnMainThread(() => CompleteFeed(response)));
            }
            catch
            {
                _feedRequestInFlight = false;
                if (_feedReceivedAt == DateTime.MinValue) _feedStatus = "ERROR";
            }
        }

        private void CompleteFeed(HttpResponse response)
        {
            _feedRequestInFlight = false;
            try
            {
                if (response == null || !response.IsSuccessful)
                {
                    _feedStatus = "ERROR";
                    if (response != null && !string.IsNullOrWhiteSpace(response.Body))
                    {
                        try { _feedStatus = JsonSerializer.Deserialize<TrendConfluenceV1FeedEnvelope>(response.Body)?.Status ?? "ERROR"; }
                        catch { }
                    }
                    return;
                }
                var envelope = JsonSerializer.Deserialize<TrendConfluenceV1FeedEnvelope>(response.Body,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                if (envelope == null || envelope.SchemaVersion != 1 || envelope.Pairs == null)
                    throw new InvalidOperationException("Unsupported Panda feed");
                var symbol = NormalizeSymbol(SymbolName);
                var pair = envelope.Pairs.FirstOrDefault(item =>
                    string.Equals(item.Symbol, symbol, StringComparison.OrdinalIgnoreCase));
                if (pair == null) throw new InvalidOperationException("Symbol missing from Panda feed");
                _pandaBias = (pair.Bias ?? "WAIT").Trim().ToUpperInvariant();
                if (_pandaBias != "BUY" && _pandaBias != "SELL") _pandaBias = "WAIT";
                _pandaGap = pair.Gap;
                _hardInvalid = pair.HardInvalid;
                _pandaLineZone = (pair.PandaLineZone ?? "UNKNOWN").Trim().ToUpperInvariant();
                _pandaLinesValid = pair.PandaLinesValid;
                _boxH1Trend = (pair.BoxH1Trend ?? "UNKNOWN").Trim().ToUpperInvariant();
                _pandaUpdatedAt = pair.UpdatedAt ?? "";
                _maxAgeSeconds = envelope.MaxAgeSeconds > 0 ? envelope.MaxAgeSeconds : 600;
                _feedReceivedAt = DateTime.UtcNow;
                _feedStatus = "LIVE";
                Refresh();
            }
            catch
            {
                _feedStatus = "ERROR";
            }
        }

        private static string NormalizeSymbol(string value)
        {
            var letters = new string((value ?? string.Empty).ToUpperInvariant().Where(char.IsLetter).ToArray());
            string[] pairs = { "AUDCAD", "AUDJPY", "AUDNZD", "AUDUSD", "CADJPY", "CHFJPY", "EURAUD",
                "EURCAD", "EURGBP", "EURJPY", "EURNZD", "EURUSD", "GBPAUD", "GBPCAD", "GBPJPY",
                "GBPNZD", "GBPUSD", "NZDCAD", "NZDJPY", "NZDUSD", "USDCAD", "USDCHF", "USDJPY" };
            var matches = pairs.Where(letters.Contains).ToArray();
            return matches.Length == 1 ? matches[0] : string.Empty;
        }

        private string EffectiveFeedStatus()
        {
            if (_feedStatus != "LIVE") return _feedStatus;
            return DateTime.UtcNow - _feedReceivedAt > TimeSpan.FromSeconds(_maxAgeSeconds) ? "STALE" : "LIVE";
        }

        private void Refresh()
        {
            _lastRefresh = Server.Time;
            _readings.Clear();
            _readings.Add(EvaluateTrend("M15", _m15));
            _readings.Add(EvaluateTrend("H1", _h1));
            _readings.Add(EvaluateTrend("H4", _h4));
            _readings.Add(EvaluateTrend("D1", _d1));
            var chartStructure = EvaluateStructure(Bars);
            var h1Structure = EvaluateStructure(_h1);
            var m15Structure = EvaluateStructure(_m15);
            var gaps = OpenGaps(Bars);
            var gap = gaps.Count == 0 ? null : gaps[gaps.Count - 1];
            DrawStructure(chartStructure);
            DrawGaps(gaps);
            double panelX = _draggable.X;
            double panelY = _draggable.Y;
            _draggable.Child = BuildPanel(h1Structure, m15Structure, gap);
            _draggable.X = panelX;
            _draggable.Y = panelY;
            UpdatePanelVisibility();
        }

        private void RestorePanelLocation()
        {
            double x, y;
            var savedX = LocalStorage.GetString(PanelXKey, LocalStorageScope.Instance);
            var savedY = LocalStorage.GetString(PanelYKey, LocalStorageScope.Instance);
            _draggable.X = double.TryParse(savedX, NumberStyles.Float, CultureInfo.InvariantCulture, out x) ? x : 12;
            _draggable.Y = double.TryParse(savedY, NumberStyles.Float, CultureInfo.InvariantCulture, out y) ? y : 12;
        }

        private void OnPanelLocationChanged(ChartDraggableLocationChangedEventArgs args)
        {
            LocalStorage.SetString(PanelXKey, args.Draggable.X.ToString(CultureInfo.InvariantCulture), LocalStorageScope.Instance);
            LocalStorage.SetString(PanelYKey, args.Draggable.Y.ToString(CultureInfo.InvariantCulture), LocalStorageScope.Instance);
            LocalStorage.Flush(LocalStorageScope.Instance);
        }

        private TrendReading EvaluateTrend(string label, Bars bars)
        {
            var reading = new TrendReading { Label = label };
            if (bars == null || bars.Count < Math.Max(AtrPeriod + 15, AdxPeriod * 2 + 2)) return reading;
            int last = bars.Count - 2;
            var atr = new double[bars.Count];
            double seed = 0;
            for (int i = 1; i <= AtrPeriod; i++) seed += TrueRange(bars, i);
            atr[AtrPeriod] = seed / AtrPeriod;
            for (int i = AtrPeriod + 1; i <= last; i++)
                atr[i] = ((atr[i - 1] * (AtrPeriod - 1)) + TrueRange(bars, i)) / AtrPeriod;

            double upper = double.NaN;
            double lower = double.NaN;
            double line = double.NaN;
            int direction = 1;
            int consecutive = 0;
            for (int i = AtrPeriod; i <= last; i++)
            {
                double middle = (bars.HighPrices[i] + bars.LowPrices[i]) / 2.0;
                double basicUpper = middle + Multiplier * atr[i];
                double basicLower = middle - Multiplier * atr[i];
                if (double.IsNaN(upper) || basicUpper < upper || bars.ClosePrices[i - 1] > upper) upper = basicUpper;
                if (double.IsNaN(lower) || basicLower > lower || bars.ClosePrices[i - 1] < lower) lower = basicLower;
                int next = direction;
                if (direction < 0 && bars.ClosePrices[i] > upper) next = 1;
                else if (direction > 0 && bars.ClosePrices[i] < lower) next = -1;
                consecutive = next == direction ? consecutive + 1 : 1;
                direction = next;
                line = direction > 0 ? lower : upper;
            }

            double distance = atr[last] <= 0 ? 0 : Math.Min(30, Math.Abs(bars.ClosePrices[last] - line) / atr[last] * 15);
            double continuity = Math.Min(40, Math.Log(consecutive + 1, 1.5) * 10);
            double old = bars.ClosePrices[last - 10];
            double move = direction > 0
                ? (bars.ClosePrices[last] - old) / old
                : (old - bars.ClosePrices[last]) / old;
            double momentum = Math.Min(30, Math.Max(0, move * 100 * 50));
            reading.Direction = direction;
            reading.Strength = Math.Min(100, Math.Max(0, distance + continuity + momentum));
            reading.Adx = CalculateAdx(bars, last, AdxPeriod);
            reading.Consecutive = consecutive;
            reading.Line = line;
            reading.Atr = atr[last];
            reading.Ready = true;
            return reading;
        }

        private static double TrueRange(Bars bars, int index)
        {
            return Math.Max(bars.HighPrices[index] - bars.LowPrices[index],
                Math.Max(Math.Abs(bars.HighPrices[index] - bars.ClosePrices[index - 1]),
                    Math.Abs(bars.LowPrices[index] - bars.ClosePrices[index - 1])));
        }

        private static double CalculateAdx(Bars bars, int last, int period)
        {
            if (last < period * 2) return 0;
            double smoothedTr = 0, smoothedPlus = 0, smoothedMinus = 0;
            var dx = new double[last + 1];
            for (int i = 1; i <= last; i++)
            {
                double up = bars.HighPrices[i] - bars.HighPrices[i - 1];
                double down = bars.LowPrices[i - 1] - bars.LowPrices[i];
                double plus = up > down && up > 0 ? up : 0;
                double minus = down > up && down > 0 ? down : 0;
                double tr = TrueRange(bars, i);
                if (i <= period)
                {
                    smoothedTr += tr;
                    smoothedPlus += plus;
                    smoothedMinus += minus;
                }
                else
                {
                    smoothedTr = smoothedTr - smoothedTr / period + tr;
                    smoothedPlus = smoothedPlus - smoothedPlus / period + plus;
                    smoothedMinus = smoothedMinus - smoothedMinus / period + minus;
                }
                if (i < period || smoothedTr <= 0) continue;
                double plusDi = 100 * smoothedPlus / smoothedTr;
                double minusDi = 100 * smoothedMinus / smoothedTr;
                double sum = plusDi + minusDi;
                dx[i] = sum <= 0 ? 0 : 100 * Math.Abs(plusDi - minusDi) / sum;
            }
            int first = period * 2 - 1;
            double adx = 0;
            for (int i = period; i <= first; i++) adx += dx[i];
            adx /= period;
            for (int i = first + 1; i <= last; i++) adx = ((adx * (period - 1)) + dx[i]) / period;
            return adx;
        }

        private StructureReading EvaluateStructure(Bars bars)
        {
            var result = new StructureReading();
            int last = bars.Count - 2;
            int start = Math.Max(SwingLength * 2, last - 400);
            double swingHigh = double.NaN, swingLow = double.NaN;
            double previousPivotHigh = double.NaN, previousPivotLow = double.NaN;
            bool highBroken = false, lowBroken = false;
            for (int i = start; i <= last; i++)
            {
                int center = i - SwingLength;
                if (center >= SwingLength)
                {
                    bool high = true, low = true;
                    for (int j = center - SwingLength; j <= center + SwingLength; j++)
                    {
                        if (j == center) continue;
                        if (bars.HighPrices[j] >= bars.HighPrices[center]) high = false;
                        if (bars.LowPrices[j] <= bars.LowPrices[center]) low = false;
                    }
                    if (high)
                    {
                        swingHigh = bars.HighPrices[center];
                        var label = double.IsNaN(previousPivotHigh) ? "SH" : swingHigh > previousPivotHigh ? "HH" : "LH";
                        result.Marks.Add(new StructureMark { Label = label, Index = center, Price = swingHigh, Direction = -1 });
                        previousPivotHigh = swingHigh;
                        highBroken = false;
                    }
                    if (low)
                    {
                        swingLow = bars.LowPrices[center];
                        var label = double.IsNaN(previousPivotLow) ? "SL" : swingLow > previousPivotLow ? "HL" : "LL";
                        result.Marks.Add(new StructureMark { Label = label, Index = center, Price = swingLow, Direction = 1 });
                        previousPivotLow = swingLow;
                        lowBroken = false;
                    }
                }
                if (!double.IsNaN(swingHigh) && !highBroken && bars.ClosePrices[i] > swingHigh)
                {
                    result.Event = result.Direction < 0 ? "CHOCH UP" : "BOS UP";
                    result.Direction = 1;
                    result.Level = swingHigh;
                    result.EventIndex = i;
                    result.Events.Add(new StructureMark { Label = result.Event, Index = i, Price = swingHigh, Direction = 1 });
                    highBroken = true;
                }
                if (!double.IsNaN(swingLow) && !lowBroken && bars.ClosePrices[i] < swingLow)
                {
                    result.Event = result.Direction > 0 ? "CHOCH DOWN" : "BOS DOWN";
                    result.Direction = -1;
                    result.Level = swingLow;
                    result.EventIndex = i;
                    result.Events.Add(new StructureMark { Label = result.Event, Index = i, Price = swingLow, Direction = -1 });
                    lowBroken = true;
                }
            }
            return result;
        }

        private List<GapReading> OpenGaps(Bars bars)
        {
            var gaps = new List<GapReading>();
            int last = bars.Count - 2;
            for (int i = Math.Max(2, last - 250); i <= last; i++)
            {
                if (bars.LowPrices[i] > bars.HighPrices[i - 2])
                {
                    double low = bars.HighPrices[i - 2], high = bars.LowPrices[i];
                    bool filled = false;
                    for (int j = i + 1; j <= last; j++) if (bars.LowPrices[j] <= low) { filled = true; break; }
                    if (!filled) gaps.Add(new GapReading { Direction = 1, Low = low, High = high, Index = i });
                }
                if (bars.HighPrices[i] < bars.LowPrices[i - 2])
                {
                    double low = bars.HighPrices[i], high = bars.LowPrices[i - 2];
                    bool filled = false;
                    for (int j = i + 1; j <= last; j++) if (bars.HighPrices[j] >= high) { filled = true; break; }
                    if (!filled) gaps.Add(new GapReading { Direction = -1, Low = low, High = high, Index = i });
                }
            }
            return gaps.Skip(Math.Max(0, gaps.Count - MaxFvgBoxes)).ToList();
        }

        private void DrawStructure(StructureReading structure)
        {
            for (int i = 0; i < 60; i++)
            {
                Chart.RemoveObject("PandaTrendConfluenceV1.Pivot." + i);
                Chart.RemoveObject("PandaTrendConfluenceV1.Event." + i);
            }
            var pivots = ShowSwingLabels
                ? structure.Marks.Skip(Math.Max(0, structure.Marks.Count - MaxStructureLabels)).ToList()
                : new List<StructureMark>();
            for (int i = 0; i < pivots.Count; i++)
            {
                var mark = pivots[i];
                var text = Chart.DrawText("PandaTrendConfluenceV1.Pivot." + i, mark.Label, mark.Index, mark.Price,
                    mark.Direction > 0 ? Buy : Sell);
                text.FontSize = 10;
                text.IsBold = true;
                text.VerticalAlignment = mark.Direction > 0 ? VerticalAlignment.Bottom : VerticalAlignment.Top;
            }
            var events = ShowStructureEvents
                ? structure.Events.Skip(Math.Max(0, structure.Events.Count - MaxStructureLabels)).ToList()
                : new List<StructureMark>();
            for (int i = 0; i < events.Count; i++)
            {
                var mark = events[i];
                var text = Chart.DrawText("PandaTrendConfluenceV1.Event." + i, mark.Label, mark.Index, mark.Price,
                    mark.Direction > 0 ? Buy : Sell);
                text.FontSize = 11;
                text.IsBold = true;
            }
        }

        private void DrawGaps(List<GapReading> gaps)
        {
            for (int i = 0; i < 30; i++)
            {
                Chart.RemoveObject("PandaTrendConfluenceV1.Fvg." + i);
                Chart.RemoveObject("PandaTrendConfluenceV1.FvgLabel." + i);
            }
            if (!ShowFvg) return;
            for (int i = 0; i < gaps.Count; i++)
            {
                var gap = gaps[i];
                var color = gap.Direction > 0 ? Buy : Sell;
                var rectangle = Chart.DrawRectangle("PandaTrendConfluenceV1.Fvg." + i, gap.Index - 2, gap.High, Bars.Count - 1, gap.Low, color);
                rectangle.IsFilled = true;
                rectangle.Color = Color.FromArgb(35, color);
                if (ShowFvgLabels)
                {
                    var label = Chart.DrawText("PandaTrendConfluenceV1.FvgLabel." + i,
                        gap.Direction > 0 ? "BULL FVG" : "BEAR FVG", gap.Index - 2, (gap.Low + gap.High) / 2, color);
                    label.FontSize = 9;
                    label.IsBold = true;
                }
            }
        }

        private ControlBase BuildPanel(StructureReading h1Structure, StructureReading m15Structure, GapReading gap)
        {
            var result = EvaluateH1Pullback(h1Structure, m15Structure);
            UpdatePullbackZone(result);
            UpdateRiskPlan(result, h1Structure, m15Structure);
            string displayDecision = result.State == "RANGE — NO TRADE" ? "WAIT • H1 RANGE FILTER" :
                result.State == "MARKET ELIGIBLE" ? _pandaBias + " MARKET CONTEXT • REVIEW RISK" : PlannerDecision(result.Decision);
            var panel = new StackPanel
            {
                Width = _minimized ? 235 : _showDetails ? 800 : 400,
                BackgroundColor = Color.FromArgb(235, Color.FromHex("#070b12")),
                Margin = 4
            };
            var header = new Grid(1, 3) { Margin = 5 };
            header.AddChild(Text("PANDA TREND CONFLUENCE  •  v1", Accent, 13, true), 0, 0);
            if (!_minimized)
            {
                var detailsToggle = new Button { Text = _showDetails ? "Simple" : "Details", Width = 58, Height = 22, Margin = 1 };
                detailsToggle.Click += ToggleDetails;
                header.AddChild(detailsToggle, 0, 1);
            }
            var minimize = new Button { Text = _minimized ? "+" : "−", Width = 28, Height = 22, Margin = 1 };
            minimize.Click += ToggleMinimize;
            header.AddChild(minimize, 0, 2);
            panel.AddChild(header);
            if (_minimized)
            {
                panel.AddChild(Text(SymbolName + "  " + displayDecision, DecisionColor(displayDecision), 12, true));
                return new Border { Child = panel, BorderColor = Color.FromHex("#1a2940"), BorderThickness = 1, CornerRadius = 5 };
            }
            if (!_showDetails)
            {
                int side = _pandaBias == "BUY" ? 1 : _pandaBias == "SELL" ? -1 : 0;
                Color directionColor = side > 0 ? Buy : side < 0 ? Sell : Muted;
                bool feedLive = EffectiveFeedStatus() == "LIVE" && !_hardInvalid;
                var h1Trend = _readings.First(item => item.Label == "H1");
                var m15Trend = _readings.First(item => item.Label == "M15");
                bool h1Strong = feedLive && side != 0 && h1Trend.Ready && h1Trend.Direction == side &&
                    h1Trend.Strength >= MarketMinH1Strength && h1Trend.Adx >= MarketMinH1Adx;
                bool m15Momentum = feedLive && side != 0 && m15Trend.Ready && m15Trend.Direction == side &&
                    m15Trend.Strength >= MarketMinM15Strength;
                bool h1Aligned = feedLive && side != 0 && h1Structure.Direction == side;
                int eventAge = _m15 == null || m15Structure.EventIndex < 0 ? int.MaxValue :
                    (_m15.Count - 2) - m15Structure.EventIndex;
                bool m15Fresh = eventAge >= 0 && eventAge <= M15EventExpiryBars;
                bool m15Aligned = feedLive && side != 0 && m15Fresh && m15Structure.Direction == side;
                string m15Event = m15Structure.EventIndex < 0 ? "NONE" :
                    m15Structure.Event + (m15Fresh ? "  FRESH" : "  OLD");
                string compactGapText = _pandaGap.HasValue ? _pandaGap.Value.ToString("+0.0;-0.0;0.0") : "—";
                string level = result.Level == null ? "UNAVAILABLE" : result.Level.Label + "  " + result.LevelState;
                string status = PlainDecision(result);
                bool strongAlignment = result.Execution == "MARKET" ? result.State == "MARKET ELIGIBLE" :
                    h1Strong && h1Aligned && m15Aligned && result.LineState == "CONFIRMED";
                bool pullbackReady = status == _pandaBias + " PULLBACK READY";

                panel.AddChild(Text(SymbolName + "  •  " + EffectiveFeedStatus(), Muted, 10, false));
                panel.AddChild(Row("PANDA", _pandaBias + "  GAP " + compactGapText, feedLive && side != 0 ? directionColor : Warn));
                panel.AddChild(Row("H1 TREND", h1Trend.Ready ?
                    (h1Trend.Direction > 0 ? "UP" : "DOWN") + "  " + h1Trend.Strength.ToString("0") + "%  ADX " + h1Trend.Adx.ToString("0") : "LOADING",
                    h1Strong ? directionColor : Warn));
                panel.AddChild(Row("M15 MOM", m15Trend.Ready ?
                    (m15Trend.Direction > 0 ? "UP" : "DOWN") + "  " + m15Trend.Strength.ToString("0") + "%" : "LOADING",
                    m15Momentum ? directionColor : Warn));
                panel.AddChild(Row("H1 STRUCT", h1Structure.Event, h1Aligned ? directionColor : Warn));
                panel.AddChild(Row("M15 EVENT", result.Execution == "MARKET" ? m15Event + "  INFO" : m15Event,
                    result.Execution == "MARKET" ? m15Fresh && m15Structure.Direction == -side ? Warn : Muted :
                    m15Aligned ? directionColor : Warn));
                panel.AddChild(Row("LINES", result.LineState, feedLive && result.LineState == "CONFIRMED" ? directionColor : Warn));
                panel.AddChild(Row("LEVEL", result.Execution == "MARKET" ? "INFO • " + level : level,
                    result.Execution == "MARKET" ? Muted : feedLive && result.LevelState == "REJECTED" ? directionColor : Warn));
                panel.AddChild(Row("ALIGNMENT", strongAlignment ? "STRONG " + _pandaBias : "CHECK AMBER ROWS", strongAlignment ? directionColor : Warn));
                panel.AddChild(Row("DECISION", status, (pullbackReady || strongAlignment && status.StartsWith(_pandaBias + " ")) ? directionColor : Warn));
                panel.AddChild(Row("NEXT", NextStep(result), Muted));
                panel.AddChild(Text("H1 % = trend score, not odds • v1 places no orders", Muted, 9, false));
                return new Border { Child = panel, BorderColor = Color.FromHex("#1a2940"), BorderThickness = 1, CornerRadius = 5 };
            }
            var columns = new Grid(1, 2);
            columns.Columns[0].SetWidthInPixels(400);
            columns.Columns[1].SetWidthInPixels(400);
            var context = new StackPanel { Width = 400 };
            var details = new StackPanel { Width = 400 };
            columns.AddChild(context, 0, 0);
            columns.AddChild(details, 0, 1);
            panel.AddChild(columns);
            context.AddChild(Text(SymbolName + "  |  confirmed candles", Muted, 10, false));
            string gapText = _pandaGap.HasValue ? _pandaGap.Value.ToString("+0.0;-0.0;0.0") : "—";
            context.AddChild(Row("PANDA BIAS", gapText + "  " + _pandaBias, BiasColor()));
            context.AddChild(Row("FEED", EffectiveFeedStatus(), EffectiveFeedStatus() == "LIVE" ? Buy : Warn));
            context.AddChild(Row("PANDA LINES", _pandaLineZone + " / " + result.LineState,
                result.LineState == "CONFIRMED" ? Buy : result.LineState == "UNAVAILABLE" ? Muted : Sell));
            string levelText = result.Level == null ? "UNAVAILABLE" : result.Level.Label + "  " + result.Level.Price.ToString("F" + Symbol.Digits) + "  " + result.Level.DistancePips.ToString("0") + "p";
            context.AddChild(Row("PANDA LEVEL", levelText, result.Level == null ? Muted : Warn));
            context.AddChild(Row("LEVEL STATE", result.LevelState, result.LevelState == "REJECTED" ? Buy : result.LevelState == "AT LEVEL" ? Warn : Muted));
            context.AddChild(Row("PANDA STATE", result.State, PullbackColor(result.State)));
            context.AddChild(Row("GAP PATH", result.Execution == "MARKET" ? "9+ MARKET CONTEXT" :
                result.Execution == "PULLBACK" ? "5–8 PULLBACK LEVEL" : "BELOW 5 • NONE",
                result.Execution == "MARKET" ? Buy : result.Execution == "PULLBACK" ? Warn : Muted));
            context.AddChild(Row("DECISION", PlainDecision(result), result.Decision.EndsWith("READY") && _riskPlan != null && _riskPlan.Status == "ACCEPTABLE" ? Buy : Warn));
            context.AddChild(Row("NEXT", NextStep(result), Muted));
            context.AddChild(Row("PLAN DRAW", PlanDrawStatus(result, h1Structure), _riskPlan != null && string.IsNullOrEmpty(_planDrawError) ? Buy : Warn));
            context.AddChild(Text("H1 % = trend score, not odds. ADX = trend strength, not %.", Muted, 9, false));
            var h1 = _readings.First(item => item.Label == "H1");
            context.AddChild(Row("H1", h1.Ready ? (h1.Direction > 0 ? "UP" : "DOWN") + "  " + h1.Strength.ToString("0") + "%  ADX " + h1.Adx.ToString("0") : "LOADING",
                !h1.Ready ? Warn : h1.Direction > 0 ? Buy : Sell));
            var m15 = _readings.First(item => item.Label == "M15");
            context.AddChild(Row("ENTRY M15", m15.Ready ? (m15.Direction > 0 ? "UP " : "DOWN ") + m15.Strength.ToString("0") + "%" : "LOADING",
                !m15.Ready ? Warn : m15.Direction > 0 ? Buy : Sell));
            details.AddChild(Row("H1 STRUCT", h1Structure.Event, h1Structure.Direction > 0 ? Buy : h1Structure.Direction < 0 ? Sell : Muted));
            details.AddChild(Row("M15 EVENT", m15Structure.Event, m15Structure.Direction > 0 ? Buy : m15Structure.Direction < 0 ? Sell : Muted));
            details.AddChild(Row("FVG (INFO)", gap == null ? "NONE" : gap.Direction > 0 ? "BULLISH OPEN" : "BEARISH OPEN", gap == null ? Muted : gap.Direction > 0 ? Buy : Sell));
            details.AddChild(Row("CONTINUATION", result.Continuation, result.Continuation == "STRONG" ? Buy : result.Continuation == "MODERATE" ? Warn : Muted));
            if (_pullbackZone != null)
            {
                details.AddChild(Row("PB AREA", _pullbackZone.Label + "  " + _pullbackZone.Low.ToString("F" + Symbol.Digits) + "–" + _pullbackZone.High.ToString("F" + Symbol.Digits), Accent));
                details.AddChild(Row("PB ZONE", _pullbackZone.State, _pullbackZone.State == "ZONE FAILED" ? Sell : _pullbackZone.State.StartsWith("INSIDE") ? Warn : Accent));
            }
            if (_riskPlan != null)
            {
                details.AddChild(Row("PLAN TYPE", _riskPlan.Preview ? "PREVIEW — NOT READY" : "CONFIRMED", _riskPlan.Preview ? Warn : Buy));
                details.AddChild(Row("PLAN ENTRY", _riskPlan.Entry.ToString("F" + Symbol.Digits), Accent));
                details.AddChild(Row("H1 SWING SL", _riskPlan.SwingLabel + "  " + _riskPlan.Stop.ToString("F" + Symbol.Digits), Sell));
                details.AddChild(Row("STOP WIDTH", _riskPlan.StopPips.ToString("0.0") + " pips", _riskPlan.Status == "ACCEPTABLE" ? Buy : Sell));
                details.AddChild(Row("TARGET", _riskPlan.Target.ToString("F" + Symbol.Digits) + "  " + _riskPlan.RewardRisk.ToString("0.00") + "R", Buy));
                details.AddChild(Row("LOT SIZE", _riskPlan.Lots.ToString("0.00") + " lots", Accent));
                details.AddChild(Row("PLAN STATUS", _riskPlan.Status, _riskPlan.Status == "ACCEPTABLE" ? Buy : Sell));
            }
            if (!string.IsNullOrEmpty(result.Warning)) details.AddChild(Text(result.Warning, Warn, 10, true));
            details.AddChild(Text(displayDecision, DecisionColor(displayDecision), 16, true));
            details.AddChild(Text("Updated " + ShortUpdatedAt() + " • no orders • scoring unchanged", Muted, 9, false));
            return new Border { Child = panel, BorderColor = Color.FromHex("#1a2940"), BorderThickness = 1, CornerRadius = 5 };
        }

        private void ToggleMinimize(ButtonClickEventArgs args)
        {
            _minimized = !_minimized;
            LocalStorage.SetString(MinimizedKey, _minimized ? "1" : "0", LocalStorageScope.Instance);
            LocalStorage.Flush(LocalStorageScope.Instance);
            Refresh();
        }

        private void ToggleDetails(ButtonClickEventArgs args)
        {
            _showDetails = !_showDetails;
            Refresh();
        }

        private List<TrendReading> ContextReadings()
        {
            return _readings.Where(item => item.Ready && item.Label != "M15").ToList();
        }

        private string ShortUpdatedAt()
        {
            DateTime value;
            return DateTime.TryParse(_pandaUpdatedAt, out value) ? value.ToUniversalTime().ToString("HH:mm 'UTC'") : "—";
        }

        private string GapExecution()
        {
            if (!_pandaGap.HasValue) return "NONE";
            double value = Math.Abs(_pandaGap.Value);
            return value >= 9 ? "MARKET" : value >= 5 ? "PULLBACK" : "NONE";
        }

        private bool FeedLinesConfirmed()
        {
            return _pandaLinesValid && ((_pandaBias == "BUY" && _pandaLineZone == "ABOVE") ||
                (_pandaBias == "SELL" && _pandaLineZone == "BELOW"));
        }

        private List<LevelReading> PreviousLevels()
        {
            var levels = new List<LevelReading>();
            AddPreviousLevels(levels, _dailyLevels, "PDH", "PDL");
            AddPreviousLevels(levels, _weeklyLevels, "PWH", "PWL");
            AddPreviousLevels(levels, _monthlyLevels, "PMH", "PML");
            return levels;
        }

        private static void AddPreviousLevels(List<LevelReading> target, Bars bars, string highLabel, string lowLabel)
        {
            if (bars == null || bars.Count < 2) return;
            int index = bars.Count - 2;
            double high = bars.HighPrices[index], low = bars.LowPrices[index];
            if (high > 0) target.Add(new LevelReading { Label = highLabel, Price = high });
            if (low > 0) target.Add(new LevelReading { Label = lowLabel, Price = low });
        }

        private LevelReading NearestDirectionalLevel(double price, int side)
        {
            double tolerance = LevelTouchPips * Symbol.PipSize;
            var candidates = PreviousLevels().Where(level => side > 0 ? level.Price <= price + tolerance : level.Price >= price - tolerance)
                .OrderBy(level => Math.Abs(level.Price - price)).ToList();
            if (candidates.Count == 0) return null;
            var result = candidates[0];
            result.DistancePips = Math.Abs(result.Price - price) / Symbol.PipSize;
            return result;
        }

        private bool LevelWasTouched(LevelReading level, int side)
        {
            if (level == null || _h1 == null || _h1.Count < 3) return false;
            double tolerance = LevelTouchPips * Symbol.PipSize;
            int last = _h1.Count - 2;
            for (int i = Math.Max(0, last - 5); i <= last; i++)
            {
                if (side > 0 && _h1.LowPrices[i] <= level.Price + tolerance) return true;
                if (side < 0 && _h1.HighPrices[i] >= level.Price - tolerance) return true;
            }
            return false;
        }

        private bool RejectionConfirmed(LevelReading level, int side)
        {
            if (level == null || _h1 == null || _h1.Count < 2) return false;
            int last = _h1.Count - 2;
            double clearance = LevelTouchPips * Symbol.PipSize;
            return side > 0
                ? _h1.ClosePrices[last] > _h1.OpenPrices[last] && _h1.ClosePrices[last] > level.Price + clearance
                : _h1.ClosePrices[last] < _h1.OpenPrices[last] && _h1.ClosePrices[last] < level.Price - clearance;
        }

        private double FollowLine(Bars bars)
        {
            const int bbPeriod = 21, atrPeriod = 5;
            if (bars == null || bars.Count < bbPeriod + 3) return double.NaN;
            int last = bars.Count - 2;
            double line = bars.ClosePrices[Math.Max(0, bbPeriod - 1)];
            for (int i = bbPeriod; i <= last; i++)
            {
                int previous = i - 1;
                double sum = 0;
                for (int j = previous - bbPeriod + 1; j <= previous; j++) sum += bars.ClosePrices[j];
                double mean = sum / bbPeriod, variance = 0;
                for (int j = previous - bbPeriod + 1; j <= previous; j++) variance += Math.Pow(bars.ClosePrices[j] - mean, 2);
                double deviation = Math.Sqrt(variance / bbPeriod);
                double atr = 0;
                for (int j = i - atrPeriod + 1; j <= i; j++) atr += TrueRange(bars, j);
                atr /= atrPeriod;
                int signal = bars.ClosePrices[previous] > mean + deviation ? 1 : bars.ClosePrices[previous] < mean - deviation ? -1 : 0;
                if (signal > 0) line = Math.Max(bars.LowPrices[i] - atr, line);
                else if (signal < 0) line = Math.Min(bars.HighPrices[i] + atr, line);
            }
            return line;
        }

        private PullbackDecision EvaluateH1Pullback(StructureReading h1Structure, StructureReading m15Structure)
        {
            var result = new PullbackDecision { Execution = GapExecution() };
            string feed = EffectiveFeedStatus();
            if (feed != "LIVE") { result.State = "DATA — " + feed; return result; }
            if (_hardInvalid) { result.State = "SETUP INVALIDATED"; result.Decision = "BLOCKED — HARD INVALID"; return result; }
            if ((_pandaBias != "BUY" && _pandaBias != "SELL") || result.Execution == "NONE") return result;
            int side = _pandaBias == "BUY" ? 1 : -1;
            result.LineState = FeedLinesConfirmed() ? "CONFIRMED" : _pandaLineZone == "UNKNOWN" ? "UNAVAILABLE" : "UNCONFIRMED";
            var h1 = _readings.FirstOrDefault(item => item.Label == "H1");
            if (h1 != null && h1.Ready && _h1 != null && _h1.Count >= 2)
            {
                double contextPrice = _h1.ClosePrices[_h1.Count - 2];
                result.Level = NearestDirectionalLevel(contextPrice, side);
                if (result.Level != null)
                {
                    bool contextTouched = LevelWasTouched(result.Level, side);
                    bool contextRejected = contextTouched && RejectionConfirmed(result.Level, side);
                    result.LevelState = contextRejected ? "REJECTED" : contextTouched ? "AT LEVEL" :
                        result.Level.DistancePips <= LevelProximityPips ? "APPROACHING" : "DISTANT";
                }
            }
            if (result.LineState == "UNAVAILABLE") { result.State = "LINE DATA UNAVAILABLE"; return result; }
            if (result.LineState != "CONFIRMED") { result.State = "SETUP INVALIDATED"; result.Decision = "WAIT — PANDA LINES UNCONFIRMED"; return result; }
            if (h1 == null || !h1.Ready) { result.State = "H1 DATA UNAVAILABLE"; return result; }
            if (result.Execution == "MARKET")
                return EvaluateMarketContext(result, h1, h1Structure, m15Structure, side);
            if (_boxH1Trend == "RANGING" || h1.Adx < 15) { result.State = "RANGE — NO TRADE"; return result; }
            if (h1Structure.Direction == -side) { result.State = "SETUP INVALIDATED"; result.Decision = "WAIT — H1 STRUCTURE AGAINST"; return result; }
            double price = _h1.ClosePrices[_h1.Count - 2];
            if (result.Level == null) { result.State = "LEVEL DATA UNAVAILABLE"; return result; }
            bool touched = LevelWasTouched(result.Level, side);
            bool rejected = touched && RejectionConfirmed(result.Level, side);
            result.LevelState = rejected ? "REJECTED" : touched ? "AT LEVEL" : result.Level.DistancePips <= LevelProximityPips ? "APPROACHING" : "DISTANT";
            int eventAge = m15Structure.EventIndex < 0 ? int.MaxValue : (_m15.Count - 2) - m15Structure.EventIndex;
            bool fresh = eventAge <= M15EventExpiryBars;
            string suffix = side > 0 ? "UP" : "DOWN";
            bool bos = fresh && m15Structure.Event == "BOS " + suffix;
            bool choch = fresh && m15Structure.Event == "CHOCH " + suffix;
            result.Continuation = rejected && bos && h1.Adx >= 20 ? "STRONG" : rejected && (choch || h1.Adx >= 20) ? "MODERATE" : "WEAK";

            if (touched && rejected && result.Level.DistancePips > LevelProximityPips)
            {
                result.State = "ENTRY MOVED — WAIT";
                return result;
            }
            if (!touched && result.Level.DistancePips > LevelProximityPips) { result.State = "PULLBACK ACTIVE — WAIT"; return result; }
            if (!touched) { result.State = "APPROACHING PANDA LEVEL"; return result; }
            if (!rejected) { result.State = "AT PANDA LEVEL — WAIT FOR REJECTION"; return result; }
            if (bos) { result.State = "ENTRY TRIGGER"; result.Decision = _pandaBias + " READY"; return result; }
            if (choch) { result.State = "PULLBACK ENDING"; return result; }
            result.State = "CONTEXT READY — WAIT FOR M15";
            return result;
        }

        private PullbackDecision EvaluateMarketContext(PullbackDecision result, TrendReading h1,
            StructureReading h1Structure, StructureReading m15Structure, int side)
        {
            result.State = "MARKET WAIT";
            if (h1.Direction != side || h1.Strength < MarketMinH1Strength)
            { result.Decision = "WAIT — H1 TREND"; return result; }
            if (h1.Adx < MarketMinH1Adx)
            { result.Decision = "WAIT — H1 ADX"; return result; }
            if (h1Structure.Direction != side)
            { result.Decision = "WAIT — H1 STRUCTURE"; return result; }
            var m15 = _readings.FirstOrDefault(item => item.Label == "M15");
            if (m15 == null || !m15.Ready || m15.Direction != side || m15.Strength < MarketMinM15Strength)
            { result.Decision = "WAIT — M15 MOMENTUM"; return result; }
            int eventAge = m15Structure.EventIndex < 0 ? int.MaxValue : (_m15.Count - 2) - m15Structure.EventIndex;
            if (eventAge >= 0 && eventAge <= M15EventExpiryBars && m15Structure.Direction == -side)
            { result.Decision = "WAIT — M15 REVERSAL"; return result; }

            // Confirmed H1 candles establish the trend; live price checks whether
            // the current market has already stretched beyond the review limits.
            double price = Symbol.Bid > 0 ? Symbol.Bid : _h1.ClosePrices[_h1.Count - 2];
            var warnings = new List<string>();
            double follow = FollowLine(_h1);
            double nearestLine = double.IsNaN(follow) ? h1.Line :
                side > 0 ? Math.Max(h1.Line, follow) : Math.Min(h1.Line, follow);
            if (!double.IsNaN(nearestLine) && Math.Abs(price - nearestLine) / Symbol.PipSize > OverextensionPips)
                warnings.Add("OVEREXTENDED FROM PANDA LINES");
            var opposing = PreviousLevels().Where(level => side > 0 ? level.Price > price : level.Price < price)
                .OrderBy(level => Math.Abs(level.Price - price)).FirstOrDefault();
            if (opposing != null && Math.Abs(opposing.Price - price) / Symbol.PipSize <= LevelProximityPips)
                warnings.Add("NEARBY PANDA LEVEL " + opposing.Label);
            result.Warning = string.Join(" • ", warnings);
            result.State = warnings.Count > 0 ? "MARKET REVIEW" : "MARKET ELIGIBLE";
            result.Decision = warnings.Count > 0 ? "WAIT — REVIEW WARNINGS" : _pandaBias + " MARKET CONTEXT";
            return result;
        }

        private void UpdatePullbackZone(PullbackDecision decision)
        {
            bool blocked = decision.LineState != "CONFIRMED" || decision.Execution != "PULLBACK" ||
                decision.State == "NO SETUP" || decision.State == "SETUP INVALIDATED" ||
                decision.State == "RANGE — NO TRADE" || decision.State.Contains("UNAVAILABLE") ||
                decision.State.StartsWith("DATA");
            if (blocked || decision.Level == null)
            {
                _pullbackZone = null;
                RemovePullbackZone();
                return;
            }
            var h1 = _readings.FirstOrDefault(item => item.Label == "H1");
            if (h1 == null || !h1.Ready || h1.Atr <= 0)
            {
                _pullbackZone = null;
                RemovePullbackZone();
                return;
            }
            if (_pullbackZone == null || _pullbackZone.Side != _pandaBias)
            {
                double atrPips = h1.Atr / Symbol.PipSize;
                double halfWidthPips = Math.Max(PullbackMinimumPips, atrPips * PullbackAtrPercent / 100.0);
                _pullbackZone = new PullbackZone
                {
                    Side = _pandaBias,
                    Label = decision.Level.Label,
                    Anchor = decision.Level.Price,
                    Low = Math.Round(decision.Level.Price - halfWidthPips * Symbol.PipSize, Symbol.Digits),
                    High = Math.Round(decision.Level.Price + halfWidthPips * Symbol.PipSize, Symbol.Digits),
                    HalfWidthPips = halfWidthPips
                };
            }
            // The drawing sits on a live chart; the confirmed H1 close can be on the
            // other side of the stored level after price moves during the current bar.
            double price = Symbol.Bid > 0 ? Symbol.Bid : _h1.ClosePrices[_h1.Count - 2];
            if ((_pullbackZone.Side == "SELL" && price > _pullbackZone.High) ||
                (_pullbackZone.Side == "BUY" && price < _pullbackZone.Low))
            {
                _pullbackZone = null;
                RemovePullbackZone();
                return;
            }
            _pullbackZone.State = _pullbackZone.Side == "BUY"
                ? price <= _pullbackZone.High ? "INSIDE ZONE — WAIT" : "APPROACHING"
                : price >= _pullbackZone.Low ? "INSIDE ZONE — WAIT" : "APPROACHING";
            RenderPullbackZone();
        }

        private void RenderPullbackZone()
        {
            if (!ShowPullbackArea || _pullbackZone == null)
            {
                RemovePullbackZone();
                return;
            }
            int last = _h1.Count - 2;
            TimeSpan interval = last > 0 ? _h1.OpenTimes[last] - _h1.OpenTimes[last - 1] : TimeSpan.FromHours(1);
            if (interval <= TimeSpan.Zero || interval > TimeSpan.FromHours(4)) interval = TimeSpan.FromHours(1);
            DateTime start = _h1.OpenTimes[Math.Max(0, last - 1)];
            DateTime end = _h1.OpenTimes[last] + TimeSpan.FromTicks(interval.Ticks * PullbackProjectionBars);
            Color baseColor = _pullbackZone.Side == "BUY" ? Buy : Sell;
            var rectangle = Chart.DrawRectangle(PullbackZoneObjectName, start, _pullbackZone.High, end, _pullbackZone.Low, baseColor);
            rectangle.IsFilled = true;
            rectangle.Color = Color.FromArgb(45, baseColor);
            rectangle.IsInteractive = false;
            string labelText = _pullbackZone.State == "INSIDE ZONE — WAIT"
                ? _pullbackZone.Side + " PULLBACK AT LEVEL • " + _pullbackZone.Label + " • WAIT"
                : "POSSIBLE " + _pullbackZone.Side + " PULLBACK • " + _pullbackZone.Label;
            var label = Chart.DrawText(PullbackZoneLabelName, labelText, start, _pullbackZone.High, baseColor);
            label.FontSize = 10;
            label.IsBold = true;
            label.IsInteractive = false;
        }

        private void RemovePullbackZone()
        {
            Chart.RemoveObject(PullbackZoneObjectName);
            Chart.RemoveObject(PullbackZoneLabelName);
        }

        private void UpdateRiskPlan(PullbackDecision decision, StructureReading h1Structure, StructureReading m15Structure)
        {
            if (decision.State == "SETUP INVALIDATED" || _hardInvalid ||
                (_riskPlan != null && _riskPlan.Side != _pandaBias))
            {
                _riskPlan = null;
                Chart.RemoveObject(RiskRewardObjectName);
                return;
            }

            if (_riskPlan != null) SyncRiskPlanFromDrawing();
            bool ready = decision.Decision == "BUY READY" || decision.Decision == "SELL READY";
            bool eligible = ShouldShowPlan(decision, ready);
            if (!eligible && _riskPlan != null && _riskPlan.Preview)
            {
                _riskPlan = null;
                Chart.RemoveObject(RiskRewardObjectName);
            }
            if (eligible)
            {
                int side = _pandaBias == "BUY" ? 1 : -1;
                if (_riskPlan == null)
                {
                    var swing = h1Structure.Marks.Where(mark => mark.Direction == side)
                        .OrderByDescending(mark => mark.Index).FirstOrDefault();
                    if (swing != null)
                    {
                        int entryIndex = ready && m15Structure.EventIndex >= 0 && m15Structure.EventIndex < _m15.Count
                            ? m15Structure.EventIndex : _m15.Count - 2;
                        double entry = _m15.ClosePrices[entryIndex];
                        double stop = side > 0
                            ? swing.Price - SwingBufferPips * Symbol.PipSize
                            : swing.Price + SwingBufferPips * Symbol.PipSize;
                        if ((side > 0 && stop < entry) || (side < 0 && stop > entry))
                        {
                            double risk = Math.Abs(entry - stop);
                            double target = side > 0 ? entry + risk * RewardRiskTarget : entry - risk * RewardRiskTarget;
                            _riskPlan = new RiskPlan
                            {
                                Side = _pandaBias,
                                SwingLabel = swing.Label,
                                Entry = Math.Round(entry, Symbol.Digits),
                                Stop = Math.Round(stop, Symbol.Digits),
                                Target = Math.Round(target, Symbol.Digits),
                                StopPips = risk / Symbol.PipSize,
                                RewardRisk = RewardRiskTarget,
                                Lots = NormalizedPlanLots(),
                                TriggerKey = _m15.OpenTimes[entryIndex].Ticks * side,
                                Preview = !ready
                            };
                            UpdatePlanStatus();
                            Chart.RemoveObject(RiskRewardObjectName);
                        }
                    }
                }
                else if (ready && _riskPlan.Preview)
                {
                    // Preserve any manual drag edits made to the preview when confirmation arrives.
                    _riskPlan.Preview = false;
                }
            }
            try
            {
                RenderRiskReward();
                _planDrawError = "";
            }
            catch (Exception ex)
            {
                _planDrawError = ex.GetType().Name;
                Chart.RemoveObject(RiskRewardObjectName);
            }
        }

        private string PlainDecision(PullbackDecision decision)
        {
            if (EffectiveFeedStatus() != "LIVE") return "WAIT • FEED";
            if (_hardInvalid) return "INVALID • PANDA";
            if (_pandaBias != "BUY" && _pandaBias != "SELL") return "WAIT • NO BIAS";
            if (decision.Execution == "NONE") return "WAIT • GAP BELOW 5";
            if (decision.LineState != "CONFIRMED") return "WAIT • PANDA LINES";
            if (decision.Decision == "BUY READY" || decision.Decision == "SELL READY")
                return _riskPlan == null ? "WAIT • NO PLAN" : _riskPlan.Status == "TOO WIDE" ? "SKIP • STOP TOO WIDE" :
                    _riskPlan.Status != "ACCEPTABLE" ? "WAIT • PLAN INVALID" : _pandaBias + " PULLBACK READY";
            if (decision.Execution == "MARKET")
                return decision.State == "MARKET ELIGIBLE" ? _pandaBias + " MARKET CONTEXT" :
                    decision.State == "MARKET REVIEW" ? "WAIT • REVIEW WARNINGS" :
                    decision.State == "MARKET WAIT" ? decision.Decision.Replace('—', '•') : "WAIT • " + decision.State;
            return decision.State == "RANGE — NO TRADE" ? "WAIT • H1 RANGE FILTER" : "WAIT • " + decision.State;
        }

        private string NextStep(PullbackDecision decision)
        {
            if (EffectiveFeedStatus() != "LIVE") return "Restore live feed";
            if (_hardInvalid) return "Wait for valid Panda score";
            if (_pandaBias != "BUY" && _pandaBias != "SELL") return "Wait for Panda bias";
            if (decision.Execution == "NONE") return "Wait for gap 5+";
            if (decision.LineState != "CONFIRMED") return "Confirm Panda Lines";
            if (decision.Execution == "MARKET")
            {
                if (decision.State == "MARKET ELIGIBLE") return "Conditions met • review price and risk";
                if (decision.State == "MARKET REVIEW") return "Review extension and nearby level";
                if (decision.Decision == "WAIT — H1 TREND") return "H1 direction and 65% strength";
                if (decision.Decision == "WAIT — H1 ADX") return "H1 ADX 25+";
                if (decision.Decision == "WAIT — H1 STRUCTURE") return "H1 structure with Panda bias";
                if (decision.Decision == "WAIT — M15 MOMENTUM") return "M15 direction and 50% strength";
                if (decision.Decision == "WAIT — M15 REVERSAL") return "Wait for opposite M15 event to expire";
            }
            if (decision.Decision == "BUY READY" || decision.Decision == "SELL READY") return "Review plan and price";
            if (decision.State == "PULLBACK ACTIVE — WAIT" || decision.State == "APPROACHING PANDA LEVEL") return "Watch directional level";
            if (decision.State == "AT PANDA LEVEL — WAIT FOR REJECTION") return "Wait for H1 rejection";
            if (decision.State == "PULLBACK ENDING" || decision.State == "CONTEXT READY — WAIT FOR M15") return "Wait for fresh M15 BOS";
            if (decision.State == "LEVEL DATA UNAVAILABLE") return "Load previous levels";
            if (decision.State == "H1 DATA UNAVAILABLE") return "Load H1 candles";
            return decision.State == "RANGE — NO TRADE" ? "H1 box ranging or ADX <15" : "Read Panda state above";
        }

        private string PlanDrawStatus(PullbackDecision decision, StructureReading h1Structure)
        {
            if (!ShowRiskReward) return "OFF IN SETTINGS";
            if (!string.IsNullOrEmpty(_planDrawError)) return "DRAW ERROR • " + _planDrawError;
            if (_riskPlan != null)
                return Chart.FindObject(RiskRewardObjectName) == null ? "DRAWING MISSING" :
                    _riskPlan.Preview ? "PREVIEW SHOWN" : "CONFIRMED SHOWN";
            bool ready = decision.Decision == "BUY READY" || decision.Decision == "SELL READY";
            if (!ready && PlanPreviewMode == TrendConfluenceRiskPlanVisibility.ReadyOnly) return "READY ONLY MODE";
            if (!ShouldShowPlan(decision, ready)) return "WAIT • SETUP BLOCKED";
            int side = _pandaBias == "BUY" ? 1 : -1;
            return h1Structure.Marks.Any(mark => mark.Direction == side) ? "SWING WRONG SIDE" : "NO CONFIRMED H1 SWING";
        }

        private bool ShouldShowPlan(PullbackDecision decision, bool ready)
        {
            if (ready) return true;
            if (decision.Execution == "MARKET" && decision.State != "MARKET ELIGIBLE") return false;
            if (decision.LineState != "CONFIRMED" || decision.Execution == "NONE" ||
                decision.State == "NO SETUP" || decision.State == "SETUP INVALIDATED" || decision.State == "RANGE — NO TRADE" ||
                decision.State.Contains("UNAVAILABLE") || decision.State.StartsWith("DATA")) return false;
            if (PlanPreviewMode == TrendConfluenceRiskPlanVisibility.ReadyOnly) return false;
            if (PlanPreviewMode == TrendConfluenceRiskPlanVisibility.Always) return true;
            return decision.State.StartsWith("PULLBACK ACTIVE") || decision.State.StartsWith("APPROACHING") ||
                decision.State.StartsWith("AT PANDA LEVEL") || decision.State == "PULLBACK ENDING" ||
                decision.State.StartsWith("CONTEXT READY") || decision.State == "MARKET ELIGIBLE";
        }

        private double NormalizedPlanLots()
        {
            double units = Symbol.QuantityToVolumeInUnits(PlanLots);
            units = Symbol.NormalizeVolumeInUnits(units, RoundingMode.ToNearest);
            units = Math.Max(Symbol.VolumeInUnitsMin, Math.Min(Symbol.VolumeInUnitsMax, units));
            return Symbol.VolumeInUnitsToQuantity(units);
        }

        private string PlannerDecision(string setupDecision)
        {
            bool ready = setupDecision == "BUY READY" || setupDecision == "SELL READY";
            if (!ready) return _riskPlan != null && _riskPlan.Preview ? "PREVIEW — NOT READY" : setupDecision;
            if (_riskPlan == null) return "WAIT — NO CONFIRMED H1 SWING";
            if (_riskPlan.Status == "TOO WIDE") return "SKIP — STOP TOO WIDE";
            if (_riskPlan.Status != "ACCEPTABLE") return "WAIT — PLAN INVALID";
            return setupDecision + " • PLAN ACCEPTABLE";
        }

        private void UpdatePlanStatus()
        {
            if (_riskPlan == null) return;
            bool geometry = _riskPlan.Side == "BUY"
                ? _riskPlan.Stop < _riskPlan.Entry && _riskPlan.Target > _riskPlan.Entry
                : _riskPlan.Stop > _riskPlan.Entry && _riskPlan.Target < _riskPlan.Entry;
            double risk = Math.Abs(_riskPlan.Entry - _riskPlan.Stop);
            double reward = Math.Abs(_riskPlan.Target - _riskPlan.Entry);
            _riskPlan.StopPips = risk / Symbol.PipSize;
            _riskPlan.RewardRisk = risk > 0 ? reward / risk : 0;
            _riskPlan.Status = !geometry ? "INVALID GEOMETRY" :
                _riskPlan.StopPips > MaximumStopPips ? "TOO WIDE" : "ACCEPTABLE";
        }

        private void SyncRiskPlanFromDrawing()
        {
            var drawing = Chart.FindObject(RiskRewardObjectName) as ChartRiskReward;
            if (drawing == null || _riskPlan == null) return;
            _riskPlan.Entry = drawing.EntryPrice;
            _riskPlan.Stop = drawing.StopLossPrice;
            _riskPlan.Target = drawing.TakeProfitPrice;
            var fixedSize = drawing.Type as ChartRiskRewardFixedSizeType;
            if (fixedSize != null) _riskPlan.Lots = Symbol.VolumeInUnitsToQuantity(fixedSize.VolumeInUnits);
            UpdatePlanStatus();
        }

        private void RenderRiskReward()
        {
            if (!ShowRiskReward || _riskPlan == null)
            {
                Chart.RemoveObject(RiskRewardObjectName);
                return;
            }
            var drawing = Chart.FindObject(RiskRewardObjectName) as ChartRiskReward;
            if (drawing != null)
            {
                drawing.RiskColor = RiskDrawingColor;
                drawing.RewardColor = RewardDrawingColor;
                return;
            }
            int last = Math.Max(1, Bars.Count - 1);
            DateTime step = Bars.OpenTimes[last] > Bars.OpenTimes[last - 1]
                ? Bars.OpenTimes[last] : Server.Time;
            TimeSpan interval = Bars.OpenTimes[last] - Bars.OpenTimes[last - 1];
            if (interval <= TimeSpan.Zero || interval > TimeSpan.FromDays(1)) interval = TimeSpan.FromHours(1);
            DateTime start = Bars.OpenTimes[Math.Max(0, last - Math.Max(1, RiskRewardWidthBars - 3))];
            DateTime end = step + TimeSpan.FromTicks(interval.Ticks * 3);
            double units = Symbol.NormalizeVolumeInUnits(Symbol.QuantityToVolumeInUnits(_riskPlan.Lots), RoundingMode.ToNearest);
            units = Math.Max(Symbol.VolumeInUnitsMin, Math.Min(Symbol.VolumeInUnitsMax, units));
            drawing = Chart.DrawRiskReward(RiskRewardObjectName, start, end, _riskPlan.Entry,
                OrderType.Market, _riskPlan.Side == "BUY" ? TradeType.Buy : TradeType.Sell,
                new ChartRiskRewardFixedSizeType(units));
            drawing.IsFixedRatio = false;
            drawing.StopLossPrice = _riskPlan.Stop;
            drawing.TakeProfitPrice = _riskPlan.Target;
            drawing.RiskColor = RiskDrawingColor;
            drawing.RewardColor = RewardDrawingColor;
            drawing.RiskThickness = 2;
            drawing.RewardThickness = 2;
            drawing.IsInteractive = true;
            drawing.IsLocked = false;
            drawing.Comment = "Panda Trend Confluence v1 read-only H1 swing plan";
        }

        private string PullbackState(StructureReading h1Structure, StructureReading m15Structure)
        {
            if (EffectiveFeedStatus() != "LIVE" || _hardInvalid || (_pandaBias != "BUY" && _pandaBias != "SELL"))
                return "NO SETUP";
            int side = _pandaBias == "BUY" ? 1 : -1;
            var context = ContextReadings();
            int aligned = context.Count(item => item.Direction == side);
            if (aligned < 2) return "NO SETUP";
            if (h1Structure.Direction == -side) return "SETUP INVALIDATED";
            var m15 = _readings.FirstOrDefault(item => item.Label == "M15");
            if (m15 == null || !m15.Ready) return "LOADING";
            if (m15.Direction != side) return "PULLBACK ACTIVE";
            int eventAge = m15Structure.EventIndex < 0 ? int.MaxValue : (_m15.Count - 2) - m15Structure.EventIndex;
            if (eventAge > 3) return "CONTEXT READY";
            string suffix = side > 0 ? "UP" : "DOWN";
            if (m15Structure.Event == "CHOCH " + suffix) return "PULLBACK ENDING";
            if (m15Structure.Event == "BOS " + suffix) return "ENTRY TRIGGER";
            return "CONTEXT READY";
        }

        private Color PullbackColor(string state)
        {
            if (state == "ENTRY TRIGGER" || state == "PULLBACK ENDING") return _pandaBias == "SELL" ? Sell : Buy;
            if (state.StartsWith("PULLBACK ACTIVE") || state.StartsWith("CONTEXT READY") ||
                state.StartsWith("APPROACHING") || state.StartsWith("AT PANDA LEVEL") || state == "MARKET ELIGIBLE") return Warn;
            if (state == "SETUP INVALIDATED") return Sell;
            return Muted;
        }

        private string Status(int structure)
        {
            var feed = EffectiveFeedStatus();
            if (feed != "LIVE") return "DATA — " + feed;
            if (_hardInvalid) return "BLOCKED — HARD INVALID";
            if (_pandaBias != "BUY" && _pandaBias != "SELL") return "BLOCKED — PANDA WAIT";
            int side = _pandaBias == "BUY" ? 1 : -1;
            var context = ContextReadings();
            var aligned = context.Where(item => item.Direction == side).ToList();
            if (aligned.Count < 2) return "CONFLICT — HTF MIXED";
            if (structure != side) return "WATCH — STRUCTURE AGAINST";
            var h1h4 = context.Where(item => item.Label == "H1" || item.Label == "H4").ToList();
            double adx = h1h4.Count == 0 ? 0 : h1h4.Max(item => item.Adx);
            if (adx < 20) return "WATCH — ADX WEAK";
            double strength = aligned.Average(item => item.Strength);
            if (strength < 50) return "WATCH — STRENGTH WEAK";
            if (aligned.Count == 3 && strength >= 65 && adx >= 25) return "HIGH CONFLUENCE";
            return "READY";
        }

        private Color BiasColor()
        {
            return _pandaBias == "BUY" ? Buy : _pandaBias == "SELL" ? Sell : Muted;
        }

        private static Color StatusColor(string status)
        {
            if (status == "HIGH CONFLUENCE") return Buy;
            if (status == "READY" || status.StartsWith("WATCH")) return Warn;
            if (status.StartsWith("BLOCKED") || status.StartsWith("CONFLICT")) return Sell;
            return Muted;
        }

        private string ExecutionDecision(string mainStatus, string pullback)
        {
            if (_pandaBias != "BUY" && _pandaBias != "SELL") return "BLOCKED - PANDA WAIT";
            if (pullback == "SETUP INVALIDATED") return "BLOCKED - SETUP INVALIDATED";
            bool contextReady = mainStatus == "READY" || mainStatus == "HIGH CONFLUENCE";
            if (!contextReady)
            {
                if (mainStatus.StartsWith("WATCH — ")) return "WAIT - " + mainStatus.Substring(8);
                if (mainStatus.StartsWith("CONFLICT")) return "WAIT - HTF CONFLICT";
                if (mainStatus.StartsWith("BLOCKED")) return mainStatus.Replace('—', '-');
                return "WAIT - DATA OR CONTEXT";
            }
            if (pullback == "ENTRY TRIGGER") return _pandaBias + " READY";
            if (pullback == "PULLBACK ACTIVE") return "WAIT - PULLBACK ACTIVE";
            if (pullback == "PULLBACK ENDING") return "WAIT - PULLBACK ENDING";
            return "WAIT - NO FRESH ENTRY TRIGGER";
        }

        private Color DecisionColor(string decision)
        {
            if (decision == "BUY READY") return Buy;
            if (decision == "SELL READY" || decision.StartsWith("BLOCKED")) return Sell;
            return Warn;
        }

        private static Grid Row(string label, string value, Color color)
        {
            var row = new Grid(1, 2) { Margin = new Thickness(8, 2, 8, 2) };
            row.Columns[0].SetWidthInPixels(85);
            row.AddChild(Text(label, Muted, 10, false), 0, 0);
            row.AddChild(Text(value, color, 11, true), 0, 1);
            return row;
        }

        private static TextBlock Text(string value, Color color, double size, bool bold)
        {
            return new TextBlock
            {
                Text = value,
                ForegroundColor = color,
                FontSize = size,
                FontWeight = bold ? FontWeight.Bold : FontWeight.Normal,
                Margin = new Thickness(8, 3, 8, 3)
            };
        }
    }
}
