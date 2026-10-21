using System;
using System.Collections.Generic;
using cAlgo.API;
using cAlgo.API.Internals;

namespace cAlgo
{
    [Indicator(IsOverlay = true, TimeZone = TimeZones.UTC, AccessRights = AccessRights.None)]
    public class PandaLevels : Indicator
    {
        private const string ObjectPrefix = "PandaLevels.";
        private static readonly Color ShortBoxColor = Color.FromArgb(255, 255, 165, 0);
        private static readonly Color MediumBoxColor = Color.FromArgb(255, 0, 200, 120);
        private static readonly Color LongBoxColor = Color.FromArgb(255, 70, 120, 255);
        private static readonly Color PreviousDayColor = Color.Orange;
        private static readonly Color PreviousWeekColor = Color.LimeGreen;
        private static readonly Color PreviousMonthColor = Color.DeepSkyBlue;
        private static readonly Color PreviousYearColor = Color.Magenta;

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
        private DateTime _lastHourlyBarTime = DateTime.MinValue;
        private DateTime _lastDailyBarTime = DateTime.MinValue;

        protected override void Initialize()
        {
            _hourlyBars = MarketData.GetBars(TimeFrame.Hour, SymbolName);
            _dailyBars = MarketData.GetBars(TimeFrame.Daily, SymbolName);
            LoadRequiredHourlyHistory();
            LoadRequiredDailyHistory();
        }

        public override void Calculate(int index)
        {
            if (index != Bars.Count - 1 || _hourlyBars == null || _dailyBars == null)
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

        private void LoadRequiredDailyHistory()
        {
            if (_dailyBars == null)
                return;

            while (BuildPeriods(_dailyBars, YearKey).Count < 2)
            {
                if (_dailyBars.LoadMoreHistory() == 0)
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

        private static DateTime YearKey(DateTime time)
        {
            return new DateTime(time.Year, 1, 1);
        }

        private void DrawBox(string label, DateTime start, double high, DateTime end, double low, Color color)
        {
            string prefix = ObjectPrefix + "Box." + label;
            var fill = Chart.DrawRectangle(prefix + ".Fill", start, high, end, low,
                Color.FromArgb(25, color.R, color.G, color.B));
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
            DrawPreviousPeriodPair(BuildPeriods(_dailyBars, DayKey), "PDH", "PDL", PreviousDayColor);
            DrawPreviousPeriodPair(BuildPeriods(_dailyBars, WeekKey), "PWH", "PWL", PreviousWeekColor);
            DrawPreviousPeriodPair(BuildPeriods(_dailyBars, MonthKey), "PMH", "PML", PreviousMonthColor);
            DrawPreviousPeriodPair(BuildPeriods(_dailyBars, YearKey), "PYH", "PYL", PreviousYearColor);
        }

        private void DrawPreviousPeriodPair(List<PeriodRange> periods, string highLabel, string lowLabel, Color color)
        {
            if (periods.Count < 2)
            {
                RemovePreviousPeriodLevel(highLabel);
                RemovePreviousPeriodLevel(lowLabel);
                return;
            }

            PeriodRange previous = periods[periods.Count - 2];
            DrawPreviousPeriodLevel(highLabel, previous.High, color);
            DrawPreviousPeriodLevel(lowLabel, previous.Low, color);
        }

        private void DrawPreviousPeriodLevel(string label, double level, Color color)
        {
            string prefix = ObjectPrefix + "Level." + label;
            Color lineColor = Color.FromArgb(210, color.R, color.G, color.B);

            var line = Chart.DrawHorizontalLine(prefix + ".Line", level, lineColor, 1, LineStyle.Dots);
            line.IsInteractive = false;

            var text = Chart.DrawText(prefix + ".Text", label + "  " + level.ToString("F" + Symbol.Digits),
                Bars.OpenTimes[Bars.Count - 1], level, color);
            text.HorizontalAlignment = HorizontalAlignment.Left;
            text.VerticalAlignment = VerticalAlignment.Center;
            text.IsInteractive = false;
        }

        private void RemovePreviousPeriodLevel(string label)
        {
            string prefix = ObjectPrefix + "Level." + label;
            Chart.RemoveObject(prefix + ".Line");
            Chart.RemoveObject(prefix + ".Text");
        }
    }
}
