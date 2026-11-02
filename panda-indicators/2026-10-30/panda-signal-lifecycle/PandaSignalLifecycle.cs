using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using cAlgo.API;

namespace cAlgo
{
    [Indicator(IsOverlay = true, TimeZone = TimeZones.UTC, AutoRescale = false, AccessRights = AccessRights.None)]
    public class PandaSignalLifecycle : Indicator
    {
        [Parameter("Refresh (seconds)", DefaultValue = 15, MinValue = 5, MaxValue = 60)]
        public int RefreshSeconds { get; set; }

        [Parameter("Show panel", DefaultValue = true, Group = "Display")]
        public bool ShowPanel { get; set; }

        [Output("Visibility Sentinel", LineColor = "Transparent", PlotType = PlotType.Line, Thickness = 1)]
        public IndicatorDataSeries VisibilitySentinel { get; set; }

        private TextBlock _heading, _phase, _levelWarning, _probability, _read, _related, _status;
        private ScrollViewer _scroll;
        private ChartDraggable _draggable;
        private StackPanel _details;
        private Button _minimizeButton;
        private bool _minimized;
        private const string MinimizedKey = "Panda Signal Lifecycle Panel Minimized";

        protected override void Initialize()
        {
            var panel = new StackPanel {
                Orientation = Orientation.Vertical, Width = 440, Margin = 8,
                BackgroundColor = Color.FromHex("#111923"),
                HorizontalAlignment = HorizontalAlignment.Left,
                VerticalAlignment = VerticalAlignment.Top
            };
            _heading = Line("PANDA  |  SIGNAL LIFECYCLE", Color.FromHex("#00b4ff"), 15);
            var header = new StackPanel { Orientation = Orientation.Horizontal };
            header.AddChild(_heading);
            _minimizeButton = new Button { Width = 28, Height = 22, Margin = 2 };
            _minimizeButton.Click += ToggleMinimize;
            header.AddChild(_minimizeButton);
            panel.AddChild(header);
            _details = new StackPanel { Orientation = Orientation.Vertical };
            _phase = Line("Loading...", Color.FromHex("#abb9c9"), 15);
            _levelWarning = Line("", Color.FromHex("#ffd166"), 12);
            _probability = Line("4h outcome: collecting history", Color.FromHex("#ffd166"), 11);
            _read = Line("", Color.FromHex("#abb9c9"), 12);
            _related = Line("", Color.FromHex("#abb9c9"), 11);
            _status = Line("", Color.FromHex("#abb9c9"), 10);
            _details.AddChild(_phase);
            _details.AddChild(_levelWarning);
            _details.AddChild(_probability);
            _details.AddChild(_read);
            _details.AddChild(_related);
            _details.AddChild(_status);
            _details.AddChild(Line("4h outcome = bias valid + at least 3 pips with bias; no orders.", Color.FromHex("#abb9c9"), 9));
            panel.AddChild(_details);
            _scroll = new ScrollViewer {
                Content = panel, Width = 460,
                Height = Math.Max(200, Math.Min(Chart.Height - 30, 315)),
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto
            };
            _draggable = Chart.Draggables.Add();
            _draggable.Child = _scroll;
            _draggable.ShowGrip = true;
            _draggable.X = 8;
            _draggable.Y = 8;
            _minimized = LocalStorage.GetString(MinimizedKey, LocalStorageScope.Instance) == "1";
            ApplyPanelSize(315);
            Timer.TimerTick += OnTimerTick;
            Timer.Start(RefreshSeconds);
            Refresh();
            UpdatePanelVisibility();
        }

        public override void Calculate(int index)
        {
            VisibilitySentinel[index] = double.NaN;
            UpdatePanelVisibility();
        }

        private void OnTimerTick()
        {
            UpdatePanelVisibility();
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

        private void ToggleMinimize(ButtonClickEventArgs args)
        {
            _minimized = !_minimized;
            LocalStorage.SetString(MinimizedKey, _minimized ? "1" : "0", LocalStorageScope.Instance);
            LocalStorage.Flush(LocalStorageScope.Instance);
            ApplyPanelSize(315);
        }

        private void ApplyPanelSize(int expandedHeight)
        {
            _minimizeButton.Text = _minimized ? "+" : "−";
            _details.IsVisible = !_minimized;
            var minimumHeight = expandedHeight == 170 ? 145 : 200;
            _scroll.Height = _minimized ? 48 : Math.Max(minimumHeight, Math.Min(Chart.Height - 30, expandedHeight));
        }

        private static TextBlock Line(string text, Color color, double size)
        {
            return new TextBlock { Text = text, ForegroundColor = color, FontSize = size, Margin = 2 };
        }

        private void Refresh()
        {
            try
            {
                using (var document = JsonDocument.Parse(System.IO.File.ReadAllText("panda_lifecycle_snapshot.json")))
                {
                    var root = document.RootElement;
                    var generated = DateTime.Parse(root.GetProperty("generated_utc").GetString()).ToUniversalTime();
                    if (generated > Server.TimeInUtc.AddMinutes(1) || Server.TimeInUtc - generated > TimeSpan.FromMinutes(20))
                    {
                        Clear("Panda snapshot older than 20 minutes");
                        return;
                    }
                    var letters = new string(Symbol.Name.ToUpperInvariant().Where(char.IsLetter).ToArray());
                    var pairs = root.GetProperty("pairs");
                    var matches = pairs.EnumerateObject().Select(x => x.Name)
                        .Where(x => letters.Contains(x)).ToArray();
                    if (matches.Length != 1 || !pairs.TryGetProperty(matches[0], out var item))
                    {
                        Clear("Pair outside Panda list or broker symbol ambiguous");
                        return;
                    }
                    var pair = matches[0];
                    var bias = item.GetProperty("bias").GetString();
                    var phase = item.GetProperty("phase").GetString();
                    var gap = item.GetProperty("gap").GetDouble();
                    _phase.Text = pair + "  " + bias + "  GAP " + gap.ToString("0.#") + "\n" + phase;
                    _phase.ForegroundColor = bias == "BUY" ? Color.FromHex("#00ff9f") :
                        bias == "SELL" ? Color.FromHex("#ff4d6d") : Color.FromHex("#ffd166");
                    var level = item.GetProperty("nearest_opposing_level");
                    _levelWarning.Text = item.GetProperty("level_review").GetBoolean() &&
                        level.ValueKind == JsonValueKind.Object ?
                        "LEVEL REVIEW: " + level.GetProperty("name").GetString() + " " +
                        level.GetProperty("distance_pips").GetDouble().ToString("0.#") + " pips ahead" : "";
                    if (item.TryGetProperty("four_hour_evidence", out var evidence))
                    {
                        var status = evidence.GetProperty("status").GetString();
                        var sampleCount = evidence.GetProperty("samples").GetInt32();
                        var days = evidence.GetProperty("days").GetInt32();
                        _probability.Text = status == "VALIDATED" ?
                            "4h historical outcome: " + evidence.GetProperty("percent").GetInt32() +
                            "% (range " + evidence.GetProperty("low").GetInt32() + "–" +
                            evidence.GetProperty("high").GetInt32() + "%; " + sampleCount + " samples)" :
                            status == "NO SIGNAL" ? "4h outcome: no valid Panda signal" :
                            status == "UNSTABLE" ? "4h outcome: history unstable; percentage withheld" :
                            "4h outcome: collecting independent history (" + sampleCount +
                            " samples across " + days + " days)";
                    }
                    else _probability.Text = "4h outcome: collecting history";
                    var reasons = item.GetProperty("reasons").EnumerateArray()
                        .Select(x => x.GetString()).Where(x => !string.IsNullOrEmpty(x)).ToArray();
                    var boxes = item.GetProperty("box_position");
                    var timeframeConflicts = item.TryGetProperty("timeframe_conflicts", out var conflicts) ?
                        conflicts.EnumerateArray().Select(x => x.GetString()).Where(x => !string.IsNullOrEmpty(x)).ToArray() :
                        Array.Empty<string>();
                    var boxChanges = item.TryGetProperty("box_changes", out var changes) ?
                        changes.EnumerateArray().Select(x => x.GetString()).Where(x => !string.IsNullOrEmpty(x)).ToArray() :
                        Array.Empty<string>();
                    _read.Text = (timeframeConflicts.Length > 0 ?
                        "TF CONFLICT: " + string.Join("; ", timeframeConflicts) +
                        " | H1 countertrend; check H4/D1 follow-through\n" : "") +
                        string.Join("\n", reasons.Take(7)) +
                        "\nBOX H1 " + boxes.GetProperty("H1").GetString() +
                        " / H4 " + boxes.GetProperty("H4").GetString() +
                        " / D1 " + boxes.GetProperty("D1").GetString() +
                        (boxChanges.Length > 0 ? "\nBOX CHANGE: " + string.Join("; ", boxChanges) : "");
                    var baseBreadth = item.GetProperty("base_breadth");
                    var quoteBreadth = item.GetProperty("quote_breadth");
                    _related.Text = "BASE: " + Breadth(baseBreadth) + "\nQUOTE: " + Breadth(quoteBreadth);
                    _status.Text = "Panda snapshot " + generated.ToString("HH:mm") + " UTC | no orders sent";
                    ApplyPanelSize(315);
                }
            }
            catch (FileNotFoundException)
            {
                Clear("Waiting for local Panda snapshot; auto-refreshes");
            }
            catch (Exception ex)
            {
                Clear("Panda snapshot unavailable: " + ex.GetType().Name);
            }
        }

        private static string Breadth(JsonElement item)
        {
            var examples = item.GetProperty("examples").EnumerateArray()
                .Select(x => x.GetString()).Where(x => !string.IsNullOrEmpty(x)).ToArray();
            return item.GetProperty("agree").GetInt32() + " agree / " +
                item.GetProperty("oppose").GetInt32() + " oppose; " +
                item.GetProperty("box_confirmed").GetInt32() + " H1 box / " +
                item.GetProperty("price_advancing").GetInt32() + " advancing" +
                (examples.Length > 0 ? " (" + string.Join(", ", examples) + ")" : "");
        }

        private void Clear(string message)
        {
            _phase.Text = "NO CURRENT READING";
            _phase.ForegroundColor = Color.FromHex("#ffd166");
            _read.Text = "";
            _levelWarning.Text = "";
            _probability.Text = "";
            _related.Text = "";
            _status.Text = message;
            ApplyPanelSize(170);
        }
    }
}
