using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using cAlgo.API;

namespace cAlgo
{
    [Indicator(IsOverlay = true, TimeZone = TimeZones.UTC, AutoRescale = false,
        AccessRights = AccessRights.FullAccess)]
    public class PandaRawScorePanel : Indicator
    {
        private static readonly string[] SupportedPairs = {
            "AUDJPY", "AUDCAD", "AUDNZD", "AUDUSD", "CADJPY",
            "EURAUD", "EURCAD", "EURGBP", "EURJPY", "EURNZD", "EURUSD",
            "GBPAUD", "GBPCAD", "GBPJPY", "GBPNZD", "GBPUSD",
            "NZDCAD", "NZDJPY", "NZDUSD", "USDCAD", "USDJPY"
        };

        private static readonly Color Amber = Color.FromHex("#ffd166");
        private static readonly Color Muted = Color.FromHex("#aab6c4");
        private static readonly Color Buy = Color.FromHex("#00ff9f");
        private static readonly Color Sell = Color.FromHex("#ff4d6d");
        private static readonly Regex ScorePattern = new Regex(
            @"(?:D1|H4|H1)\s*:\s*([+-]?\d+)(?:/([+-]?\d+))?",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

        [Parameter("Refresh (seconds)", DefaultValue = 5, MinValue = 2, MaxValue = 60)]
        public int RefreshSeconds { get; set; }

        [Parameter("Maximum data age (minutes)", DefaultValue = 20, MinValue = 5, MaxValue = 120)]
        public int MaximumAgeMinutes { get; set; }

        [Parameter("Show panel", DefaultValue = true, Group = "Display")]
        public bool ShowPanel { get; set; }

        [Output("Visibility Sentinel", LineColor = "Transparent", PlotType = PlotType.Line)]
        public IndicatorDataSeries VisibilitySentinel { get; set; }

        private ChartDraggable _panel;
        private TextBlock _title, _base, _quote, _advBase, _advQuote;
        private TextBlock _atr, _spread, _rawScores, _gap, _bias, _execution, _status;
        private string _pair;
        private string _lastSourceKey;

        protected override void Initialize()
        {
            var letters = new string(SymbolName.ToUpperInvariant().Where(char.IsLetter).ToArray());
            var matches = SupportedPairs.Where(letters.Contains).ToArray();
            _pair = matches.Length == 1 ? matches[0] : null;

            var root = new StackPanel {
                Orientation = Orientation.Vertical, Width = 415, Margin = 8,
                BackgroundColor = Color.FromHex("#10151d")
            };
            _title = Line("PANDA  |  RAW SCORE", Amber, 14, true);
            _base = Line("", Amber);
            _quote = Line("", Amber);
            _advBase = Line("", Amber);
            _advQuote = Line("", Amber);
            _atr = Line("", Amber);
            _spread = Line("", Amber);
            _rawScores = Line("", Amber);
            _gap = Line("", Amber, 13, true);
            _bias = Line("", Amber, 13, true);
            _execution = Line("", Amber);
            _status = Line("Loading Panda files...", Muted, 10);
            foreach (var line in new[] { _title, _base, _quote, _advBase, _advQuote,
                _atr, _spread, _rawScores, _gap, _bias, _execution, _status })
                root.AddChild(line);

            _panel = Chart.Draggables.Add();
            _panel.Child = root;
            _panel.ShowGrip = true;
            _panel.X = Math.Max(8, Chart.Width - 435);
            _panel.Y = 12;

            Timer.TimerTick += OnTimerTick;
            Timer.Start(RefreshSeconds);
            Refresh();
        }

        public override void Calculate(int index)
        {
            VisibilitySentinel[index] = double.NaN;
            UpdateVisibility();
        }

        private static TextBlock Line(string value, Color color, double size = 11, bool bold = false)
        {
            return new TextBlock {
                Text = value, ForegroundColor = color, FontSize = size,
                FontWeight = bold ? FontWeight.Bold : FontWeight.Normal, Margin = 2
            };
        }

        private void OnTimerTick()
        {
            UpdateVisibility();
            Refresh();
        }

        private void UpdateVisibility()
        {
            if (_panel == null) return;
            var visible = ShowPanel;
            try
            {
                var indicator = ChartIndicators[InstanceId];
                if (indicator != null && indicator.LineOutputs.Count > 0)
                    visible &= indicator.LineOutputs[0].IsVisible;
            }
            catch { }
            _panel.IsVisible = visible;
        }

        private void Refresh()
        {
            _spread.Text = SpreadText();
            if (_pair == null)
            {
                Clear("Chart symbol is outside Panda's 21 pairs or is ambiguous");
                return;
            }

            var common = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "MetaQuotes", "Terminal", "Common", "Files");
            var rawPath = Path.Combine(common, "mt4_" + _pair + ".txt");
            var scorePath = Path.Combine(common, "panda_score_" + _pair + ".txt");
            if (!System.IO.File.Exists(rawPath) || !System.IO.File.Exists(scorePath))
            {
                Clear("Waiting for local MT4 and Panda score files for " + _pair);
                return;
            }

            try
            {
                var rawTime = System.IO.File.GetLastWriteTimeUtc(rawPath);
                var scoreTime = System.IO.File.GetLastWriteTimeUtc(scorePath);
                var newestAllowed = DateTime.UtcNow.AddMinutes(-MaximumAgeMinutes);
                if (rawTime < newestAllowed || scoreTime < newestAllowed ||
                    rawTime > DateTime.UtcNow.AddMinutes(1) || scoreTime > DateTime.UtcNow.AddMinutes(1))
                {
                    Clear("STALE DATA  |  waiting for fresh MT4 and Panda scores");
                    return;
                }

                var sourceKey = rawTime.Ticks + ":" + scoreTime.Ticks;
                if (sourceKey != _lastSourceKey)
                {
                    var raw = ReadSharedLines(rawPath);
                    var score = ReadScoreFile(scorePath);
                    if (raw.Length < 6 || !raw[0].StartsWith(_pair.Substring(0, 3), StringComparison.OrdinalIgnoreCase)
                        || !raw[1].StartsWith(_pair.Substring(3, 3), StringComparison.OrdinalIgnoreCase)
                        || !score.ContainsKey("GAP") || !score.ContainsKey("BIAS")
                        || !int.TryParse(score["GAP"], NumberStyles.Integer, CultureInfo.InvariantCulture, out var gap))
                    {
                        Clear("Incomplete Panda files for " + _pair);
                        return;
                    }

                    _base.Text = raw[0].Trim();
                    _quote.Text = raw[1].Trim();
                    _advBase.Text = raw[2].Trim();
                    _advQuote.Text = raw[3].Trim();
                    _atr.Text = raw[4].Trim();
                    _rawScores.Text = "BASE RAW: " + RawCurrencyScore(raw[0]) +
                        "   QUOTE RAW: " + RawCurrencyScore(raw[1]);
                    _gap.Text = "ENGINE GAP: " + Signed(gap);
                    _bias.Text = "BIAS: " + score["BIAS"];
                    _bias.ForegroundColor = score["BIAS"] == "BUY" ? Buy :
                        score["BIAS"] == "SELL" ? Sell : Amber;
                    _gap.ForegroundColor = _bias.ForegroundColor;
                    _execution.Text = "EXECUTION: " + Value(score, "EXECUTION") +
                        "   CONFIDENCE: " + Value(score, "CONFIDENCE");
                    _lastSourceKey = sourceKey;
                }
                _status.Text = _pair + "  |  Panda " + scoreTime.ToLocalTime().ToString("HH:mm:ss") +
                    "  |  MT4 " + rawTime.ToLocalTime().ToString("HH:mm:ss") + " local";
            }
            catch (IOException)
            {
                Clear("Panda files are being updated; retrying");
            }
            catch (UnauthorizedAccessException)
            {
                Clear("Cannot read MT4 Common Files; check cTrader file access");
            }
        }

        private static string[] ReadSharedLines(string path)
        {
            using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
            using (var reader = new StreamReader(stream))
                return reader.ReadToEnd().Split(new[] { "\r\n", "\n" }, StringSplitOptions.None);
        }

        private static Dictionary<string, string> ReadScoreFile(string path)
        {
            var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var line in ReadSharedLines(path))
            {
                var split = line.IndexOf(':');
                if (split > 0) result[line.Substring(0, split).Trim()] = line.Substring(split + 1).Trim();
            }
            return result;
        }

        private static string Value(Dictionary<string, string> fields, string key)
        {
            return fields.TryGetValue(key, out var value) ? value : "--";
        }

        private static string Signed(int score)
        {
            return score > 0 ? "+" + score : score.ToString(CultureInfo.InvariantCulture);
        }

        // Display only. The official gap and bias always come from panda_score_PAIR.txt.
        private static string RawCurrencyScore(string line)
        {
            var values = new List<int>();
            foreach (Match match in ScorePattern.Matches(line))
            {
                if (int.TryParse(match.Groups[1].Value, out var first)) values.Add(first);
                if (match.Groups[2].Success && int.TryParse(match.Groups[2].Value, out var second))
                    values.Add(second);
            }
            if (values.Any(value => value >= 4) && values.Any(value => value <= -4))
                return "CONFLICT";
            var positive = values.Where(value => value > 0).DefaultIfEmpty(0).Max();
            var negative = values.Where(value => value < 0).DefaultIfEmpty(0).Min();
            if (positive == -negative) return "0";
            return Signed(-negative > positive ? negative : positive);
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
            _lastSourceKey = null;
            _base.Text = _quote.Text = _advBase.Text = _advQuote.Text = _atr.Text = _rawScores.Text = "";
            _gap.Text = "ENGINE GAP: --";
            _bias.Text = "BIAS: --";
            _execution.Text = "EXECUTION: --   CONFIDENCE: --";
            _gap.ForegroundColor = _bias.ForegroundColor = Amber;
            _status.Text = reason;
        }
    }
}
