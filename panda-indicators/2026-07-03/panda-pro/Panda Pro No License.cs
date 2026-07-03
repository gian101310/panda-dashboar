using System;
using cAlgo.API;
using cAlgo.API.Internals;

namespace cAlgo.Indicators
{
    [Indicator(IsOverlay = true, TimeZone = TimeZones.UTC, AccessRights = AccessRights.None)]
    public class PandaProNoLicense : Indicator
    {
        private const int TrendPeriod = 10;
        private const double TrendMultiplier = 3.0;
        private const int FollowPeriod = 21;
        private const double FollowDeviation = 1.0;
        private const int FollowAtrPeriod = 5;
        private const double ZoneWidthPercent = 0.02;
        private const int ExtendBars = 5000;
        private const string ObjectPrefix = "PandaPro_";

        [Output("Panda Pro 1", LineColor = "Lime", PlotType = PlotType.DiscontinuousLine, Thickness = 2)]
        public IndicatorDataSeries Line1 { get; set; }

        [Output("Panda Pro 2", LineColor = "Red", PlotType = PlotType.DiscontinuousLine, Thickness = 2)]
        public IndicatorDataSeries Line2 { get; set; }

        [Output("Panda Pro 3", LineColor = "DodgerBlue", PlotType = PlotType.DiscontinuousLine, Thickness = 2)]
        public IndicatorDataSeries Line3 { get; set; }

        [Output("Panda Pro 4", LineColor = "Red", PlotType = PlotType.DiscontinuousLine, Thickness = 2)]
        public IndicatorDataSeries Line4 { get; set; }

        private IndicatorDataSeries _a;
        private IndicatorDataSeries _b;
        private IndicatorDataSeries _c;
        private IndicatorDataSeries _d;
        private IndicatorDataSeries _e;
        private Bars _days;
        private Bars _weeks;
        private Bars _months;

        protected override void Initialize()
        {
            InstanceTitle = "Panda Pro";
            _a = CreateDataSeries();
            _b = CreateDataSeries();
            _c = CreateDataSeries();
            _d = CreateDataSeries();
            _e = CreateDataSeries();
            _days = MarketData.GetBars(TimeFrame.Daily, SymbolName);
            _weeks = MarketData.GetBars(TimeFrame.Weekly, SymbolName);
            _months = MarketData.GetBars(TimeFrame.Monthly, SymbolName);
        }

        public override void Calculate(int index)
        {
            Clear(index);
            int minimum = Math.Max(Math.Max(TrendPeriod, FollowPeriod), FollowAtrPeriod) + 3;
            if (index < minimum)
                return;

            CalculatePrimary(index);
            CalculateSecondary(index);
            if (index == Bars.Count - 1)
                DrawZones(index);
        }

        private void Clear(int index)
        {
            Line1[index] = double.NaN;
            Line2[index] = double.NaN;
            Line3[index] = double.NaN;
            Line4[index] = double.NaN;
        }

        private void CalculatePrimary(int index)
        {
            double range = AverageRange(index, TrendPeriod);
            double middle = (Bars.HighPrices[index] + Bars.LowPrices[index]) / 2.0;
            double upper = middle - TrendMultiplier * range;
            double lower = middle + TrendMultiplier * range;
            double oldUpper = Valid(_a[index - 1]) ? _a[index - 1] : upper;
            double oldLower = Valid(_b[index - 1]) ? _b[index - 1] : lower;

            if (Bars.ClosePrices[index - 1] > oldUpper)
                upper = Math.Max(upper, oldUpper);
            if (Bars.ClosePrices[index - 1] < oldLower)
                lower = Math.Min(lower, oldLower);

            _a[index] = upper;
            _b[index] = lower;
            double oldDirection = Valid(_c[index - 1]) ? _c[index - 1] : 1.0;
            if (oldDirection == -1.0 && Bars.ClosePrices[index - 1] > oldLower)
                _c[index] = 1.0;
            else if (oldDirection == 1.0 && Bars.ClosePrices[index - 1] < oldUpper)
                _c[index] = -1.0;
            else
                _c[index] = oldDirection;

            if (_c[index] == 1.0)
            {
                Line1[index] = upper;
                if (_c[index - 1] == -1.0)
                    Line1[index - 1] = _b[index - 1];
            }
            else
            {
                Line2[index] = lower;
                if (_c[index - 1] == 1.0)
                    Line2[index - 1] = _a[index - 1];
            }
        }

        private void CalculateSecondary(int index)
        {
            double oldLine = Valid(_d[index - 1]) && _d[index - 1] != 0.0
                ? _d[index - 1]
                : Bars.ClosePrices[index];
            int previous = index - 1;
            double average = AverageClose(previous, FollowPeriod);
            double deviation = Deviation(previous, FollowPeriod, average);
            double previousClose = Bars.ClosePrices[previous];
            int state = previousClose > average + FollowDeviation * deviation
                ? 1
                : previousClose < average - FollowDeviation * deviation ? -1 : 0;

            double line = oldLine;
            if (state == 1)
                line = Math.Max(Bars.LowPrices[index] - AverageRange(index, FollowAtrPeriod), oldLine);
            else if (state == -1)
                line = Math.Min(Bars.HighPrices[index] + AverageRange(index, FollowAtrPeriod), oldLine);

            _d[index] = line;
            double oldState = Valid(_e[index - 1]) ? _e[index - 1] : 0.0;
            _e[index] = line > oldLine ? 1.0 : line < oldLine ? -1.0 : oldState;

            if (_e[index] > 0.0)
            {
                Line3[index] = line;
                if (_e[index - 1] <= 0.0)
                    Line3[index - 1] = _d[index - 1];
            }
            else
            {
                Line4[index] = line;
                if (_e[index - 1] > 0.0)
                    Line4[index - 1] = _d[index - 1];
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

        private double AverageRange(int index, int period)
        {
            double sum = 0.0;
            for (int offset = 0; offset < period; offset++)
                sum += TrueRange(index - offset);
            return sum / period;
        }

        private double AverageClose(int index, int period)
        {
            double sum = 0.0;
            for (int offset = 0; offset < period; offset++)
                sum += Bars.ClosePrices[index - offset];
            return sum / period;
        }

        private double Deviation(int index, int period, double mean)
        {
            double sum = 0.0;
            for (int offset = 0; offset < period; offset++)
            {
                double difference = Bars.ClosePrices[index - offset] - mean;
                sum += difference * difference;
            }
            return Math.Sqrt(sum / period);
        }

        private void DrawZones(int index)
        {
            DateTime left = Bars.OpenTimes[Math.Max(0, index - ExtendBars)];
            DateTime right = Bars.OpenTimes[index].AddSeconds(BarSeconds(index) * ExtendBars);
            DrawPeriod(_days, "A", "B", Color.Orange, left, right, 1);
            DrawPeriod(_weeks, "C", "D", Color.DodgerBlue, left, right, 1);
            DrawPeriod(_months, "E", "F", Color.DarkViolet, left, right, 1);

            double high;
            double low;
            PreviousYear(out high, out low);
            if (high > 0.0 && low > 0.0)
            {
                DrawZone("G", high, Color.Crimson, left, right, 2);
                DrawZone("H", low, Color.Crimson, left, right, 2);
            }
        }

        private void DrawPeriod(Bars source, string highName, string lowName, Color color, DateTime left, DateTime right, int thickness)
        {
            if (source == null || source.Count < 2)
                return;
            int previous = source.Count - 2;
            DrawZone(highName, source.HighPrices[previous], color, left, right, thickness);
            DrawZone(lowName, source.LowPrices[previous], color, left, right, thickness);
        }

        private void DrawZone(string name, double level, Color color, DateTime left, DateTime right, int thickness)
        {
            double offset = level * ZoneWidthPercent / 100.0;
            Color fill = Color.FromArgb(35, color.R, color.G, color.B);
            Color edge = Color.FromArgb(190, color.R, color.G, color.B);
            ChartRectangle rectangle = Chart.DrawRectangle(ObjectPrefix + name + "R", left, level + offset, right, level - offset, fill, thickness);
            rectangle.IsFilled = true;
            rectangle.IsInteractive = false;
            ChartTrendLine line = Chart.DrawTrendLine(ObjectPrefix + name + "L", left, level, right, level, edge, 1, LineStyle.Dots);
            line.IsInteractive = false;
        }

        private void PreviousYear(out double high, out double low)
        {
            high = 0.0;
            low = double.MaxValue;
            int year = Server.Time.Year - 1;
            if (_months != null)
            {
                for (int index = 0; index < _months.Count; index++)
                {
                    if (_months.OpenTimes[index].Year != year)
                        continue;
                    high = Math.Max(high, _months.HighPrices[index]);
                    low = Math.Min(low, _months.LowPrices[index]);
                }
            }
            if (low == double.MaxValue)
            {
                high = 0.0;
                low = 0.0;
            }
        }

        private double BarSeconds(int index)
        {
            return index < 1 ? 60.0 : Math.Max(1.0, (Bars.OpenTimes[index] - Bars.OpenTimes[index - 1]).TotalSeconds);
        }

        private static bool Valid(double value)
        {
            return !double.IsNaN(value) && !double.IsInfinity(value);
        }
    }
}
