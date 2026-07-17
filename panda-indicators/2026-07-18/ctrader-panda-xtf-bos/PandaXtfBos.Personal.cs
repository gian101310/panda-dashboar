using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using cAlgo.API;
using cAlgo.API.Internals;

namespace cAlgo
{
    public enum PandaXtfStructure
    {
        H1,
        H4
    }

    // Personal cTrader port of the private TradingView "Panda Engine Personal TV XTF BOS"
    // indicator. It calculates from broker market data only: no Panda API credential,
    // no licensing, no network access (AccessRights.None), and it never places trades.
    [Indicator(IsOverlay = true, TimeZone = TimeZones.UTC, AccessRights = AccessRights.None)]
    public class PandaEnginePersonalXtfBos : Indicator
    {
        private const int PandaGapThreshold = 5;
        private const int PandaSignificant = 4;
        private const int BbPeriod = 21;
        private const double BbDeviation = 1.0;
        private const int FollowAtrPeriod = 5;
        private const int SuperTrendPeriod = 10;
        private const double SuperTrendFactor = 3.0;
        private const int MinPairBars = 2500;
        private const double PanelHeightEstimate = 340;

        private static readonly string[] PandaPairs =
        {
            "AUDCAD", "AUDJPY", "AUDNZD", "AUDUSD", "CADJPY",
            "EURAUD", "EURCAD", "EURGBP", "EURJPY", "EURNZD", "EURUSD",
            "GBPAUD", "GBPCAD", "GBPJPY", "GBPNZD", "GBPUSD",
            "NZDCAD", "NZDJPY", "NZDUSD", "USDCAD", "USDJPY"
        };

        private static readonly string[] PandaCurrencies = { "AUD", "CAD", "EUR", "GBP", "JPY", "NZD", "USD" };

        [Parameter("Show panel", DefaultValue = true)]
        public bool ShowPanel { get; set; }

        [Parameter("Show Panda Boxes", DefaultValue = true)]
        public bool ShowBoxes { get; set; }

        [Parameter("Show Panda Lines", DefaultValue = true)]
        public bool ShowPandaLines { get; set; }

        [Parameter("Show flip markers", DefaultValue = true)]
        public bool ShowFlipMarkers { get; set; }

        [Parameter("Swing length", DefaultValue = 5, MinValue = 2, MaxValue = 20)]
        public int SwingLength { get; set; }

        [Parameter("Show active swing levels", DefaultValue = true)]
        public bool ShowBosLevels { get; set; }

        [Parameter("Show BOS markers", DefaultValue = true)]
        public bool ShowBosMarkers { get; set; }

        [Parameter("XTF structure", DefaultValue = PandaXtfStructure.H1)]
        public PandaXtfStructure XtfStructure { get; set; }

        [Parameter("Show BUY/SELL trigger markers", DefaultValue = true)]
        public bool ShowTriggerMarkers { get; set; }

        [Output("Panda SuperTrend Up", LineColor = "Lime", Thickness = 2)]
        public IndicatorDataSeries SuperTrendUp { get; set; }

        [Output("Panda SuperTrend Down", LineColor = "Red", Thickness = 2)]
        public IndicatorDataSeries SuperTrendDown { get; set; }

        [Output("Panda Follow Line Up", LineColor = "DeepSkyBlue", Thickness = 2)]
        public IndicatorDataSeries FollowLineUp { get; set; }

        [Output("Panda Follow Line Down", LineColor = "Red", Thickness = 2)]
        public IndicatorDataSeries FollowLineDown { get; set; }

        private sealed class PeriodRange
        {
            public DateTime Start;
            public double High;
            public double Low;
        }

        private sealed class PairSlot
        {
            public string Pair;
            public Bars Bars;
            public bool Missing;
            public int LastCount = -1;
            public DateTime LastBarTime = DateTime.MinValue;
            public bool Ready;
            public double ShortHigh, ShortLow, MediumHigh, MediumLow, LongHigh, LongLow;
            public DateTime ShortStart, ShortEnd, MediumStart, MediumEnd, LongStart, LongEnd;
        }

        private readonly List<PairSlot> _slots = new List<PairSlot>();
        private readonly int[] _scoresH1 = new int[7];
        private readonly int[] _scoresH4 = new int[7];
        private readonly int[] _scoresD1 = new int[7];
        private PairSlot _activeSlot;
        private string _chartPair = "";
        private int _baseIndex = -1;
        private int _quoteIndex = -1;
        private int _readyPairs;
        private bool _scoreReady;
        private bool _hardInvalid;
        private int _pandaGap;
        private string _pandaBias = "DATA UNAVAILABLE";
        private string _boxH1Trend = "UNKNOWN";
        private string _boxH4Trend = "UNKNOWN";
        private string _baseXtfText = "—";
        private string _quoteXtfText = "—";

        private IndicatorDataSeries _tr;
        private IndicatorDataSeries _atr;
        private IndicatorDataSeries _upBand;
        private IndicatorDataSeries _lowBand;
        private IndicatorDataSeries _stTrend;
        private IndicatorDataSeries _st;
        private IndicatorDataSeries _bbUpper;
        private IndicatorDataSeries _bbLower;
        private IndicatorDataSeries _followAtr;
        private IndicatorDataSeries _follow;

        private int _lastClosedProcessed = -1;
        private double _lastSwingHigh = double.NaN;
        private double _lastSwingLow = double.NaN;
        private int _lastSwingHighIndex = -1;
        private int _lastSwingLowIndex = -1;
        private bool _swingHighBroken;
        private bool _swingLowBroken;
        private int _lastDirectionalSide;
        private string _latestFlip = "NONE";
        private string _latestBos = "NONE";
        private int _triggerBarIndex = -1;
        private string _triggerDirection = "";

        private ChartDraggable _draggable;
        private bool _minimized;
        private DateTime _lastPanelRefreshUtc = DateTime.MinValue;

        private static readonly Color PandaBuy = Color.FromArgb(255, 0, 255, 159);
        private static readonly Color PandaSell = Color.FromArgb(255, 255, 77, 109);
        private static readonly Color PandaWarn = Color.FromArgb(255, 255, 209, 102);
        private static readonly Color PandaAccent = Color.FromArgb(255, 0, 180, 255);
        private static readonly Color PandaNeutral = Color.FromArgb(255, 154, 164, 178);

        protected override void Initialize()
        {
            _tr = CreateDataSeries();
            _atr = CreateDataSeries();
            _upBand = CreateDataSeries();
            _lowBand = CreateDataSeries();
            _stTrend = CreateDataSeries();
            _st = CreateDataSeries();
            _bbUpper = CreateDataSeries();
            _bbLower = CreateDataSeries();
            _followAtr = CreateDataSeries();
            _follow = CreateDataSeries();

            _chartPair = CanonicalPair(SymbolName);
            _baseIndex = _chartPair == "" ? -1 : CurrencyIndex(_chartPair.Substring(0, 3));
            _quoteIndex = _chartPair == "" ? -1 : CurrencyIndex(_chartPair.Substring(3, 3));

            foreach (var pair in PandaPairs)
            {
                var slot = new PairSlot { Pair = pair };
                var resolved = ResolveSymbolName(pair);
                if (resolved == null)
                {
                    slot.Missing = true;
                }
                else
                {
                    try { slot.Bars = MarketData.GetBars(TimeFrame.Hour, resolved); }
                    catch { slot.Missing = true; }
                }
                _slots.Add(slot);
                if (pair == _chartPair) _activeSlot = slot;
            }

            _minimized = LocalStorage.GetString("PandaXtf Minimized") == "1";
            _draggable = Chart.Draggables.Add();
            _draggable.ShowGrip = true;
            _draggable.Child = BuildPanel();
            RestoreLocation();
            _draggable.LocationChanged += OnLocationChanged;
            Timer.TimerTick += OnTimerTick;
            Timer.Start(1);
            RefreshFeedState();
        }

        private static string Compact(string value)
        {
            return new string((value ?? string.Empty).ToUpperInvariant().Where(char.IsLetter).ToArray());
        }

        private static string CanonicalPair(string symbolName)
        {
            var compact = Compact(symbolName);
            var matches = PandaPairs.Where(compact.Contains).ToArray();
            return matches.Length == 1 ? matches[0] : "";
        }

        private string ResolveSymbolName(string pair)
        {
            if (Symbols.Exists(pair)) return pair;
            string exact = null;
            int exactCount = 0;
            string contains = null;
            int containsCount = 0;
            foreach (var name in Symbols)
            {
                var compact = Compact(name);
                if (compact == pair)
                {
                    exact = name;
                    exactCount++;
                }
                else if (compact.Contains(pair))
                {
                    contains = name;
                    containsCount++;
                }
            }
            if (exactCount == 1) return exact;
            if (exactCount == 0 && containsCount == 1) return contains;
            return null;
        }

        private static int CurrencyIndex(string currency)
        {
            return Array.IndexOf(PandaCurrencies, currency);
        }

        private static DateTime DayKey(DateTime time)
        {
            return time.Date;
        }

        private static DateTime WeekKey(DateTime time)
        {
            var date = time.Date;
            return date.AddDays(-(((int)date.DayOfWeek + 6) % 7));
        }

        private static DateTime MonthKey(DateTime time)
        {
            return new DateTime(time.Year, time.Month, 1);
        }

        private static List<PeriodRange> BuildPeriods(Bars bars, Func<DateTime, DateTime> keyOf)
        {
            var periods = new List<PeriodRange>();
            var currentKey = DateTime.MinValue;
            PeriodRange current = null;
            for (int i = 0; i < bars.Count; i++)
            {
                var key = keyOf(bars.OpenTimes[i]);
                if (current == null || key != currentKey)
                {
                    current = new PeriodRange { Start = bars.OpenTimes[i], High = bars.HighPrices[i], Low = bars.LowPrices[i] };
                    periods.Add(current);
                    currentKey = key;
                }
                else
                {
                    current.High = Math.Max(current.High, bars.HighPrices[i]);
                    current.Low = Math.Min(current.Low, bars.LowPrices[i]);
                }
            }
            return periods;
        }

        // Mirrors the Pine f_snapshot(): boxes span completed periods 2-3 and
        // end at the start of completed period 1 (short=days, medium=weeks, long=months).
        private static bool ApplySnapshot(PairSlot slot)
        {
            var bars = slot.Bars;
            var days = BuildPeriods(bars, DayKey);
            var weeks = BuildPeriods(bars, WeekKey);
            var months = BuildPeriods(bars, MonthKey);
            if (days.Count < 4 || weeks.Count < 4 || months.Count < 4) return false;

            var d1 = days[days.Count - 2];
            var d2 = days[days.Count - 3];
            var d3 = days[days.Count - 4];
            slot.ShortHigh = Math.Max(d2.High, d3.High);
            slot.ShortLow = Math.Min(d2.Low, d3.Low);
            slot.ShortStart = d3.Start;
            slot.ShortEnd = d1.Start;

            var w1 = weeks[weeks.Count - 2];
            var w2 = weeks[weeks.Count - 3];
            var w3 = weeks[weeks.Count - 4];
            slot.MediumHigh = Math.Max(w2.High, w3.High);
            slot.MediumLow = Math.Min(w2.Low, w3.Low);
            slot.MediumStart = w3.Start;
            slot.MediumEnd = w1.Start;

            var m1 = months[months.Count - 2];
            var m2 = months[months.Count - 3];
            var m3 = months[months.Count - 4];
            slot.LongHigh = Math.Max(m2.High, m3.High);
            slot.LongLow = Math.Min(m2.Low, m3.Low);
            slot.LongStart = m3.Start;
            slot.LongEnd = m1.Start;
            return true;
        }

        private void OnTimerTick()
        {
            foreach (var slot in _slots)
            {
                if (slot.Missing || slot.Bars == null) continue;
                if (slot.Bars.Count < MinPairBars)
                {
                    try { if (slot.Bars.LoadMoreHistory() == 0 && slot.Bars.Count == slot.LastCount) { } }
                    catch { }
                }
                if (slot.Bars.Count != slot.LastCount || (slot.Bars.Count > 0 && slot.Bars.LastBar.OpenTime != slot.LastBarTime))
                {
                    slot.LastCount = slot.Bars.Count;
                    if (slot.Bars.Count > 0) slot.LastBarTime = slot.Bars.LastBar.OpenTime;
                    slot.Ready = slot.Bars.Count > 0 && ApplySnapshot(slot);
                }
            }
            RefreshFeedState();
            if (IsLastBar || (DateTime.UtcNow - _lastPanelRefreshUtc).TotalSeconds >= 1)
            {
                DrawBoxes();
                DrawSwingLines();
                UpdatePanel();
            }
        }

        private static int Vote(double price, double boxHigh, double boxLow)
        {
            if (double.IsNaN(price) || double.IsNaN(boxHigh) || double.IsNaN(boxLow)) return 0;
            return price > boxHigh ? 1 : price < boxLow ? -1 : 0;
        }

        private static void AddVote(int[] target, string currency, int vote)
        {
            var index = CurrencyIndex(currency);
            if (index >= 0) target[index] += vote;
        }

        private static void AddPairVote(int[] target, string pair, int vote)
        {
            AddVote(target, pair.Substring(0, 3), vote);
            AddVote(target, pair.Substring(3, 3), -vote);
        }

        private static int Strongest(int d1, int h4, int h1)
        {
            var positive = Math.Max(0, Math.Max(d1, Math.Max(h4, h1)));
            var negative = Math.Min(0, Math.Min(d1, Math.Min(h4, h1)));
            if (Math.Abs(positive) == Math.Abs(negative)) return 0;
            return Math.Abs(negative) > Math.Abs(positive) ? negative : positive;
        }

        private static bool Conflicted(int d1, int h4, int h1)
        {
            var hasPositive = d1 >= PandaSignificant || h4 >= PandaSignificant || h1 >= PandaSignificant;
            var hasNegative = d1 <= -PandaSignificant || h4 <= -PandaSignificant || h1 <= -PandaSignificant;
            return hasPositive && hasNegative;
        }

        private static string BoxTrend(double formerHigh, double formerLow, double latterHigh, double latterLow)
        {
            if (double.IsNaN(formerHigh) || double.IsNaN(formerLow) || double.IsNaN(latterHigh) || double.IsNaN(latterLow)) return "UNKNOWN";
            var latterMidpoint = (latterHigh + latterLow) / 2.0;
            return latterMidpoint >= formerHigh ? "UPTREND" : latterMidpoint <= formerLow ? "DOWNTREND" : "RANGING";
        }

        private static string SignedScore(int value)
        {
            return value > 0 ? "+" + value.ToString(CultureInfo.InvariantCulture) : value.ToString(CultureInfo.InvariantCulture);
        }

        private static string CurrencyExtremes(string currency, int d1, int h4, int h1)
        {
            var values = "";
            if (Math.Abs(d1) >= PandaSignificant) values = "D1 " + SignedScore(d1);
            if (Math.Abs(h4) >= PandaSignificant) values = values == "" ? "H4 " + SignedScore(h4) : values + " · H4 " + SignedScore(h4);
            if (Math.Abs(h1) >= PandaSignificant) values = values == "" ? "H1 " + SignedScore(h1) : values + " · H1 " + SignedScore(h1);
            return currency + ": " + (values == "" ? "NONE" : values);
        }

        private void RefreshFeedState()
        {
            Array.Clear(_scoresH1, 0, 7);
            Array.Clear(_scoresH4, 0, 7);
            Array.Clear(_scoresD1, 0, 7);
            _readyPairs = 0;
            foreach (var slot in _slots)
            {
                if (!slot.Ready || slot.Bars == null || slot.Bars.Count == 0) continue;
                _readyPairs++;
                var price = slot.Bars.LastBar.Close;
                AddPairVote(_scoresH1, slot.Pair, Vote(price, slot.ShortHigh, slot.ShortLow));
                AddPairVote(_scoresH4, slot.Pair, Vote(price, slot.MediumHigh, slot.MediumLow));
                AddPairVote(_scoresD1, slot.Pair, Vote(price, slot.LongHigh, slot.LongLow));
            }

            var supported = _chartPair != "";
            _scoreReady = supported && _readyPairs == PandaPairs.Length && _activeSlot != null && _activeSlot.Ready;
            if (!_scoreReady)
            {
                _hardInvalid = false;
                _pandaGap = 0;
                _pandaBias = supported ? "DATA UNAVAILABLE" : "UNSUPPORTED SYMBOL";
                _boxH1Trend = "UNKNOWN";
                _boxH4Trend = "UNKNOWN";
                _baseXtfText = "—";
                _quoteXtfText = "—";
                return;
            }

            var baseStrong = Strongest(_scoresD1[_baseIndex], _scoresH4[_baseIndex], _scoresH1[_baseIndex]);
            var quoteStrong = Strongest(_scoresD1[_quoteIndex], _scoresH4[_quoteIndex], _scoresH1[_quoteIndex]);
            var baseConflict = Conflicted(_scoresD1[_baseIndex], _scoresH4[_baseIndex], _scoresH1[_baseIndex]);
            var quoteConflict = Conflicted(_scoresD1[_quoteIndex], _scoresH4[_quoteIndex], _scoresH1[_quoteIndex]);
            var neutralMatchup = Math.Abs(baseStrong) < PandaSignificant && Math.Abs(quoteStrong) < PandaSignificant;
            _hardInvalid = baseConflict || quoteConflict || neutralMatchup;
            _pandaGap = _hardInvalid ? 0 : baseStrong - quoteStrong;
            _pandaBias = _hardInvalid ? "HARD_INVALID" : _pandaGap >= PandaGapThreshold ? "BUY" : _pandaGap <= -PandaGapThreshold ? "SELL" : "WAIT";
            _boxH1Trend = BoxTrend(_activeSlot.MediumHigh, _activeSlot.MediumLow, _activeSlot.ShortHigh, _activeSlot.ShortLow);
            _boxH4Trend = BoxTrend(_activeSlot.LongHigh, _activeSlot.LongLow, _activeSlot.MediumHigh, _activeSlot.MediumLow);
            _baseXtfText = CurrencyExtremes(_chartPair.Substring(0, 3), _scoresD1[_baseIndex], _scoresH4[_baseIndex], _scoresH1[_baseIndex]);
            _quoteXtfText = CurrencyExtremes(_chartPair.Substring(3, 3), _scoresD1[_quoteIndex], _scoresH4[_quoteIndex], _scoresH1[_quoteIndex]);
        }

        public override void Calculate(int index)
        {
            ComputeChartBar(index);
            for (int closed = _lastClosedProcessed + 1; closed <= index - 1; closed++) ProcessClosedBar(closed);
            if (index - 1 > _lastClosedProcessed) _lastClosedProcessed = index - 1;
            if (IsLastBar)
            {
                DrawBoxes();
                DrawSwingLines();
                UpdatePanel();
            }
        }

        // Chart-timeframe SuperTrend (RMA ATR 10, factor 3) and the previous-bar
        // BB(21, 1.0) / SMA-TR(5) Follow Line, both matching the Pine definitions.
        private void ComputeChartBar(int i)
        {
            var high = Bars.HighPrices[i];
            var low = Bars.LowPrices[i];
            var closeValue = Bars.ClosePrices[i];
            var previousClose = i > 0 ? Bars.ClosePrices[i - 1] : closeValue;

            _tr[i] = i == 0 ? high - low : Math.Max(high - low, Math.Max(Math.Abs(high - previousClose), Math.Abs(low - previousClose)));

            if (i == SuperTrendPeriod - 1)
            {
                double sum = 0;
                for (int k = 0; k <= i; k++) sum += _tr[k];
                _atr[i] = sum / SuperTrendPeriod;
            }
            else if (i >= SuperTrendPeriod)
            {
                _atr[i] = (_atr[i - 1] * (SuperTrendPeriod - 1) + _tr[i]) / SuperTrendPeriod;
            }

            if (!double.IsNaN(_atr[i]))
            {
                var mid = (high + low) / 2.0;
                var basicUpper = mid + SuperTrendFactor * _atr[i];
                var basicLower = mid - SuperTrendFactor * _atr[i];
                var previousUpper = i > 0 && !double.IsNaN(_upBand[i - 1]) ? _upBand[i - 1] : basicUpper;
                var previousLower = i > 0 && !double.IsNaN(_lowBand[i - 1]) ? _lowBand[i - 1] : basicLower;
                _upBand[i] = basicUpper < previousUpper || previousClose > previousUpper ? basicUpper : previousUpper;
                _lowBand[i] = basicLower > previousLower || previousClose < previousLower ? basicLower : previousLower;
                var previousTrend = i > 0 && !double.IsNaN(_stTrend[i - 1]) ? _stTrend[i - 1] : 1.0;
                double trend;
                if (previousTrend > 0) trend = closeValue > _upBand[i] ? -1.0 : 1.0;
                else trend = closeValue < _lowBand[i] ? 1.0 : -1.0;
                _stTrend[i] = trend;
                _st[i] = trend > 0 ? _upBand[i] : _lowBand[i];
            }

            if (i >= BbPeriod - 1)
            {
                double sum = 0;
                for (int k = i - BbPeriod + 1; k <= i; k++) sum += Bars.ClosePrices[k];
                var mean = sum / BbPeriod;
                double variance = 0;
                for (int k = i - BbPeriod + 1; k <= i; k++)
                {
                    var deviation = Bars.ClosePrices[k] - mean;
                    variance += deviation * deviation;
                }
                var stdev = Math.Sqrt(variance / BbPeriod) * BbDeviation;
                _bbUpper[i] = mean + stdev;
                _bbLower[i] = mean - stdev;
            }

            if (i >= FollowAtrPeriod - 1)
            {
                double sum = 0;
                for (int k = i - FollowAtrPeriod + 1; k <= i; k++) sum += _tr[k];
                _followAtr[i] = sum / FollowAtrPeriod;
            }

            var previousFollow = i > 0 && !double.IsNaN(_follow[i - 1]) ? _follow[i - 1] : closeValue;
            var bbSignal = 0;
            if (i > 0 && !double.IsNaN(_bbUpper[i - 1])) bbSignal = previousClose > _bbUpper[i - 1] ? 1 : previousClose < _bbLower[i - 1] ? -1 : 0;
            if (bbSignal == 1 && !double.IsNaN(_followAtr[i])) _follow[i] = Math.Max(low - _followAtr[i], previousFollow);
            else if (bbSignal == -1 && !double.IsNaN(_followAtr[i])) _follow[i] = Math.Min(high + _followAtr[i], previousFollow);
            else _follow[i] = previousFollow;

            var supported = _chartPair != "";
            var showLines = ShowPandaLines && supported;
            SuperTrendUp[i] = showLines && !double.IsNaN(_st[i]) && _stTrend[i] < 0 ? _st[i] : double.NaN;
            SuperTrendDown[i] = showLines && !double.IsNaN(_st[i]) && _stTrend[i] > 0 ? _st[i] : double.NaN;
            var followRising = i == 0 || double.IsNaN(_follow[i - 1]) || _follow[i] >= _follow[i - 1];
            FollowLineUp[i] = showLines && !double.IsNaN(_follow[i]) && followRising ? _follow[i] : double.NaN;
            FollowLineDown[i] = showLines && !double.IsNaN(_follow[i]) && !followRising ? _follow[i] : double.NaN;
        }

        private string PandaLineStatusAt(int i)
        {
            if (_chartPair == "" || double.IsNaN(_st[i]) || double.IsNaN(_follow[i])) return "UNKNOWN";
            var closeValue = Bars.ClosePrices[i];
            if (closeValue > Math.Max(_st[i], _follow[i])) return "ABOVE";
            if (closeValue < Math.Min(_st[i], _follow[i])) return "BELOW";
            return "BETWEEN";
        }

        // Confirmed-bar state machine: pivots, one-shot BOS, Panda Lines flips,
        // and the Box-gated one-shot XTF BOS triggers (Pine barstate.isconfirmed).
        private void ProcessClosedBar(int closed)
        {
            var center = closed - SwingLength;
            if (center >= SwingLength)
            {
                var isPivotHigh = true;
                var isPivotLow = true;
                for (int k = center - SwingLength; k <= center + SwingLength; k++)
                {
                    if (k == center) continue;
                    if (Bars.HighPrices[k] >= Bars.HighPrices[center]) isPivotHigh = false;
                    if (Bars.LowPrices[k] <= Bars.LowPrices[center]) isPivotLow = false;
                }
                if (isPivotHigh)
                {
                    _lastSwingHigh = Bars.HighPrices[center];
                    _lastSwingHighIndex = center;
                    _swingHighBroken = false;
                }
                if (isPivotLow)
                {
                    _lastSwingLow = Bars.LowPrices[center];
                    _lastSwingLowIndex = center;
                    _swingLowBroken = false;
                }
            }

            var supported = _chartPair != "";
            var closeValue = Bars.ClosePrices[closed];
            var bosBullish = supported && !_swingHighBroken && !double.IsNaN(_lastSwingHigh) && closeValue > _lastSwingHigh;
            var bosBearish = supported && !_swingLowBroken && !double.IsNaN(_lastSwingLow) && closeValue < _lastSwingLow;
            if (bosBullish)
            {
                _swingHighBroken = true;
                _latestBos = "BULLISH";
                if (ShowBosMarkers) DrawMarker("BosUp", closed, false, "BOS+", PandaBuy);
            }
            if (bosBearish)
            {
                _swingLowBroken = true;
                _latestBos = "BEARISH";
                if (ShowBosMarkers) DrawMarker("BosDn", closed, true, "BOS-", PandaSell);
            }

            var lineStatus = PandaLineStatusAt(closed);
            var bullishFlip = lineStatus == "ABOVE" && _lastDirectionalSide == -1;
            var bearishFlip = lineStatus == "BELOW" && _lastDirectionalSide == 1;
            if (lineStatus == "ABOVE") _lastDirectionalSide = 1;
            else if (lineStatus == "BELOW") _lastDirectionalSide = -1;
            if (bullishFlip)
            {
                _latestFlip = "BULLISH";
                if (ShowFlipMarkers) DrawMarker("FlipUp", closed, false, "PL+", PandaBuy);
            }
            if (bearishFlip)
            {
                _latestFlip = "BEARISH";
                if (ShowFlipMarkers) DrawMarker("FlipDn", closed, true, "PL-", PandaSell);
            }

            var xtfBoxTrend = XtfStructure == PandaXtfStructure.H4 ? _boxH4Trend : _boxH1Trend;
            var buyReady = _pandaBias == "BUY" && lineStatus == "ABOVE" && xtfBoxTrend == "UPTREND";
            var sellReady = _pandaBias == "SELL" && lineStatus == "BELOW" && xtfBoxTrend == "DOWNTREND";
            if (buyReady && bosBullish)
            {
                _triggerBarIndex = closed;
                _triggerDirection = "BUY";
                if (ShowTriggerMarkers) DrawMarker("TriggerUp", closed, false, "BUY", PandaBuy);
            }
            if (sellReady && bosBearish)
            {
                _triggerBarIndex = closed;
                _triggerDirection = "SELL";
                if (ShowTriggerMarkers) DrawMarker("TriggerDn", closed, true, "SELL", PandaSell);
            }
        }

        private void DrawMarker(string kind, int barIndex, bool above, string text, Color color)
        {
            var name = "PandaXtf." + kind + "." + barIndex.ToString(CultureInfo.InvariantCulture);
            var price = above ? Bars.HighPrices[barIndex] : Bars.LowPrices[barIndex];
            var chartText = Chart.DrawText(name, text, Bars.OpenTimes[barIndex], price, color);
            chartText.HorizontalAlignment = HorizontalAlignment.Center;
            chartText.VerticalAlignment = above ? VerticalAlignment.Top : VerticalAlignment.Bottom;
        }

        private void DrawBoxes()
        {
            var visible = ShowBoxes && _scoreReady && _activeSlot != null && _activeSlot.Ready;
            DrawBox("Short", visible, _activeSlot, s => Tuple.Create(s.ShortStart, s.ShortHigh, s.ShortEnd, s.ShortLow), Color.FromArgb(255, 255, 165, 0));
            DrawBox("Medium", visible, _activeSlot, s => Tuple.Create(s.MediumStart, s.MediumHigh, s.MediumEnd, s.MediumLow), Color.FromArgb(255, 0, 200, 120));
            DrawBox("Long", visible, _activeSlot, s => Tuple.Create(s.LongStart, s.LongHigh, s.LongEnd, s.LongLow), Color.FromArgb(255, 70, 120, 255));
        }

        private void DrawBox(string kind, bool visible, PairSlot slot, Func<PairSlot, Tuple<DateTime, double, DateTime, double>> select, Color color)
        {
            var fillName = "PandaXtf.Box" + kind;
            var borderName = "PandaXtf.Box" + kind + ".Border";
            if (!visible || slot == null)
            {
                Chart.RemoveObject(fillName);
                Chart.RemoveObject(borderName);
                return;
            }
            var extent = select(slot);
            var fill = Chart.DrawRectangle(fillName, extent.Item1, extent.Item2, extent.Item3, extent.Item4, Color.FromArgb(25, color.R, color.G, color.B));
            fill.IsFilled = true;
            var border = Chart.DrawRectangle(borderName, extent.Item1, extent.Item2, extent.Item3, extent.Item4, color);
            border.IsFilled = false;
        }

        private void DrawSwingLines()
        {
            var supported = _chartPair != "";
            DrawSwingLine("PandaXtf.SwingHigh", supported && ShowBosLevels && _lastSwingHighIndex >= 0 && !double.IsNaN(_lastSwingHigh),
                _lastSwingHighIndex, _lastSwingHigh, _swingHighBroken, PandaSell);
            DrawSwingLine("PandaXtf.SwingLow", supported && ShowBosLevels && _lastSwingLowIndex >= 0 && !double.IsNaN(_lastSwingLow),
                _lastSwingLowIndex, _lastSwingLow, _swingLowBroken, PandaBuy);
        }

        private void DrawSwingLine(string name, bool visible, int fromIndex, double level, bool broken, Color color)
        {
            if (!visible)
            {
                Chart.RemoveObject(name);
                return;
            }
            var alpha = broken ? 64 : 190;
            var line = Chart.DrawTrendLine(name, Bars.OpenTimes[fromIndex], level, Bars.OpenTimes[Bars.Count - 1], level,
                Color.FromArgb(alpha, color.R, color.G, color.B));
            line.LineStyle = LineStyle.Lines;
            line.Thickness = 1;
        }

        private string SignalStatus()
        {
            if (_triggerBarIndex >= 0 && _triggerBarIndex == _lastClosedProcessed)
                return _triggerDirection == "BUY" ? "BUY TRIGGER" : "SELL TRIGGER";
            var lineStatus = _lastClosedProcessed >= 0 ? PandaLineStatusAt(_lastClosedProcessed) : "UNKNOWN";
            var xtfBoxTrend = XtfStructure == PandaXtfStructure.H4 ? _boxH4Trend : _boxH1Trend;
            if (_pandaBias == "BUY" && lineStatus == "ABOVE" && xtfBoxTrend == "UPTREND") return "BUY READY — WAIT BULLISH BOS";
            if (_pandaBias == "SELL" && lineStatus == "BELOW" && xtfBoxTrend == "DOWNTREND") return "SELL READY — WAIT BEARISH BOS";
            return "NO SETUP";
        }

        private string OtherBoxContext()
        {
            if (_pandaBias != "BUY" && _pandaBias != "SELL") return "UNKNOWN";
            var otherBoxTrend = XtfStructure == PandaXtfStructure.H4 ? _boxH1Trend : _boxH4Trend;
            if (otherBoxTrend == "UNKNOWN") return "UNKNOWN";
            var expected = _pandaBias == "BUY" ? "UPTREND" : "DOWNTREND";
            return otherBoxTrend == expected ? "ALIGNED" : otherBoxTrend == "RANGING" ? "RANGING" : "COUNTER";
        }

        private void RestoreLocation()
        {
            double x;
            double y;
            var savedX = LocalStorage.GetString("PandaXtf X");
            var savedY = LocalStorage.GetString("PandaXtf Y");
            _draggable.X = double.TryParse(savedX, NumberStyles.Float, CultureInfo.InvariantCulture, out x) ? x : 12;
            _draggable.Y = double.TryParse(savedY, NumberStyles.Float, CultureInfo.InvariantCulture, out y)
                ? y : Math.Max(12, Chart.Height - PanelHeightEstimate - 12);
        }

        private void OnLocationChanged(ChartDraggableLocationChangedEventArgs args)
        {
            LocalStorage.SetString("PandaXtf X", args.Draggable.X.ToString(CultureInfo.InvariantCulture), LocalStorageScope.Instance);
            LocalStorage.SetString("PandaXtf Y", args.Draggable.Y.ToString(CultureInfo.InvariantCulture), LocalStorageScope.Instance);
            LocalStorage.Flush(LocalStorageScope.Instance);
        }

        private void Minimize(ButtonClickEventArgs args)
        {
            _minimized = !_minimized;
            LocalStorage.SetString("PandaXtf Minimized", _minimized ? "1" : "0", LocalStorageScope.Instance);
            LocalStorage.Flush(LocalStorageScope.Instance);
            _draggable.Child = BuildPanel();
        }

        private void UpdatePanel()
        {
            if (_draggable == null) return;
            _draggable.Child = BuildPanel();
            _lastPanelRefreshUtc = DateTime.UtcNow;
        }

        private ControlBase BuildPanel()
        {
            var panel = new StackPanel
            {
                Orientation = Orientation.Vertical,
                Width = _minimized ? 220 : 300,
                BackgroundColor = Color.FromArgb(230, 17, 23, 34),
                Margin = 2
            };
            var header = new Grid(1, 3) { Margin = 7 };
            header.AddChild(Text("PANDA XTF", Color.White, 11, true), 0, 0);
            header.AddChild(Text(_chartPair == "" ? "UNSUPPORTED" : _chartPair, _chartPair == "" ? PandaWarn : Color.White, 10, true), 0, 1);
            var minimize = new Button { Text = _minimized ? "+" : "−", Width = 28, Height = 22, Margin = 1 };
            minimize.Click += Minimize;
            header.AddChild(minimize, 0, 2);
            panel.AddChild(header);

            if (!ShowPanel && !_minimized) return panel;
            if (_minimized)
            {
                panel.AddChild(Text(GapText() + "  " + _pandaBias, StatusColorFor(_pandaBias), 12, true));
                return panel;
            }

            panel.AddChild(Row("BIAS", _pandaBias, 13));
            panel.AddChild(Row("GAP", GapText(), 15));
            panel.AddChild(Row("BASE XTF", _baseXtfText, 10));
            panel.AddChild(Row("QUOTE XTF", _quoteXtfText, 10));
            panel.AddChild(Row("XTF", XtfStructure == PandaXtfStructure.H4 ? "H4" : "H1", 11));
            panel.AddChild(Row("XTF BOX", XtfStructure == PandaXtfStructure.H4 ? _boxH4Trend : _boxH1Trend, 11));
            panel.AddChild(Row("OTHER BOX", OtherBoxContext(), 11));
            panel.AddChild(Row("SIGNAL", SignalStatus(), 10));
            panel.AddChild(Row("BOX H1", _boxH1Trend, 11));
            panel.AddChild(Row("BOX H4", _boxH4Trend, 11));
            panel.AddChild(Row("PANDA LINES", _lastClosedProcessed >= 0 ? PandaLineStatusAt(_lastClosedProcessed) : "UNKNOWN", 11));
            panel.AddChild(Row("FLIP", _latestFlip, 11));
            panel.AddChild(Row("BOS", _latestBos, 11));
            panel.AddChild(Text("Local TV port · " + _readyPairs.ToString(CultureInfo.InvariantCulture) + "/21 pairs", _scoreReady ? PandaBuy : PandaWarn, 9, false));
            return panel;
        }

        private string GapText()
        {
            if (!_scoreReady) return "—";
            return _pandaGap > 0 ? "+" + _pandaGap.ToString(CultureInfo.InvariantCulture) : _pandaGap.ToString(CultureInfo.InvariantCulture);
        }

        private Grid Row(string label, string value, double valueSize)
        {
            var row = new Grid(1, 2) { Margin = new Thickness(8, 1, 8, 1) };
            row.AddChild(Text(label, PandaNeutral, 9, false), 0, 0);
            row.AddChild(Text(value, StatusColorFor(value), valueSize, true), 0, 1);
            return row;
        }

        private static TextBlock Text(string value, Color color, double size, bool bold)
        {
            return new TextBlock
            {
                Text = value ?? "—",
                ForegroundColor = color,
                FontSize = size,
                FontWeight = bold ? FontWeight.ExtraBold : FontWeight.Normal,
                Margin = new Thickness(4, 1, 4, 1)
            };
        }

        private static Color StatusColorFor(string value)
        {
            if (value == "BUY" || value == "UPTREND" || value == "ABOVE" || value == "BULLISH" || value == "ALIGNED"
                || value == "BUY TRIGGER" || value == "BUY READY — WAIT BULLISH BOS") return PandaBuy;
            if (value == "SELL" || value == "DOWNTREND" || value == "BELOW" || value == "BEARISH"
                || value == "SELL TRIGGER" || value == "SELL READY — WAIT BEARISH BOS") return PandaSell;
            if (value == "WAIT" || value == "BETWEEN" || value == "RANGING" || value == "COUNTER") return PandaWarn;
            if (value != null && value.StartsWith("+", StringComparison.Ordinal)) return PandaBuy;
            if (value != null && value.StartsWith("-", StringComparison.Ordinal)) return PandaSell;
            return PandaNeutral;
        }
    }
}
