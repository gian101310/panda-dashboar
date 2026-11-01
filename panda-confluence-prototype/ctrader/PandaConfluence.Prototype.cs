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
    internal sealed class ConfluenceFeedPair
    {
        [JsonPropertyName("symbol")] public string Symbol { get; set; }
        [JsonPropertyName("gap")] public double? Gap { get; set; }
        [JsonPropertyName("bias")] public string Bias { get; set; }
        [JsonPropertyName("hard_invalid")] public bool HardInvalid { get; set; }
        [JsonPropertyName("updated_at")] public string UpdatedAt { get; set; }
    }

    internal sealed class ConfluenceFeedEnvelope
    {
        [JsonPropertyName("schema_version")] public int SchemaVersion { get; set; }
        [JsonPropertyName("max_age_seconds")] public int MaxAgeSeconds { get; set; }
        [JsonPropertyName("status")] public string Status { get; set; }
        [JsonPropertyName("pairs")] public List<ConfluenceFeedPair> Pairs { get; set; }
    }

    [Indicator(IsOverlay = true, TimeZone = TimeZones.UTC, AccessRights = AccessRights.None)]
    public class PandaConfluenceDecisionV2 : Indicator
    {
        [Parameter("Operator Token", DefaultValue = "", Group = "Panda Feed")]
        public string OperatorToken { get; set; }

        [Parameter("SuperTrend ATR period", DefaultValue = 10, MinValue = 2, MaxValue = 100, Group = "Trend")]
        public int AtrPeriod { get; set; }

        [Parameter("SuperTrend multiplier", DefaultValue = 3.0, MinValue = 0.1, MaxValue = 20, Step = 0.1, Group = "Trend")]
        public double Multiplier { get; set; }

        [Parameter("ADX period", DefaultValue = 14, MinValue = 2, MaxValue = 100, Group = "Trend")]
        public int AdxPeriod { get; set; }

        [Parameter("Swing length", DefaultValue = 3, MinValue = 2, MaxValue = 20, Group = "Structure")]
        public int SwingLength { get; set; }

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

        private readonly List<TrendReading> _readings = new List<TrendReading>();
        private Bars _m15;
        private Bars _h1;
        private Bars _h4;
        private Bars _d1;
        private ChartDraggable _draggable;
        private bool _minimized;
        private DateTime _lastRefresh = DateTime.MinValue;
        private DateTime _lastFeedRequest = DateTime.MinValue;
        private DateTime _feedReceivedAt = DateTime.MinValue;
        private bool _feedRequestInFlight;
        private int _maxAgeSeconds = 600;
        private string _feedStatus = "CONNECTING";
        private string _pandaBias = "WAIT";
        private double? _pandaGap;
        private bool _hardInvalid;
        private string _pandaUpdatedAt = "";
        private const string FeedEndpoint = "https://pandaengine.app/api/ctrader-overlay";
        private const string PanelXKey = "PandaConfluence Panel X";
        private const string PanelYKey = "PandaConfluence Panel Y";
        private const string MinimizedKey = "PandaConfluence Panel Minimized";
        private static readonly Color Buy = Color.FromHex("#00ff9f");
        private static readonly Color Sell = Color.FromHex("#ff4d6d");
        private static readonly Color Accent = Color.FromHex("#00b4ff");
        private static readonly Color Warn = Color.FromHex("#ffd166");
        private static readonly Color Muted = Color.FromHex("#9aa4b2");

        protected override void Initialize()
        {
            _m15 = MarketData.GetBars(TimeFrame.Minute15, SymbolName);
            _h1 = MarketData.GetBars(TimeFrame.Hour, SymbolName);
            _h4 = MarketData.GetBars(TimeFrame.Hour4, SymbolName);
            _d1 = MarketData.GetBars(TimeFrame.Daily, SymbolName);
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
            var token = (OperatorToken ?? string.Empty).Trim();
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
            request.Headers.Add("x-panda-operator-token", token);
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
                        try { _feedStatus = JsonSerializer.Deserialize<ConfluenceFeedEnvelope>(response.Body)?.Status ?? "ERROR"; }
                        catch { }
                    }
                    return;
                }
                var envelope = JsonSerializer.Deserialize<ConfluenceFeedEnvelope>(response.Body,
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
                Chart.RemoveObject("PandaConfluence.Pivot." + i);
                Chart.RemoveObject("PandaConfluence.Event." + i);
            }
            var pivots = ShowSwingLabels
                ? structure.Marks.Skip(Math.Max(0, structure.Marks.Count - MaxStructureLabels)).ToList()
                : new List<StructureMark>();
            for (int i = 0; i < pivots.Count; i++)
            {
                var mark = pivots[i];
                var text = Chart.DrawText("PandaConfluence.Pivot." + i, mark.Label, mark.Index, mark.Price,
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
                var text = Chart.DrawText("PandaConfluence.Event." + i, mark.Label, mark.Index, mark.Price,
                    mark.Direction > 0 ? Buy : Sell);
                text.FontSize = 11;
                text.IsBold = true;
            }
        }

        private void DrawGaps(List<GapReading> gaps)
        {
            for (int i = 0; i < 30; i++)
            {
                Chart.RemoveObject("PandaConfluence.Fvg." + i);
                Chart.RemoveObject("PandaConfluence.FvgLabel." + i);
            }
            if (!ShowFvg) return;
            for (int i = 0; i < gaps.Count; i++)
            {
                var gap = gaps[i];
                var color = gap.Direction > 0 ? Buy : Sell;
                var rectangle = Chart.DrawRectangle("PandaConfluence.Fvg." + i, gap.Index - 2, gap.High, Bars.Count - 1, gap.Low, color);
                rectangle.IsFilled = true;
                rectangle.Color = Color.FromArgb(35, color);
                if (ShowFvgLabels)
                {
                    var label = Chart.DrawText("PandaConfluence.FvgLabel." + i,
                        gap.Direction > 0 ? "BULL FVG" : "BEAR FVG", gap.Index - 2, (gap.Low + gap.High) / 2, color);
                    label.FontSize = 9;
                    label.IsBold = true;
                }
            }
        }

        private ControlBase BuildPanel(StructureReading h1Structure, StructureReading m15Structure, GapReading gap)
        {
            string pullback = PullbackState(h1Structure, m15Structure);
            string status = Status(h1Structure.Direction);
            string decision = ExecutionDecision(status, pullback);
            var panel = new StackPanel
            {
                Width = _minimized ? 235 : 300,
                BackgroundColor = Color.FromArgb(235, Color.FromHex("#070b12")),
                Margin = 4
            };
            var header = new Grid(1, 2) { Margin = 5 };
            header.AddChild(Text("PANDA CONFLUENCE  •  V2", Accent, 13, true), 0, 0);
            var minimize = new Button { Text = _minimized ? "+" : "−", Width = 28, Height = 22, Margin = 1 };
            minimize.Click += ToggleMinimize;
            header.AddChild(minimize, 0, 1);
            panel.AddChild(header);
            if (_minimized)
            {
                panel.AddChild(Text(SymbolName + "  " + decision, DecisionColor(decision), 12, true));
                return new Border { Child = panel, BorderColor = Color.FromHex("#1a2940"), BorderThickness = 1, CornerRadius = 5 };
            }
            panel.AddChild(Text(SymbolName + "  |  confirmed candles", Muted, 10, false));
            foreach (var reading in _readings.Where(item => item.Label != "M15"))
            {
                if (!reading.Ready) panel.AddChild(Row(reading.Label, "LOADING", Warn));
                else
                {
                    string side = reading.Direction > 0 ? "UP" : "DOWN";
                    string value = side + "  " + reading.Strength.ToString("0") + "%  ADX " + reading.Adx.ToString("0");
                    panel.AddChild(Row(reading.Label, value, reading.Direction > 0 ? Buy : Sell));
                }
            }
            var m15 = _readings.First(item => item.Label == "M15");
            panel.AddChild(Row("ENTRY M15", m15.Ready ? (m15.Direction > 0 ? "UP " : "DOWN ") + m15.Strength.ToString("0") + "%" : "LOADING",
                !m15.Ready ? Warn : m15.Direction > 0 ? Buy : Sell));
            panel.AddChild(Row("H1 STRUCT", h1Structure.Event, h1Structure.Direction > 0 ? Buy : h1Structure.Direction < 0 ? Sell : Muted));
            panel.AddChild(Row("M15 EVENT", m15Structure.Event, m15Structure.Direction > 0 ? Buy : m15Structure.Direction < 0 ? Sell : Muted));
            panel.AddChild(Row("FVG", gap == null ? "NONE" : gap.Direction > 0 ? "BULLISH OPEN" : "BEARISH OPEN", gap == null ? Muted : gap.Direction > 0 ? Buy : Sell));
            string gapText = _pandaGap.HasValue ? _pandaGap.Value.ToString("+0.0;-0.0;0.0") : "—";
            panel.AddChild(Row("PANDA BIAS", gapText + "  " + _pandaBias, BiasColor()));
            panel.AddChild(Row("FEED", EffectiveFeedStatus(), EffectiveFeedStatus() == "LIVE" ? Buy : Warn));
            panel.AddChild(Row("PULLBACK", pullback, PullbackColor(pullback)));
            panel.AddChild(Row("CONFLUENCE", status, StatusColor(status)));
            panel.AddChild(Text(decision, DecisionColor(decision), 16, true));
            panel.AddChild(Text("Updated " + ShortUpdatedAt() + " • no orders • scoring unchanged", Muted, 9, false));
            return new Border { Child = panel, BorderColor = Color.FromHex("#1a2940"), BorderThickness = 1, CornerRadius = 5 };
        }

        private void ToggleMinimize(ButtonClickEventArgs args)
        {
            _minimized = !_minimized;
            LocalStorage.SetString(MinimizedKey, _minimized ? "1" : "0", LocalStorageScope.Instance);
            LocalStorage.Flush(LocalStorageScope.Instance);
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
            if (state == "PULLBACK ACTIVE" || state == "CONTEXT READY") return Warn;
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
