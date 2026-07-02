// -----------------------------------------------------------------------------
// Panda Lines v2 for cTrader Automate
// Direct port of Panda Lines v2.mq4: SuperTrend + BB TrendLine + S/R zones
// -----------------------------------------------------------------------------

using System;
using cAlgo.API;
using cAlgo.API.Internals;

namespace cAlgo.Indicators
{
    [Indicator(IsOverlay = true, TimeZone = TimeZones.UTC, AccessRights = AccessRights.None)]
    public class PandaLinesV2 : Indicator
    {
        [Parameter("ST Period", Group = "SuperTrend", DefaultValue = 10, MinValue = 1)]
        public int StPeriod { get; set; }

        [Parameter("ST Multiplier", Group = "SuperTrend", DefaultValue = 3.0, MinValue = 0.1, Step = 0.1)]
        public double StMultiplier { get; set; }

        [Parameter("ST Use ATR", Group = "SuperTrend", DefaultValue = true)]
        public bool StUseAtr { get; set; }

        [Parameter("ST Show Signals", Group = "SuperTrend", DefaultValue = true)]
        public bool StShowSignals { get; set; }

        [Parameter("BB Period", Group = "BB TrendLine", DefaultValue = 21, MinValue = 2)]
        public int BbPeriod { get; set; }

        [Parameter("BB Deviations", Group = "BB TrendLine", DefaultValue = 1.0, MinValue = 0.1, Step = 0.1)]
        public double BbDeviations { get; set; }

        [Parameter("BB Use ATR", Group = "BB TrendLine", DefaultValue = true)]
        public bool BbUseAtr { get; set; }

        [Parameter("BB ATR Period", Group = "BB TrendLine", DefaultValue = 5, MinValue = 1)]
        public int BbAtrPeriod { get; set; }

        [Parameter("BB Hide Labels", Group = "BB TrendLine", DefaultValue = false)]
        public bool BbHideLabels { get; set; }

        [Parameter("S/R Show", Group = "S/R Zones", DefaultValue = true)]
        public bool SrShow { get; set; }

        [Parameter("S/R Daily", Group = "S/R Zones", DefaultValue = true)]
        public bool SrDaily { get; set; }

        [Parameter("S/R Weekly", Group = "S/R Zones", DefaultValue = true)]
        public bool SrWeekly { get; set; }

        [Parameter("S/R Monthly", Group = "S/R Zones", DefaultValue = true)]
        public bool SrMonthly { get; set; }

        [Parameter("S/R Yearly", Group = "S/R Zones", DefaultValue = true)]
        public bool SrYearly { get; set; }

        [Parameter("S/R Zone Width %", Group = "S/R Zones", DefaultValue = 0.15, MinValue = 0.01, MaxValue = 1.0, Step = 0.05)]
        public double SrZoneWidth { get; set; }

        [Parameter("S/R Extend Left", Group = "S/R Zones", DefaultValue = 200, MinValue = 0, MaxValue = 5000)]
        public int SrExtendLeft { get; set; }

        [Parameter("S/R Daily Color", Group = "S/R Zones", DefaultValue = "Orange")]
        public Color SrDailyColor { get; set; }

        [Parameter("S/R Weekly Color", Group = "S/R Zones", DefaultValue = "DodgerBlue")]
        public Color SrWeeklyColor { get; set; }

        [Parameter("S/R Monthly Color", Group = "S/R Zones", DefaultValue = "DarkViolet")]
        public Color SrMonthlyColor { get; set; }

        [Parameter("S/R Yearly Color", Group = "S/R Zones", DefaultValue = "Crimson")]
        public Color SrYearlyColor { get; set; }

        [Parameter("Alert SuperTrend", Group = "Alerts", DefaultValue = true)]
        public bool AlertSuperTrend { get; set; }

        [Parameter("Alert BB", Group = "Alerts", DefaultValue = true)]
        public bool AlertBb { get; set; }

        [Output("ST Bullish", LineColor = "Lime", PlotType = PlotType.DiscontinuousLine, Thickness = 2)]
        public IndicatorDataSeries STBullish { get; set; }

        [Output("ST Bearish", LineColor = "Red", PlotType = PlotType.DiscontinuousLine, Thickness = 2)]
        public IndicatorDataSeries STBearish { get; set; }

        [Output("BB Trend Bullish", LineColor = "DodgerBlue", PlotType = PlotType.DiscontinuousLine, Thickness = 2)]
        public IndicatorDataSeries BBTrendBull { get; set; }

        [Output("BB Trend Bearish", LineColor = "Red", PlotType = PlotType.DiscontinuousLine, Thickness = 2)]
        public IndicatorDataSeries BBTrendBear { get; set; }

        private const string ObjectPrefix = "PandaLinesV2_";

        private IndicatorDataSeries _upBand;
        private IndicatorDataSeries _downBand;
        private IndicatorDataSeries _trendDirection;
        private IndicatorDataSeries _bbTrendLine;
        private IndicatorDataSeries _bbTrendDirection;

        private Bars _dailyBars;
        private Bars _weeklyBars;
        private Bars _monthlyBars;
        private DateTime _lastAlertedClosedBarTime = DateTime.MinValue;

        protected override void Initialize()
        {
            _upBand = CreateDataSeries();
            _downBand = CreateDataSeries();
            _trendDirection = CreateDataSeries();
            _bbTrendLine = CreateDataSeries();
            _bbTrendDirection = CreateDataSeries();

            _dailyBars = MarketData.GetBars(TimeFrame.Daily, SymbolName);
            _weeklyBars = MarketData.GetBars(TimeFrame.Weekly, SymbolName);
            _monthlyBars = MarketData.GetBars(TimeFrame.Monthly, SymbolName);
        }

        public override void Calculate(int index)
        {
            ClearOutputs(index);

            int minimumBars = Math.Max(Math.Max(StPeriod, BbPeriod), BbAtrPeriod) + 3;
            if (index < minimumBars)
                return;

            CalculateSuperTrend(index);
            CalculateBBTrend(index);

            if (index == Bars.Count - 1)
            {
                if (SrShow)
                    DrawAllSrZones(index);
                else
                    RemoveObjectsByPrefix(ObjectPrefix + "SR_");

                CheckAlerts(index);
            }
        }

        private void ClearOutputs(int index)
        {
            STBullish[index] = double.NaN;
            STBearish[index] = double.NaN;
            BBTrendBull[index] = double.NaN;
            BBTrendBear[index] = double.NaN;
        }

        private void CalculateSuperTrend(int index)
        {
            // The MQ4 v2 source uses its direct SMA true-range calculation for
            // both settings. Keep the compatibility input while preserving parity.
            double atrValue = AtrSma(index, StPeriod);
            double source = (Bars.HighPrices[index] + Bars.LowPrices[index]) / 2.0;
            double currentUp = source - StMultiplier * atrValue;
            double currentDown = source + StMultiplier * atrValue;

            double previousUp = IsValid(_upBand[index - 1]) ? _upBand[index - 1] : currentUp;
            double previousDown = IsValid(_downBand[index - 1]) ? _downBand[index - 1] : currentDown;

            if (Bars.ClosePrices[index - 1] > previousUp)
                currentUp = Math.Max(currentUp, previousUp);
            if (Bars.ClosePrices[index - 1] < previousDown)
                currentDown = Math.Min(currentDown, previousDown);

            _upBand[index] = currentUp;
            _downBand[index] = currentDown;

            double previousTrend = IsValid(_trendDirection[index - 1]) ? _trendDirection[index - 1] : 1.0;
            if (previousTrend == -1.0 && Bars.ClosePrices[index - 1] > previousDown)
                _trendDirection[index] = 1.0;
            else if (previousTrend == 1.0 && Bars.ClosePrices[index - 1] < previousUp)
                _trendDirection[index] = -1.0;
            else
                _trendDirection[index] = previousTrend;

            double superTrend = _trendDirection[index] == 1.0 ? currentUp : currentDown;
            if (_trendDirection[index] == 1.0)
            {
                STBullish[index] = superTrend;
                if (_trendDirection[index - 1] == -1.0)
                    STBullish[index - 1] = _downBand[index - 1];
            }
            else
            {
                STBearish[index] = superTrend;
                if (_trendDirection[index - 1] == 1.0)
                    STBearish[index - 1] = _upBand[index - 1];
            }

            if (!StShowSignals)
                return;

            double offset = AtrSma(index, 8) * 0.5;
            if (_trendDirection[index] == 1.0 && _trendDirection[index - 1] == -1.0)
            {
                Chart.DrawIcon(
                    ObjectPrefix + "buy_" + Bars.OpenTimes[index].Ticks,
                    ChartIconType.UpArrow,
                    Bars.OpenTimes[index],
                    superTrend - offset,
                    Color.Lime);
            }
            else if (_trendDirection[index] == -1.0 && _trendDirection[index - 1] == 1.0)
            {
                Chart.DrawIcon(
                    ObjectPrefix + "sell_" + Bars.OpenTimes[index].Ticks,
                    ChartIconType.DownArrow,
                    Bars.OpenTimes[index],
                    superTrend + offset,
                    Color.Red);
            }
        }

        private void CalculateBBTrend(int index)
        {
            double atrValue = AtrSma(index, BbAtrPeriod);
            double previousLine = IsValid(_bbTrendLine[index - 1]) && _bbTrendLine[index - 1] != 0.0
                ? _bbTrendLine[index - 1]
                : Bars.ClosePrices[index];

            int previousIndex = index - 1;
            double previousClose = Bars.ClosePrices[previousIndex];
            double previousSma = SmaClose(previousIndex, BbPeriod);
            double previousDeviation = StdDevClose(previousIndex, BbPeriod, previousSma);
            double previousUpper = previousSma + BbDeviations * previousDeviation;
            double previousLower = previousSma - BbDeviations * previousDeviation;

            int signal = 0;
            if (previousClose > previousUpper)
                signal = 1;
            else if (previousClose < previousLower)
                signal = -1;

            double currentLine = previousLine;
            if (signal == 1)
            {
                currentLine = BbUseAtr ? Bars.LowPrices[index] - atrValue : Bars.LowPrices[index];
                currentLine = Math.Max(currentLine, previousLine);
            }
            else if (signal == -1)
            {
                currentLine = BbUseAtr ? Bars.HighPrices[index] + atrValue : Bars.HighPrices[index];
                currentLine = Math.Min(currentLine, previousLine);
            }

            _bbTrendLine[index] = currentLine;
            double previousTrend = IsValid(_bbTrendDirection[index - 1]) ? _bbTrendDirection[index - 1] : 0.0;
            _bbTrendDirection[index] = previousTrend;
            if (currentLine > previousLine)
                _bbTrendDirection[index] = 1.0;
            else if (currentLine < previousLine)
                _bbTrendDirection[index] = -1.0;

            if (_bbTrendDirection[index] > 0.0)
            {
                BBTrendBull[index] = currentLine;
                if (_bbTrendDirection[index - 1] <= 0.0)
                    BBTrendBull[index - 1] = _bbTrendLine[index - 1];
            }
            else
            {
                BBTrendBear[index] = currentLine;
                if (_bbTrendDirection[index - 1] > 0.0)
                    BBTrendBear[index - 1] = _bbTrendLine[index - 1];
            }

            if (BbHideLabels)
                return;

            double labelOffset = AtrSma(index, 8);
            if (_bbTrendDirection[index] == 1.0 && _bbTrendDirection[index - 1] == -1.0)
            {
                Chart.DrawIcon(
                    ObjectPrefix + "bbBuy_" + Bars.OpenTimes[index].Ticks,
                    ChartIconType.Diamond,
                    Bars.OpenTimes[index],
                    currentLine - labelOffset,
                    Color.DodgerBlue);
            }
            else if (_bbTrendDirection[index] == -1.0 && _bbTrendDirection[index - 1] == 1.0)
            {
                Chart.DrawIcon(
                    ObjectPrefix + "bbSell_" + Bars.OpenTimes[index].Ticks,
                    ChartIconType.Diamond,
                    Bars.OpenTimes[index],
                    currentLine + labelOffset,
                    Color.Red);
            }
        }

        private double TrueRange(int index)
        {
            if (index <= 0)
                return Bars.HighPrices[index] - Bars.LowPrices[index];

            return Math.Max(
                Bars.HighPrices[index] - Bars.LowPrices[index],
                Math.Max(
                    Math.Abs(Bars.HighPrices[index] - Bars.ClosePrices[index - 1]),
                    Math.Abs(Bars.LowPrices[index] - Bars.ClosePrices[index - 1])));
        }

        private double AtrSma(int index, int period)
        {
            double sum = 0.0;
            for (int offset = 0; offset < period; offset++)
                sum += TrueRange(index - offset);

            return sum / period;
        }

        private double SmaClose(int index, int period)
        {
            double sum = 0.0;
            for (int offset = 0; offset < period; offset++)
                sum += Bars.ClosePrices[index - offset];

            return sum / period;
        }

        private double StdDevClose(int index, int period, double mean)
        {
            double sum = 0.0;
            for (int offset = 0; offset < period; offset++)
            {
                double difference = Bars.ClosePrices[index - offset] - mean;
                sum += difference * difference;
            }

            return Math.Sqrt(sum / period);
        }

        private void DrawAllSrZones(int index)
        {
            DateTime timeLeft = Bars.OpenTimes[Math.Max(0, index - SrExtendLeft)];
            DateTime timeRight = Bars.OpenTimes[index].AddSeconds(EstimateBarSeconds(index) * 50.0);

            DrawPreviousPeriodZones(_dailyBars, SrDaily, "PDH", "PDL", SrDailyColor, timeLeft, timeRight, 1);
            DrawPreviousPeriodZones(_weeklyBars, SrWeekly, "PWH", "PWL", SrWeeklyColor, timeLeft, timeRight, 1);
            DrawPreviousPeriodZones(_monthlyBars, SrMonthly, "PMH", "PML", SrMonthlyColor, timeLeft, timeRight, 1);

            if (!SrYearly)
            {
                RemoveZone("PYH");
                RemoveZone("PYL");
                return;
            }

            double previousYearHigh;
            double previousYearLow;
            GetPreviousYearHighLow(out previousYearHigh, out previousYearLow);
            if (previousYearHigh > 0.0 && previousYearLow > 0.0)
            {
                DrawZone("PYH", previousYearHigh, SrYearlyColor, timeLeft, timeRight, 2);
                DrawZone("PYL", previousYearLow, SrYearlyColor, timeLeft, timeRight, 2);
            }
        }

        private void DrawPreviousPeriodZones(
            Bars higherTimeframeBars,
            bool enabled,
            string highLabel,
            string lowLabel,
            Color color,
            DateTime timeLeft,
            DateTime timeRight,
            int thickness)
        {
            if (!enabled || higherTimeframeBars == null || higherTimeframeBars.Count < 2)
            {
                RemoveZone(highLabel);
                RemoveZone(lowLabel);
                return;
            }

            int previousCompletedIndex = higherTimeframeBars.Count - 2;
            double high = higherTimeframeBars.HighPrices[previousCompletedIndex];
            double low = higherTimeframeBars.LowPrices[previousCompletedIndex];
            if (high > 0.0 && low > 0.0)
            {
                DrawZone(highLabel, high, color, timeLeft, timeRight, thickness);
                DrawZone(lowLabel, low, color, timeLeft, timeRight, thickness);
            }
        }

        private void DrawZone(
            string label,
            double level,
            Color color,
            DateTime timeLeft,
            DateTime timeRight,
            int thickness)
        {
            double offset = level * SrZoneWidth / 100.0;
            Color fillColor = Color.FromArgb(35, color.R, color.G, color.B);
            Color lineColor = Color.FromArgb(190, color.R, color.G, color.B);

            ChartRectangle rectangle = Chart.DrawRectangle(
                ZoneObjectName(label, "zone"),
                timeLeft,
                level + offset,
                timeRight,
                level - offset,
                fillColor,
                thickness);
            rectangle.IsFilled = true;
            rectangle.IsInteractive = false;

            ChartHorizontalLine line = Chart.DrawHorizontalLine(
                ZoneObjectName(label, "line"),
                level,
                lineColor,
                1,
                LineStyle.Dots);
            line.IsInteractive = false;

            ChartText text = Chart.DrawText(
                ZoneObjectName(label, "text"),
                label + "  " + level.ToString("F" + Symbol.Digits),
                timeRight,
                level,
                color);
            text.IsInteractive = false;
        }

        private void GetPreviousYearHighLow(out double yearHigh, out double yearLow)
        {
            yearHigh = 0.0;
            yearLow = double.MaxValue;
            if (_monthlyBars == null)
            {
                yearLow = 0.0;
                return;
            }

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

        private void CheckAlerts(int index)
        {
            if (index != Bars.Count - 1 || index < 3)
                return;

            DateTime closedBarTime = Bars.OpenTimes[index - 1];
            if (closedBarTime == _lastAlertedClosedBarTime)
                return;

            if (AlertSuperTrend)
            {
                if (_trendDirection[index - 1] == 1.0 && _trendDirection[index - 2] == -1.0)
                    Notifications.PlaySound(SoundType.PositiveNotification);
                else if (_trendDirection[index - 1] == -1.0 && _trendDirection[index - 2] == 1.0)
                    Notifications.PlaySound(SoundType.NegativeNotification);
            }

            if (AlertBb)
            {
                if (_bbTrendDirection[index - 1] == 1.0 && _bbTrendDirection[index - 2] == -1.0)
                    Notifications.PlaySound(SoundType.PositiveNotification);
                else if (_bbTrendDirection[index - 1] == -1.0 && _bbTrendDirection[index - 2] == 1.0)
                    Notifications.PlaySound(SoundType.NegativeNotification);
            }

            _lastAlertedClosedBarTime = closedBarTime;
        }

        private double EstimateBarSeconds(int index)
        {
            if (index < 1)
                return 60.0;

            return Math.Max(1.0, (Bars.OpenTimes[index] - Bars.OpenTimes[index - 1]).TotalSeconds);
        }

        private static bool IsValid(double value)
        {
            return !double.IsNaN(value) && !double.IsInfinity(value);
        }

        private static string ZoneObjectName(string label, string suffix)
        {
            return ObjectPrefix + "SR_" + label + "_" + suffix;
        }

        private void RemoveZone(string label)
        {
            Chart.RemoveObject(ZoneObjectName(label, "zone"));
            Chart.RemoveObject(ZoneObjectName(label, "line"));
            Chart.RemoveObject(ZoneObjectName(label, "text"));
        }

        private void RemoveObjectsByPrefix(string prefix)
        {
            for (int index = Chart.Objects.Count - 1; index >= 0; index--)
            {
                ChartObject chartObject = Chart.Objects[index];
                if (chartObject.Name.StartsWith(prefix, StringComparison.Ordinal))
                    Chart.RemoveObject(chartObject.Name);
            }
        }
    }
}
