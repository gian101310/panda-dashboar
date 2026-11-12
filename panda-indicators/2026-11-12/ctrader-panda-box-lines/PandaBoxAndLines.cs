using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using cAlgo.API;
using cAlgo.API.Internals;

namespace cAlgo
{
    // Standalone, read-only port of MT4 Panda Box and Lines v1.35.
    [Indicator(IsOverlay = true, TimeZone = TimeZones.UTC, AccessRights = AccessRights.None)]
    public class PandaBoxAndLines : Indicator
    {
        private static readonly string[] Pairs = {
            "AUDCAD", "AUDJPY", "AUDNZD", "AUDUSD", "CADJPY", "EURAUD", "EURCAD",
            "EURGBP", "EURJPY", "EURNZD", "EURUSD", "GBPAUD", "GBPCAD", "GBPJPY",
            "GBPNZD", "GBPUSD", "NZDCAD", "NZDJPY", "NZDUSD", "USDCAD", "USDJPY"
        };
        private static readonly string[] Currencies = { "AUD", "CAD", "EUR", "GBP", "JPY", "NZD", "USD" };
        private static readonly Color Buy = Color.FromArgb(255, 0, 200, 120);
        private static readonly Color Sell = Color.FromArgb(255, 255, 77, 109);
        private static readonly Color Warn = Color.FromArgb(255, 255, 209, 102);
        private static readonly Color Accent = Color.FromArgb(255, 0, 180, 255);
        private static readonly Color Neutral = Color.FromArgb(255, 190, 195, 207);

        [Parameter("Refresh seconds", DefaultValue = 60, MinValue = 10, MaxValue = 3600)]
        public int RefreshSeconds { get; set; }
        [Parameter("Gap threshold", DefaultValue = 5, MinValue = 1, MaxValue = 18)]
        public int GapThreshold { get; set; }
        [Parameter("Show boxes", DefaultValue = true)]
        public bool ShowBoxes { get; set; }
        [Parameter("Fill boxes", DefaultValue = true, Group = "Box appearance")]
        public bool FillBoxes { get; set; }
        [Parameter("Fill opacity %", DefaultValue = 30, MinValue = 0, MaxValue = 100, Group = "Box appearance")]
        public int BoxFillOpacity { get; set; }
        [Parameter("Outline width", DefaultValue = 1, MinValue = 1, MaxValue = 5, Group = "Box appearance")]
        public int BoxOutlineWidth { get; set; }
        [Parameter("WagBox2 color", DefaultValue = "#4678FF", Group = "Box appearance")]
        public Color LongBoxColor { get; set; }
        [Parameter("WagBox1 color", DefaultValue = "#00C878", Group = "Box appearance")]
        public Color MediumBoxColor { get; set; }
        [Parameter("WagBox3 color", DefaultValue = "#FFA032", Group = "Box appearance")]
        public Color ShortBoxColor { get; set; }
        [Parameter("Show previous levels", DefaultValue = true)]
        public bool ShowLevels { get; set; }
        [Parameter("Show level labels", DefaultValue = true)]
        public bool ShowLevelLabels { get; set; }
        [Parameter("Short box days", DefaultValue = 2, MinValue = 1, MaxValue = 20, Group = "Box windows")]
        public int ShortDays { get; set; }
        [Parameter("Short box offset", DefaultValue = 1, MinValue = 1, MaxValue = 20, Group = "Box windows")]
        public int ShortOffset { get; set; }
        [Parameter("Medium box weeks", DefaultValue = 2, MinValue = 1, MaxValue = 20, Group = "Box windows")]
        public int MediumWeeks { get; set; }
        [Parameter("Medium box offset", DefaultValue = 1, MinValue = 1, MaxValue = 20, Group = "Box windows")]
        public int MediumOffset { get; set; }
        [Parameter("Long box months", DefaultValue = 2, MinValue = 1, MaxValue = 20, Group = "Box windows")]
        public int LongMonths { get; set; }
        [Parameter("Long box offset", DefaultValue = 1, MinValue = 1, MaxValue = 20, Group = "Box windows")]
        public int LongOffset { get; set; }

        private sealed class Slot
        {
            public string Pair;
            public Symbol Symbol;
            public Bars Bars;
            public bool Ready;
            public readonly double[,] High = new double[3, 2];
            public readonly double[,] Low = new double[3, 2];
        }

        private readonly List<Slot> _slots = new List<Slot>();
        private readonly int[,,] _positive = new int[7, 3, 2];
        private readonly int[,,] _negative = new int[7, 3, 2];
        private readonly int[,,] _net = new int[7, 3, 2];
        private string _pair = "";
        private int _base = -1, _quote = -1, _ready;
        private int _gap, _advGap;
        private string _bias = "DATA UNAVAILABLE", _advBias = "DATA UNAVAILABLE", _horizon = "TMRW";
        private bool _advConflict;
        private ChartDraggable _panel;
        private Bars _hour, _month;
        private DateTime _lastCalculation = DateTime.MinValue;

        protected override void Initialize()
        {
            _pair = Canonical(SymbolName);
            if (_pair != "")
            {
                _base = Array.IndexOf(Currencies, _pair.Substring(0, 3));
                _quote = Array.IndexOf(Currencies, _pair.Substring(3, 3));
            }
            foreach (var pair in Pairs)
            {
                var slot = new Slot { Pair = pair };
                var name = Resolve(pair);
                if (name != null)
                {
                    try
                    {
                        slot.Symbol = Symbols.GetSymbol(name);
                        slot.Bars = MarketData.GetBars(TimeFrame.Hour, name);
                    }
                    catch (Exception ex) { Print("Panda Box: {0}: {1}", pair, ex.Message); }
                }
                _slots.Add(slot);
            }
            try { _hour = MarketData.GetBars(TimeFrame.Hour); _month = MarketData.GetBars(TimeFrame.Monthly); }
            catch (Exception ex) { Print("Panda Box: chart history: {0}", ex.Message); }
            _panel = Chart.Draggables.Add();
            _panel.ShowGrip = true;
            _panel.X = 20;
            _panel.Y = Math.Max(12, Chart.Height - 205);
            _panel.Child = BuildPanel();
            Timer.TimerTick += OnTimerTick;
            Timer.Start(10);
            Refresh();
        }

        public override void Calculate(int index) { }

        private void OnTimerTick()
        {
            int interval = _ready == Pairs.Length ? RefreshSeconds : 10;
            if ((DateTime.UtcNow - _lastCalculation).TotalSeconds < interval - 1) return;
            Refresh();
        }

        private static string Canonical(string name)
        {
            var letters = new string((name ?? "").ToUpperInvariant().Where(char.IsLetter).ToArray());
            var matches = Pairs.Where(letters.Contains).ToArray();
            return matches.Length == 1 ? matches[0] : "";
        }

        private string Resolve(string pair)
        {
            if (Symbols.Exists(pair)) return pair;
            var matches = Symbols.Where(name => Canonical(name) == pair).ToArray();
            return matches.Length == 1 ? matches[0] : null;
        }

        private static DateTime Monday(DateTime value) => value.Date.AddDays(-(((int)value.DayOfWeek + 6) % 7));
        private static DateTime Month(DateTime value) => new DateTime(value.Year, value.Month, 1);
        private static DateTime TradingDay(DateTime value)
        {
            var day = value.Date;
            while (day.DayOfWeek == DayOfWeek.Saturday || day.DayOfWeek == DayOfWeek.Sunday) day = day.AddDays(-1);
            return day;
        }
        private static DateTime BackTradingDays(DateTime day, int count)
        {
            while (count > 0)
            {
                day = day.AddDays(-1);
                if (day.DayOfWeek != DayOfWeek.Saturday && day.DayOfWeek != DayOfWeek.Sunday) count--;
            }
            return day;
        }

        private void Window(int timeframe, bool advance, DateTime now, out DateTime start, out DateTime end)
        {
            if (timeframe == 0)
            {
                end = Month(now).AddMonths(-(advance ? LongOffset - 1 : LongOffset));
                start = end.AddMonths(-LongMonths);
            }
            else if (timeframe == 1)
            {
                end = Monday(now).AddDays(-7 * (advance ? MediumOffset - 1 : MediumOffset));
                start = end.AddDays(-7 * MediumWeeks);
            }
            else
            {
                end = BackTradingDays(TradingDay(now), advance ? ShortOffset - 1 : ShortOffset);
                start = BackTradingDays(end, ShortDays);
            }
        }

        private static bool Bounds(Bars bars, DateTime start, DateTime end, out double low, out double high)
        {
            low = double.MaxValue;
            high = double.MinValue;
            if (bars == null) return false;
            for (int i = bars.Count - 1; i >= 0; --i)
            {
                var time = bars.OpenTimes[i];
                if (time >= end) continue;
                if (time < start) break;
                low = Math.Min(low, bars.LowPrices[i]);
                high = Math.Max(high, bars.HighPrices[i]);
            }
            return high > 0 && low < double.MaxValue;
        }

        private void Refresh()
        {
            _lastCalculation = DateTime.UtcNow;
            Array.Clear(_positive, 0, _positive.Length);
            Array.Clear(_negative, 0, _negative.Length);
            Array.Clear(_net, 0, _net.Length);
            _ready = 0;
            var now = Server.TimeInUtc;
            foreach (var slot in _slots)
            {
                slot.Ready = false;
                if (slot.Bars == null || slot.Symbol == null) continue;
                DateTime earliest = DateTime.MaxValue;
                for (int tf = 0; tf < 3; tf++)
                for (int adv = 0; adv < 2; adv++)
                {
                    DateTime start, end;
                    Window(tf, adv == 1, now, out start, out end);
                    if (start < earliest) earliest = start;
                }
                if (slot.Bars.Count == 0 || slot.Bars.OpenTimes[0] > earliest)
                {
                    try { slot.Bars.LoadMoreHistory(); }
                    catch (Exception ex) { Print("Panda Box: history {0}: {1}", slot.Pair, ex.Message); }
                }
                if (slot.Bars.Count == 0 || slot.Bars.OpenTimes[0] > earliest || slot.Symbol.Bid <= 0) continue;
                bool complete = true;
                for (int tf = 0; tf < 3; tf++)
                for (int adv = 0; adv < 2; adv++)
                {
                    DateTime start, end;
                    Window(tf, adv == 1, now, out start, out end);
                    double low, high;
                    if (slot.Bars.OpenTimes[0] > start || !Bounds(slot.Bars, start, end, out low, out high)) { complete = false; continue; }
                    slot.Low[tf, adv] = low;
                    slot.High[tf, adv] = high;
                }
                if (!complete) continue;
                slot.Ready = true;
                _ready++;
                for (int tf = 0; tf < 3; tf++)
                for (int adv = 0; adv < 2; adv++)
                {
                    int vote = slot.Symbol.Bid > slot.High[tf, adv] ? 1 : slot.Symbol.Bid < slot.Low[tf, adv] ? -1 : 0;
                    AddVote(slot.Pair.Substring(0, 3), tf, adv, vote);
                    AddVote(slot.Pair.Substring(3, 3), tf, adv, -vote);
                }
            }
            CalculateBias();
            DrawBoxes(now);
            DrawLevels();
            _panel.Child = BuildPanel();
        }

        private void AddVote(string currency, int timeframe, int advance, int vote)
        {
            int index = Array.IndexOf(Currencies, currency);
            if (index < 0) return;
            _net[index, timeframe, advance] += vote;
            if (vote > 0) _positive[index, timeframe, advance]++;
            if (vote < 0) _negative[index, timeframe, advance]++;
        }

        private static int Strongest(int d1, int h4, int h1)
        {
            int pos = Math.Max(0, Math.Max(d1, Math.Max(h4, h1)));
            int neg = Math.Min(0, Math.Min(d1, Math.Min(h4, h1)));
            return pos == -neg ? 0 : -neg > pos ? neg : pos;
        }

        private static bool Conflict(int d1, int h4, int h1) =>
            (d1 >= 4 || h4 >= 4 || h1 >= 4) && (d1 <= -4 || h4 <= -4 || h1 <= -4);

        private void CalculateBias()
        {
            _bias = _advBias = _pair == "" ? "UNSUPPORTED" : "DATA UNAVAILABLE";
            _gap = _advGap = 0;
            _advConflict = false;
            if (_pair == "" || _ready != Pairs.Length) return;
            int bD = _net[_base, 0, 0], bH = _net[_base, 1, 0], b1 = _net[_base, 2, 0];
            int qD = _net[_quote, 0, 0], qH = _net[_quote, 1, 0], q1 = _net[_quote, 2, 0];
            _gap = Strongest(bD, bH, b1) - Strongest(qD, qH, q1);
            _bias = Math.Abs(_gap) < GapThreshold ? "INVALID" : _gap > 0 ? "BUY" : "SELL";

            var dubai = Server.TimeInUtc.AddHours(4);
            int days = dubai.DayOfWeek == DayOfWeek.Friday ? 3 : dubai.DayOfWeek == DayOfWeek.Saturday ? 2 : 1;
            var next = dubai.AddDays(days);
            bool month = next.Month != dubai.Month || next.Year != dubai.Year;
            _horizon = month ? "MTH" : dubai.DayOfWeek >= DayOfWeek.Monday && dubai.DayOfWeek <= DayOfWeek.Thursday ? "TMRW" : "WK";
            int d = _horizon == "MTH" ? 1 : 0;
            int h = _horizon == "TMRW" ? 0 : 1;
            bD = _net[_base, 0, d]; bH = _net[_base, 1, h]; b1 = _net[_base, 2, 1];
            qD = _net[_quote, 0, d]; qH = _net[_quote, 1, h]; q1 = _net[_quote, 2, 1];
            _advConflict = Conflict(bD, bH, b1) || Conflict(qD, qH, q1);
            if (_advConflict) { _advBias = "INVALID"; return; }
            _advGap = Strongest(bD, bH, b1) - Strongest(qD, qH, q1);
            _advBias = _advGap >= GapThreshold ? "BUY" : _advGap <= -GapThreshold ? "SELL" : "WAIT";
        }

        private void DrawBoxes(DateTime now)
        {
            var slot = _slots.FirstOrDefault(s => s.Pair == _pair);
            string[] labels = { "WagBox2", "WagBox1", "WagBox3" };
            Color[] colors = { LongBoxColor, MediumBoxColor, ShortBoxColor };
            for (int tf = 0; tf < 3; tf++)
            {
                string name = "PandaBoxLines." + labels[tf];
                if (!ShowBoxes || slot == null || !slot.Ready)
                {
                    Chart.RemoveObject(name);
                    Chart.RemoveObject(name + ".fill");
                    Chart.RemoveObject(name + ".label");
                    continue;
                }
                DateTime start, end;
                Window(tf, false, now, out start, out end);
                if (FillBoxes && BoxFillOpacity > 0)
                {
                    int alpha = (int)Math.Round(BoxFillOpacity * 255.0 / 100.0);
                    var fill = Chart.DrawRectangle(name + ".fill", start, slot.High[tf, 0], end, slot.Low[tf, 0],
                        Color.FromArgb(alpha, colors[tf].R, colors[tf].G, colors[tf].B));
                    fill.IsFilled = true;
                }
                else Chart.RemoveObject(name + ".fill");
                var rectangle = Chart.DrawRectangle(name, start, slot.High[tf, 0], end, slot.Low[tf, 0], colors[tf]);
                rectangle.IsFilled = false;
                rectangle.Thickness = BoxOutlineWidth;
                Chart.DrawText(name + ".label", labels[tf] + "  " + slot.High[tf, 0].ToString("F" + Symbol.Digits, CultureInfo.InvariantCulture) + " / " + slot.Low[tf, 0].ToString("F" + Symbol.Digits, CultureInfo.InvariantCulture), end, slot.High[tf, 0], colors[tf]);
            }
        }

        private static DateTime PeriodKey(DateTime time, int kind) => kind == 0 ? time.Date : kind == 1 ? Monday(time) : Month(time);

        private bool PreviousRange(int kind, out double low, out double high)
        {
            low = double.MaxValue; high = 0;
            if (_hour == null || _hour.Count < 2) return false;
            var current = PeriodKey(_hour.LastBar.OpenTime, kind);
            DateTime previous = DateTime.MinValue;
            for (int i = _hour.Count - 1; i >= 0; --i)
            {
                var key = PeriodKey(_hour.OpenTimes[i], kind);
                if (key == current) continue;
                if (previous == DateTime.MinValue) previous = key;
                if (key != previous) break;
                low = Math.Min(low, _hour.LowPrices[i]);
                high = Math.Max(high, _hour.HighPrices[i]);
            }
            return high > 0 && low < double.MaxValue;
        }

        private bool PreviousYear(out double low, out double high)
        {
            low = double.MaxValue; high = 0;
            if (_month == null) return false;
            int year = Server.TimeInUtc.Year - 1;
            for (int i = _month.Count - 1; i >= 0; --i)
            {
                if (_month.OpenTimes[i].Year < year) break;
                if (_month.OpenTimes[i].Year != year) continue;
                low = Math.Min(low, _month.LowPrices[i]);
                high = Math.Max(high, _month.HighPrices[i]);
            }
            return high > 0 && low < double.MaxValue;
        }

        private void DrawLevels()
        {
            string[] names = { "PD", "PW", "PM", "PY" };
            Color[] colors = { Color.Orange, Color.DodgerBlue, Color.DarkViolet, Color.Crimson };
            for (int kind = 0; kind < 4; kind++)
            {
                double low = 0, high = 0;
                bool found = ShowLevels && _pair != "" && (kind == 3 ? PreviousYear(out low, out high) : PreviousRange(kind, out low, out high));
                if (!found) { low = high = 0; }
                DrawLevel(names[kind] + "H", high, colors[kind]);
                DrawLevel(names[kind] + "L", low, colors[kind]);
            }
        }

        private void DrawLevel(string label, double value, Color color)
        {
            string name = "PandaBoxLines.Level." + label;
            if (value <= 0 || Bars.Count == 0)
            {
                Chart.RemoveObject(name); Chart.RemoveObject(name + ".label"); return;
            }
            var line = Chart.DrawHorizontalLine(name, value, color);
            line.LineStyle = LineStyle.Dots;
            line.Thickness = 1;
            if (ShowLevelLabels)
                Chart.DrawText(name + ".label", label + " " + value.ToString("F" + Symbol.Digits, CultureInfo.InvariantCulture), Bars.LastBar.OpenTime, value, color);
            else Chart.RemoveObject(name + ".label");
        }

        private string Raw(int currency, int timeframe, int advance)
        {
            int p = _positive[currency, timeframe, advance], n = _negative[currency, timeframe, advance];
            return p > 0 && n > 0 ? "+" + p + "/-" + n : p > 0 ? "+" + p : n > 0 ? "-" + n : "0";
        }
        private string ScoreRow(int currency, bool advance) => Currencies[currency] + "   D1 " + Raw(currency, 0, advance ? 1 : 0) + "   H4 " + Raw(currency, 1, advance ? 1 : 0) + "   H1 " + Raw(currency, 2, advance ? 1 : 0);
        private static string Signed(int value) => value > 0 ? "+" + value : value.ToString(CultureInfo.InvariantCulture);
        private static Color BiasColor(string bias) => bias == "BUY" ? Buy : bias == "SELL" ? Sell : Warn;
        private static TextBlock Text(string value, Color color, int size) => new TextBlock { Text = value, ForegroundColor = color, FontSize = size, Margin = new Thickness(6, 2, 6, 2) };

        private ControlBase BuildPanel()
        {
            var panel = new StackPanel { Orientation = Orientation.Vertical, Width = 375, BackgroundColor = Color.FromArgb(235, 17, 23, 34), Margin = 2 };
            panel.AddChild(Text("PANDA BOX AND LINES  |  " + (_pair == "" ? SymbolName : _pair), Accent, 12));
            if (_pair == "") { panel.AddChild(Text("Unsupported chart pair", Warn, 11)); return panel; }
            panel.AddChild(Text("CURRENT RAW SCORE", Neutral, 10));
            panel.AddChild(Text(ScoreRow(_base, false), Neutral, 11));
            panel.AddChild(Text(ScoreRow(_quote, false), Neutral, 11));
            panel.AddChild(Text("ADV RAW SCORE", Neutral, 10));
            panel.AddChild(Text(ScoreRow(_base, true), Neutral, 11));
            panel.AddChild(Text(ScoreRow(_quote, true), Neutral, 11));
            panel.AddChild(Text("GAP " + (_ready == Pairs.Length ? Signed(_gap) : "--") + "   BIAS " + _bias, BiasColor(_bias), 12));
            panel.AddChild(Text("ADV " + _horizon + "  " + (_ready != Pairs.Length || _advConflict ? "--" : Signed(_advGap)) + "   " + _advBias, BiasColor(_advBias), 12));
            panel.AddChild(Text(_ready + "/21 pairs ready  ·  broker data  ·  read only", _ready == Pairs.Length ? Buy : Warn, 9));
            return panel;
        }
    }
}
