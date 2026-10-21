using System;
using System.Collections.Generic;
using System.Linq;
using cAlgo.API;
using cAlgo.API.Internals;

namespace cAlgo
{
    [Indicator(IsOverlay = true, TimeZone = TimeZones.UTC, AccessRights = AccessRights.None)]
    public class PandaLevelsV2Licensed : Indicator
    {
        // OWNER: replace 0 with the user's cTrader trading account number, then rebuild.
        // This is the trading account number, NOT the user's cTrader ID.
        private const int LicensedAccountNumber = 0;

        // OPTIONAL: leave blank for account-only licensing; otherwise use Account.BrokerName.
        private const string LicensedBrokerName = "";

        // License values are compiled into the file, never exposed as Parameters.
        private readonly string ObjectPrefix = "PandaLevelsV2Licensed." + Guid.NewGuid().ToString("N") + ".";
        private bool? _licenseState;
        private static readonly Color ShortBoxColor = Color.FromArgb(255, 255, 165, 0);
        private static readonly Color MediumBoxColor = Color.FromArgb(255, 0, 200, 120);
        private static readonly Color LongBoxColor = Color.FromArgb(255, 70, 120, 255);
        private static readonly Color PreviousDayColor = Color.Orange;
        private static readonly Color PreviousWeekColor = Color.DodgerBlue;
        private static readonly Color PreviousMonthColor = Color.DarkViolet;
        private static readonly Color PreviousYearColor = Color.Crimson;

        [Parameter("Fill Boxes", DefaultValue = true, Group = "Panda Boxes")]
        public bool FillBoxes { get; set; }

        [Parameter("Box Fill Opacity (%)", DefaultValue = 20, MinValue = 0, MaxValue = 100, Group = "Panda Boxes")]
        public int BoxFillOpacity { get; set; }

        [Parameter("Show Panda Lines", DefaultValue = false, Group = "Panda Lines")]
        public bool ShowPandaLines { get; set; }

        // Fixed Panda Lines defaults; only the master visibility switch is exposed.
        private const bool ShowSuperTrend = true;
        private const int SuperTrendPeriod = 10;
        private const double SuperTrendFactor = 3.0;
        private const bool SuperTrendUseAtr = true;
        private const bool ShowFollowLine = true;
        private const int FollowBbPeriod = 21;
        private const double FollowBbDeviation = 1.0;
        private const bool FollowUseAtr = true;
        private const int FollowAtrPeriod = 5;

        [Output("Panda SuperTrend Up", LineColor = "Lime", PlotType = PlotType.DiscontinuousLine, Thickness = 2)]
        public IndicatorDataSeries SuperTrendUp { get; set; }

        [Output("Panda SuperTrend Down", LineColor = "Red", PlotType = PlotType.DiscontinuousLine, Thickness = 2)]
        public IndicatorDataSeries SuperTrendDown { get; set; }

        [Output("Panda Follow Line Up", LineColor = "DeepSkyBlue", PlotType = PlotType.DiscontinuousLine, Thickness = 2)]
        public IndicatorDataSeries FollowLineUp { get; set; }

        [Output("Panda Follow Line Down", LineColor = "Red", PlotType = PlotType.DiscontinuousLine, Thickness = 2)]
        public IndicatorDataSeries FollowLineDown { get; set; }

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
        private IndicatorDataSeries _followTrend;

        private sealed class PeriodRange
        {
            public DateTime Start;
            public double High;
            public double Low;
        }

        private sealed class BoxSnapshot
        {
            public DateTime ShortStart, ShortEnd, MediumStart, MediumEnd, LongStart, LongEnd;
            public double ShortHigh, ShortLow, MediumHigh, MediumLow, LongHigh, LongLow;
        }

        private Bars _hourlyBars;
        private Bars _dailyBars;
        private Bars _weeklyBars;
        private Bars _monthlyBars;
        private DateTime _lastHourlyBarTime = DateTime.MinValue;
        private DateTime _lastDailyBarTime = DateTime.MinValue;

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
            _followTrend = CreateDataSeries();
            Account.Switched += OnAccountSwitched;
            RefreshLicense();
            Timer.Start(1);
        }

        public override void Calculate(int index)
        {
            if (!RefreshLicense())
                return;
            ComputeChartBar(index);
            if (index != Bars.Count - 1 || _hourlyBars == null || _dailyBars == null ||
                _weeklyBars == null || _monthlyBars == null)
                return;

            DateTime hourlyTime = _hourlyBars.Count > 0 ? _hourlyBars.LastBar.OpenTime : DateTime.MinValue;
            DateTime dailyTime = _dailyBars.Count > 0 ? _dailyBars.LastBar.OpenTime : DateTime.MinValue;
            if (hourlyTime == _lastHourlyBarTime && dailyTime == _lastDailyBarTime)
                return;

            _lastHourlyBarTime = hourlyTime;
            _lastDailyBarTime = dailyTime;
            DrawPandaBoxes();
            DrawPreviousPeriodLevels();
        }

        private bool RefreshLicense()
        {
            bool allowed = AccountLicense.Matches(Account.Number, Account.BrokerName,
                LicensedAccountNumber, LicensedBrokerName);
            if (_licenseState.HasValue && _licenseState.Value == allowed)
                return allowed;

            _licenseState = allowed;
            RemoveOwnedObjects();
            if (!allowed)
            {
                // Clear all historical output too, so switching accounts cannot leave lines behind.
                for (int i = 0; i < Bars.Count; i++)
                {
                    SuperTrendUp[i] = double.NaN;
                    SuperTrendDown[i] = double.NaN;
                    FollowLineUp[i] = double.NaN;
                    FollowLineDown[i] = double.NaN;
                }
                Chart.DrawStaticText(ObjectPrefix + "License", "Account not licensed",
                    VerticalAlignment.Center, HorizontalAlignment.Center, Color.OrangeRed);
                return false;
            }

            if (_hourlyBars == null)
            {
                _hourlyBars = MarketData.GetBars(TimeFrame.Hour, SymbolName);
                _dailyBars = MarketData.GetBars(TimeFrame.Daily, SymbolName);
                _weeklyBars = MarketData.GetBars(TimeFrame.Weekly, SymbolName);
                _monthlyBars = MarketData.GetBars(TimeFrame.Monthly, SymbolName);
                LoadRequiredHourlyHistory();
            }
            // Restore the full overlay when switching back to the licensed account.
            for (int i = 0; i < Bars.Count; i++)
                ComputeChartBar(i);
            _lastHourlyBarTime = DateTime.MinValue;
            _lastDailyBarTime = DateTime.MinValue;
            if (Bars.Count > 0)
            {
                DrawPandaBoxes();
                DrawPreviousPeriodLevels();
            }
            return true;
        }

        private void OnAccountSwitched(AccountSwitchedEventArgs args)
        {
            RefreshLicense();
        }

        protected override void OnTimer()
        {
            // Recheck even when the market is closed and no ticks are arriving.
            RefreshLicense();
        }

        private void RemoveOwnedObjects()
        {
            foreach (var item in Chart.Objects.Where(item =>
                item.Name.StartsWith(ObjectPrefix, StringComparison.Ordinal)).ToArray())
                Chart.RemoveObject(item.Name);
        }

        protected override void OnDestroy()
        {
            Account.Switched -= OnAccountSwitched;
            Timer.Stop();
            RemoveOwnedObjects();
        }

        // Chart-timeframe Panda Lines preserve the proven legacy cTrader behaviour:
        // simple-ATR SuperTrend evaluated from the prior closed bar, plus the
        // configurable previous-bar Bollinger / ATR Follow Line.
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
                double sum = 0;
                for (int k = i - SuperTrendPeriod + 1; k <= i; k++) sum += _tr[k];
                _atr[i] = sum / SuperTrendPeriod;
            }

            var superTrendAtr = SuperTrendUseAtr ? _atr[i] : SimpleTrueRangeAverage(i, SuperTrendPeriod);
            if (!double.IsNaN(superTrendAtr))
            {
                var mid = (high + low) / 2.0;
                var basicLower = mid - SuperTrendFactor * superTrendAtr;
                var basicUpper = mid + SuperTrendFactor * superTrendAtr;
                var previousLower = i > 0 && !double.IsNaN(_lowBand[i - 1]) ? _lowBand[i - 1] : basicLower;
                var previousUpper = i > 0 && !double.IsNaN(_upBand[i - 1]) ? _upBand[i - 1] : basicUpper;
                var currentLower = previousClose > previousLower ? Math.Max(basicLower, previousLower) : basicLower;
                var currentUpper = previousClose < previousUpper ? Math.Min(basicUpper, previousUpper) : basicUpper;
                _lowBand[i] = currentLower;
                _upBand[i] = currentUpper;
                var previousTrend = i > 0 && !double.IsNaN(_stTrend[i - 1]) ? _stTrend[i - 1] : 1.0;
                var trend = previousTrend;
                if (previousTrend == -1.0 && previousClose > previousUpper) trend = 1.0;
                else if (previousTrend == 1.0 && previousClose < previousLower) trend = -1.0;
                _stTrend[i] = trend;
                _st[i] = trend == 1.0 ? currentLower : currentUpper;
            }

            if (i >= FollowBbPeriod - 1)
            {
                double sum = 0;
                for (int k = i - FollowBbPeriod + 1; k <= i; k++) sum += Bars.ClosePrices[k];
                var mean = sum / FollowBbPeriod;
                double variance = 0;
                for (int k = i - FollowBbPeriod + 1; k <= i; k++)
                {
                    var deviation = Bars.ClosePrices[k] - mean;
                    variance += deviation * deviation;
                }
                var stdev = Math.Sqrt(variance / FollowBbPeriod) * FollowBbDeviation;
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
            if (bbSignal == 1) _follow[i] = Math.Max(FollowUseAtr && !double.IsNaN(_followAtr[i]) ? low - _followAtr[i] : low, previousFollow);
            else if (bbSignal == -1) _follow[i] = Math.Min(FollowUseAtr && !double.IsNaN(_followAtr[i]) ? high + _followAtr[i] : high, previousFollow);
            else _follow[i] = previousFollow;

            var previousFollowTrend = i > 0 && !double.IsNaN(_followTrend[i - 1]) ? _followTrend[i - 1] : 0.0;
            var followTrend = previousFollowTrend;
            if (_follow[i] > previousFollow) followTrend = 1.0;
            else if (_follow[i] < previousFollow) followTrend = -1.0;
            _followTrend[i] = followTrend;

            var showLines = ShowPandaLines;
            if (!showLines)
            {
                SuperTrendUp[i] = double.NaN;
                SuperTrendDown[i] = double.NaN;
                FollowLineUp[i] = double.NaN;
                FollowLineDown[i] = double.NaN;
                return;
            }

            if (ShowSuperTrend && !double.IsNaN(_st[i]) && _stTrend[i] == 1.0)
            {
                SuperTrendUp[i] = _st[i];
                SuperTrendDown[i] = double.NaN;
                if (i > 0 && _stTrend[i - 1] == -1.0) SuperTrendUp[i - 1] = _st[i - 1];
            }
            else
            {
                SuperTrendDown[i] = ShowSuperTrend && !double.IsNaN(_st[i]) ? _st[i] : double.NaN;
                SuperTrendUp[i] = double.NaN;
                if (ShowSuperTrend && i > 0 && _stTrend[i - 1] == 1.0) SuperTrendDown[i - 1] = _st[i - 1];
            }

            if (ShowFollowLine && !double.IsNaN(_follow[i]) && _followTrend[i] > 0.0)
            {
                FollowLineUp[i] = _follow[i];
                FollowLineDown[i] = double.NaN;
                if (i > 0 && _followTrend[i - 1] <= 0.0) FollowLineUp[i - 1] = _follow[i - 1];
            }
            else
            {
                FollowLineDown[i] = ShowFollowLine && !double.IsNaN(_follow[i]) ? _follow[i] : double.NaN;
                FollowLineUp[i] = double.NaN;
                if (ShowFollowLine && i > 0 && _followTrend[i - 1] > 0.0) FollowLineDown[i - 1] = _follow[i - 1];
            }
        }

        // Matches the legacy fallback used when the SuperTrend ATR toggle is off.
        private double SimpleTrueRangeAverage(int index, int period)
        {
            if (index < period - 1) return double.NaN;
            double sum = 0;
            for (int offset = 0; offset < period; offset++)
            {
                var i = index - offset;
                if (i < 1) break;
                sum += _tr[i];
            }
            return sum / period;
        }

        private void LoadRequiredHourlyHistory()
        {
            if (_hourlyBars == null)
                return;

            while (BuildPeriods(_hourlyBars, MonthKey).Count < 4)
            {
                if (_hourlyBars.LoadMoreHistory() == 0)
                    return;
            }
        }

        private void DrawPandaBoxes()
        {
            BoxSnapshot snapshot;
            if (!TryBuildSnapshot(out snapshot))
            {
                RemoveBox("Short");
                RemoveBox("Medium");
                RemoveBox("Long");
                return;
            }

            DrawBox("Short", snapshot.ShortStart, snapshot.ShortHigh, snapshot.ShortEnd, snapshot.ShortLow, ShortBoxColor);
            DrawBox("Medium", snapshot.MediumStart, snapshot.MediumHigh, snapshot.MediumEnd, snapshot.MediumLow, MediumBoxColor);
            DrawBox("Long", snapshot.LongStart, snapshot.LongHigh, snapshot.LongEnd, snapshot.LongLow, LongBoxColor);
        }

        private bool TryBuildSnapshot(out BoxSnapshot snapshot)
        {
            snapshot = null;
            var days = BuildPeriods(_hourlyBars, DayKey);
            var weeks = BuildPeriods(_hourlyBars, WeekKey);
            var months = BuildPeriods(_hourlyBars, MonthKey);
            if (days.Count < 4 || weeks.Count < 4 || months.Count < 4)
                return false;

            var d1 = days[days.Count - 2];
            var d2 = days[days.Count - 3];
            var d3 = days[days.Count - 4];
            var w1 = weeks[weeks.Count - 2];
            var w2 = weeks[weeks.Count - 3];
            var w3 = weeks[weeks.Count - 4];
            var m1 = months[months.Count - 2];
            var m2 = months[months.Count - 3];
            var m3 = months[months.Count - 4];

            snapshot = new BoxSnapshot
            {
                ShortHigh = Math.Max(d2.High, d3.High),
                ShortLow = Math.Min(d2.Low, d3.Low),
                ShortStart = d3.Start,
                ShortEnd = d1.Start,
                MediumHigh = Math.Max(w2.High, w3.High),
                MediumLow = Math.Min(w2.Low, w3.Low),
                MediumStart = w3.Start,
                MediumEnd = w1.Start,
                LongHigh = Math.Max(m2.High, m3.High),
                LongLow = Math.Min(m2.Low, m3.Low),
                LongStart = m3.Start,
                LongEnd = m1.Start
            };
            return true;
        }

        private static List<PeriodRange> BuildPeriods(Bars bars, Func<DateTime, DateTime> keyOf)
        {
            var periods = new List<PeriodRange>();
            DateTime currentKey = DateTime.MinValue;
            PeriodRange current = null;

            for (int index = 0; index < bars.Count; index++)
            {
                DateTime key = keyOf(bars.OpenTimes[index]);
                if (current == null || key != currentKey)
                {
                    current = new PeriodRange
                    {
                        Start = bars.OpenTimes[index],
                        High = bars.HighPrices[index],
                        Low = bars.LowPrices[index]
                    };
                    periods.Add(current);
                    currentKey = key;
                }
                else
                {
                    current.High = Math.Max(current.High, bars.HighPrices[index]);
                    current.Low = Math.Min(current.Low, bars.LowPrices[index]);
                }
            }

            return periods;
        }

        private static DateTime DayKey(DateTime time)
        {
            return time.Date;
        }

        private static DateTime WeekKey(DateTime time)
        {
            DateTime date = time.Date;
            return date.AddDays(-(((int)date.DayOfWeek + 6) % 7));
        }

        private static DateTime MonthKey(DateTime time)
        {
            return new DateTime(time.Year, time.Month, 1);
        }

        private void DrawBox(string label, DateTime start, double high, DateTime end, double low, Color color)
        {
            string prefix = ObjectPrefix + "Box." + label;
            var fill = Chart.DrawRectangle(prefix + ".Fill", start, high, end, low,
                Color.FromArgb(FillBoxes ? (int)Math.Round(255.0 * BoxFillOpacity / 100.0) : 0, color.R, color.G, color.B));
            fill.IsFilled = true;
            fill.IsInteractive = false;

            var border = Chart.DrawRectangle(prefix + ".Border", start, high, end, low, color);
            border.IsFilled = false;
            border.IsInteractive = false;
        }

        private void RemoveBox(string label)
        {
            string prefix = ObjectPrefix + "Box." + label;
            Chart.RemoveObject(prefix + ".Fill");
            Chart.RemoveObject(prefix + ".Border");
        }

        private void DrawPreviousPeriodLevels()
        {
            int index = Bars.Count - 1;
            DateTime timeRight = Bars.OpenTimes[index].AddSeconds(EstimateBarSeconds(index) * 50.0);

            DrawPreviousPeriodPair(_dailyBars, "PDH", "PDL", PreviousDayColor, timeRight);
            DrawPreviousPeriodPair(_weeklyBars, "PWH", "PWL", PreviousWeekColor, timeRight);
            DrawPreviousPeriodPair(_monthlyBars, "PMH", "PML", PreviousMonthColor, timeRight);

            double previousYearHigh;
            double previousYearLow;
            GetPreviousYearHighLow(out previousYearHigh, out previousYearLow);
            if (previousYearHigh > 0.0 && previousYearLow > 0.0)
            {
                DrawPreviousPeriodLevel("PYH", previousYearHigh, PreviousYearColor, timeRight);
                DrawPreviousPeriodLevel("PYL", previousYearLow, PreviousYearColor, timeRight);
            }
            else
            {
                RemovePreviousPeriodLevel("PYH");
                RemovePreviousPeriodLevel("PYL");
            }
        }

        private void DrawPreviousPeriodPair(Bars higherTimeframeBars, string highLabel, string lowLabel,
            Color color, DateTime timeRight)
        {
            if (higherTimeframeBars == null || higherTimeframeBars.Count < 2)
            {
                RemovePreviousPeriodLevel(highLabel);
                RemovePreviousPeriodLevel(lowLabel);
                return;
            }

            int previousCompletedIndex = higherTimeframeBars.Count - 2;
            double high = higherTimeframeBars.HighPrices[previousCompletedIndex];
            double low = higherTimeframeBars.LowPrices[previousCompletedIndex];
            if (high > 0.0 && low > 0.0)
            {
                DrawPreviousPeriodLevel(highLabel, high, color, timeRight);
                DrawPreviousPeriodLevel(lowLabel, low, color, timeRight);
            }
        }

        private void DrawPreviousPeriodLevel(string label, double level, Color color, DateTime timeRight)
        {
            string prefix = ObjectPrefix + "Level." + label;
            Color lineColor = Color.FromArgb(190, color.R, color.G, color.B);

            var line = Chart.DrawHorizontalLine(prefix + ".Line", level, lineColor, 1, LineStyle.Dots);
            line.IsInteractive = false;

            var text = Chart.DrawText(prefix + ".Text", label + "  " + level.ToString("F" + Symbol.Digits),
                timeRight, level, color);
            text.IsInteractive = false;
        }

        private void GetPreviousYearHighLow(out double yearHigh, out double yearLow)
        {
            yearHigh = 0.0;
            yearLow = double.MaxValue;
            int previousYear = Server.Time.Year - 1;

            for (int index = 0; index < _monthlyBars.Count; index++)
            {
                if (_monthlyBars.OpenTimes[index].Year != previousYear)
                    continue;

                yearHigh = Math.Max(yearHigh, _monthlyBars.HighPrices[index]);
                yearLow = Math.Min(yearLow, _monthlyBars.LowPrices[index]);
            }

            if (yearLow == double.MaxValue)
            {
                yearHigh = 0.0;
                yearLow = 0.0;
            }
        }

        private double EstimateBarSeconds(int index)
        {
            if (index <= 0)
                return 60.0;

            double seconds = (Bars.OpenTimes[index] - Bars.OpenTimes[index - 1]).TotalSeconds;
            return seconds > 0.0 ? seconds : 60.0;
        }

        private void RemovePreviousPeriodLevel(string label)
        {
            string prefix = ObjectPrefix + "Level." + label;
            Chart.RemoveObject(prefix + ".Line");
            Chart.RemoveObject(prefix + ".Text");
        }
    }

    internal static class AccountLicense
    {
        internal static bool Matches(int actualAccount, string actualBroker,
            int allowedAccount, string allowedBroker)
        {
            // An unset account always fails closed. A blank broker is optional.
            if (allowedAccount <= 0 || actualAccount != allowedAccount)
                return false;
            if (string.IsNullOrWhiteSpace(allowedBroker))
                return true;
            if (allowedBroker == "REPLACE_WITH_BROKER_NAME")
                return false;
            return string.Equals(actualBroker, allowedBroker, StringComparison.OrdinalIgnoreCase);
        }
    }
}
