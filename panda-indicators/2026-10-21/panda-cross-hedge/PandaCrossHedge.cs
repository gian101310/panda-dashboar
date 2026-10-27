using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using cAlgo.API;
using cAlgo.API.Internals;
using PandaCrossHedgeCore;

namespace cAlgo
{
    [Indicator(IsOverlay = true, TimeZone = TimeZones.UTC, AutoRescale = false, AccessRights = AccessRights.None)]
    public class PandaCrossHedge : Indicator
    {
        [Parameter("Simulated new lots", Group = "Risk check", DefaultValue = 0.01, MinValue = 0.01, MaxValue = 1)]
        public double NewLots { get; set; }

        [Parameter("Currency shock (%)", Group = "Risk check", DefaultValue = 1.0, MinValue = 0.1, MaxValue = 10)]
        public double ShockPercent { get; set; }

        [Parameter("My stress limit (% equity)", Group = "Risk check", DefaultValue = 2.0, MinValue = 0.1, MaxValue = 100)]
        public double StressLimitPercent { get; set; }

        [Parameter("Minimum improvement (%)", Group = "Risk check", DefaultValue = 5.0, MinValue = 0, MaxValue = 100)]
        public double MinImprovementPercent { get; set; }

        [Parameter("Refresh (seconds)", Group = "Display", DefaultValue = 10, MinValue = 5, MaxValue = 60)]
        public int RefreshSeconds { get; set; }

        private static readonly string[] PairUniverse = {
            "AUDJPY", "AUDCAD", "AUDNZD", "AUDUSD", "CADJPY", "EURAUD", "EURCAD",
            "EURGBP", "EURJPY", "EURNZD", "EURUSD", "GBPAUD", "GBPCAD", "GBPJPY",
            "GBPNZD", "GBPUSD", "NZDCAD", "NZDJPY", "NZDUSD", "USDCAD", "USDJPY"
        };
        private static readonly HashSet<string> FxCurrencies = new HashSet<string> {
            "AUD", "CAD", "EUR", "GBP", "JPY", "NZD", "USD"
        };
        private static readonly Color Blue = Color.FromHex("#00b4ff");
        private static readonly Color Green = Color.FromHex("#00ff9f");
        private static readonly Color Red = Color.FromHex("#ff4d6d");
        private static readonly Color Muted = Color.FromHex("#abb9c9");
        private readonly Dictionary<string, Symbol> _symbols = new Dictionary<string, Symbol>();
        private readonly List<Candidate> _candidates = new List<Candidate>();
        private List<FxQuote> _conversionQuotes = new List<FxQuote>();
        private bool _usedConverterFallback;
        private ExposureSnapshot _before;
        private double _halfRisk, _closeRisk;
        private readonly TextBlock[] _currencyLines = new TextBlock[7];
        private readonly Button[] _candidateButtons = new Button[3];
        private TextBlock _status, _account, _risk, _positions, _selection, _alternatives;
        private TextBlock _candidateDetail, _dataStatus, _sizeInfo, _bestFit;
        private TextBlock _pandaStatus;
        private Button _nextPosition;
        private ChartDraggable _panel;
        private int _positionIndex;
        private long _selectedPositionId = -1;
        private string _chosenCandidate = "";
        private List<Position> _activePositions = new List<Position>();

        private sealed class Candidate
        {
            public string Pair;
            public TradeType Side;
            public double Units, Margin, SpreadCost, Improvement, NewRisk;
            public double NewGross, FitScore, NetExposureChange;
            public PandaSetupState PandaState;
            public PandaSetup Setup;
            public ExposureSnapshot Snapshot;
            public string Key => Pair + " " + Side;
        }

        protected override void Initialize()
        {
            foreach (var pair in PairUniverse)
            {
                var name = ResolveSymbol(pair);
                if (name == null) continue;
                try { _symbols[pair] = Symbols.GetSymbol(name); } catch { }
            }
            BuildPanel();
            Timer.TimerTick += Refresh;
            Timer.Start(RefreshSeconds);
            Refresh();
        }

        public override void Calculate(int index) { }

        private void BuildPanel()
        {
            var root = new StackPanel {
                Orientation = Orientation.Vertical, Width = 410, Margin = 8,
                BackgroundColor = Color.FromHex("#111923"),
                HorizontalAlignment = HorizontalAlignment.Left,
                VerticalAlignment = VerticalAlignment.Top
            };
            root.AddChild(Label("PANDA  |  CROSS-HEDGE CHECK", Blue, 15, true));
            _sizeInfo = Label("READ-ONLY simulation", Muted, 10); root.AddChild(_sizeInfo);
            _account = Label("Loading account...", Muted, 11); root.AddChild(_account);
            _status = Label("Loading positions...", Blue, 12, true); root.AddChild(_status);
            _risk = Label("", Muted, 11); root.AddChild(_risk);
            root.AddChild(Label("NET CURRENCY EXPOSURE  |  ACCOUNT VALUE", Blue, 10, true));
            for (var i = 0; i < _currencyLines.Length; i++)
            {
                _currencyLines[i] = Label("", Muted, 11);
                root.AddChild(_currencyLines[i]);
            }
            _positions = Label("", Muted, 10); root.AddChild(_positions);
            root.AddChild(Label("POSITION TO CHECK", Blue, 10, true));
            _selection = Label("", Muted, 11); root.AddChild(_selection);
            _nextPosition = new Button { Text = "Next open position", Width = 390, Height = 26, Margin = 2 };
            _nextPosition.Click += e => {
                if (_activePositions.Count == 0) return;
                _positionIndex = (_positionIndex + 1) % _activePositions.Count;
                _selectedPositionId = _activePositions[_positionIndex].Id;
                _chosenCandidate = "";
                Refresh();
            };
            root.AddChild(_nextPosition);
            _alternatives = Label("", Muted, 11); root.AddChild(_alternatives);
            root.AddChild(Label("SIMULATED CROSS-HEDGES", Blue, 10, true));
            _bestFit = Label("", Blue, 11, true); root.AddChild(_bestFit);
            _pandaStatus = Label("Panda setup: loading...", Muted, 10); root.AddChild(_pandaStatus);
            for (var i = 0; i < _candidateButtons.Length; i++)
            {
                var button = new Button { Text = "", Width = 390, Height = 26, Margin = 2, IsVisible = false };
                button.Click += e => { _chosenCandidate = button.Text.Split('|')[0].Trim(); ShowCandidate(); };
                _candidateButtons[i] = button;
                root.AddChild(button);
            }
            _candidateDetail = Label("", Muted, 11); root.AddChild(_candidateDetail);
            _dataStatus = Label("", Muted, 10); root.AddChild(_dataStatus);
            root.AddChild(Label("1-currency shock is hypothetical; it is not maximum loss.", Muted, 9));
            root.AddChild(Label("Existing floating loss remains. No orders are sent.", Muted, 9));
            var scroll = new ScrollViewer {
                Content = root, Width = 430,
                Height = Math.Max(260, Math.Min(Chart.Height - 30, 390)),
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto
            };
            _panel = Chart.Draggables.Add();
            _panel.Child = scroll;
            _panel.ShowGrip = true;
            double savedX, savedY;
            _panel.X = double.TryParse(LocalStorage.GetString("CrossHedge Panel X", LocalStorageScope.Instance),
                NumberStyles.Float, CultureInfo.InvariantCulture, out savedX) && Finite(savedX)
                ? Math.Max(0, Math.Min(savedX, Math.Max(0, Chart.Width - scroll.Width))) : 8;
            _panel.Y = double.TryParse(LocalStorage.GetString("CrossHedge Panel Y", LocalStorageScope.Instance),
                NumberStyles.Float, CultureInfo.InvariantCulture, out savedY) && Finite(savedY)
                ? Math.Max(0, Math.Min(savedY, Math.Max(0, Chart.Height - 60))) : 8;
            _panel.LocationChanged += args => {
                LocalStorage.SetString("CrossHedge Panel X", args.Draggable.X.ToString(CultureInfo.InvariantCulture),
                    LocalStorageScope.Instance);
                LocalStorage.SetString("CrossHedge Panel Y", args.Draggable.Y.ToString(CultureInfo.InvariantCulture),
                    LocalStorageScope.Instance);
                LocalStorage.Flush(LocalStorageScope.Instance);
            };
        }

        private static TextBlock Label(string value, Color color, double size, bool bold = false)
        {
            return new TextBlock { Text = value, ForegroundColor = color,
                FontSize = size, FontWeight = bold ? FontWeight.Bold : FontWeight.Normal,
                Margin = 2 };
        }

        private void Refresh()
        {
            try { RefreshCore(); }
            catch (Exception ex)
            {
                _status.Text = "DATA UNAVAILABLE - no hedge suggestion";
                _status.ForegroundColor = Red;
                _risk.Text = "";
                _positions.Text = "";
                _selection.Text = "";
                _alternatives.Text = "";
                foreach (var line in _currencyLines) line.Text = "";
                _dataStatus.Text = ex.GetType().Name + ": " + ex.Message;
                ClearCandidates();
                Print("Cross-Hedge read failed: " + ex.GetType().Name + " " + ex.Message);
            }
        }

        private void RefreshCore()
        {
            _sizeInfo.Text = "READ-ONLY  •  " + NewLots.ToString("0.00", CultureInfo.InvariantCulture) +
                " lot simulation; verify order-ticket minimum";
            PandaBiasSnapshot panda = null;
            try
            {
                panda = PandaBiasSnapshot.Parse(System.IO.File.ReadAllText("panda_bias_snapshot.txt"));
                if (!panda.IsFresh(Server.TimeInUtc, TimeSpan.FromMinutes(20))) panda = null;
                _pandaStatus.Text = panda == null ? "Panda setup stale; pair ranking paused" :
                    "Panda bias " + panda.GeneratedUtc.ToString("HH:mm") + " UTC  |  valid BUY/SELL pairs";
            }
            catch (Exception ex)
            {
                _pandaStatus.Text = "Panda setup unavailable (" + ex.GetType().Name + "); pair ranking paused";
            }
            _account.Text = (Account.IsLive ? "LIVE" : "DEMO") + " account " + Account.Number +
                "  |  " + Account.Asset.Name + " equity " + Money(Account.Equity);
            _activePositions = Positions.OrderBy(p => p.Id).ToList();
            if (_activePositions.Count == 0)
            {
                _status.Text = "No open positions"; _risk.Text = "";
                _positions.Text = ""; _selection.Text = ""; _alternatives.Text = "";
                foreach (var line in _currencyLines) line.Text = "";
                ClearCandidates();
                _dataStatus.Text = "Account snapshot: " + Server.TimeInUtc.ToString("HH:mm:ss") + " UTC";
                return;
            }
            var unsupported = _activePositions.Where(p => !IsSupportedFx(p.Symbol)).ToArray();
            if (unsupported.Length > 0)
            {
                _status.Text = "Portfolio includes unsupported positions";
                _status.ForegroundColor = Red;
                _positions.Text = string.Join(", ", unsupported.Select(p => p.SymbolName).Distinct());
                _risk.Text = "Account-wide exposure is incomplete.";
                _selection.Text = ""; _alternatives.Text = "";
                foreach (var line in _currencyLines) line.Text = "";
                ClearCandidates();
                _dataStatus.Text = "No hedge suggestion until every position is modelled.";
                return;
            }
            var rates = new Dictionary<string, double>();
            _usedConverterFallback = false;
            _conversionQuotes = _symbols.Values.Concat(_activePositions.Select(p => p.Symbol))
                .Where(IsSupportedFx).Where(ValidQuote)
                .Select(s => new FxQuote { BaseCurrency = s.BaseAsset.Name,
                    QuoteCurrency = s.QuoteAsset.Name, MidPrice = (s.Bid + s.Ask) / 2.0 })
                .ToList();
            foreach (var currency in _activePositions.SelectMany(p => new[] {
                p.Symbol.BaseAsset.Name, p.Symbol.QuoteAsset.Name }).Concat(new[] { Account.Asset.Name }).Distinct())
                AddRate(rates, currency);
            var legs = _activePositions.Select(p => ToLeg(p.Symbol, p.TradeType, p.VolumeInUnits)).ToList();
            var before = ExposureEngine.Calculate(legs, rates, Account.Asset.Name, ShockPercent / 100.0);
            var equity = Account.Equity;
            var stressPct = equity > 0 ? 100 * before.WorstShockLoss / equity : double.NaN;
            _status.Text = !Finite(stressPct) ? "Equity unavailable - check risk manually" :
                stressPct >= StressLimitPercent ? "OVER YOUR SET STRESS LIMIT" : "Within your set stress limit";
            _status.ForegroundColor = !Finite(stressPct) || stressPct >= StressLimitPercent ? Red : Green;
            _risk.Text = ShockPercent.ToString("0.#") + "% single-currency shock: " +
                Money(before.WorstShockLoss) + " (" + Pct(stressPct) + " equity), worst " + before.WorstShock +
                "\nYour limit: " + StressLimitPercent.ToString("0.#") + "%  |  Margin " + Money(Account.Margin);
            var currencies = FxCurrencies.OrderBy(c => c).ToArray();
            var maxExposure = before.NetAccountValue.Values.Select(Math.Abs).DefaultIfEmpty(0).Max();
            for (var i = 0; i < currencies.Length; i++)
            {
                var c = currencies[i];
                double amount;
                before.NetAccountValue.TryGetValue(c, out amount);
                var blocks = maxExposure > 0 ? (int)Math.Round(8 * Math.Abs(amount) / maxExposure) : 0;
                _currencyLines[i].Text = c + "  " + (amount >= 0 ? "+" : "-") + Money(Math.Abs(amount)) +
                    "  " + new string('■', blocks) + " " + (amount >= 0 ? "LONG" : "SHORT");
                _currencyLines[i].ForegroundColor = amount >= 0 ? Green : Red;
            }
            _positions.Text = _activePositions.Count + " positions  |  gross legs " + Money(before.GrossAccountValue) +
                "  |  net P/L " + Money(_activePositions.Sum(p => p.NetProfit));
            var selected = _activePositions.FirstOrDefault(p => p.Id == _selectedPositionId);
            if (selected == null)
            {
                selected = _activePositions.OrderBy(p => p.NetProfit).First();
                _selectedPositionId = selected.Id;
                _positionIndex = _activePositions.IndexOf(selected);
            }
            _positionIndex = _activePositions.IndexOf(selected);
            _selection.Text = selected.SymbolName + " " + selected.TradeType + " " +
                selected.Quantity.ToString("0.####") + " lots  |  P/L " + Money(selected.NetProfit) +
                "  |  " + (_positionIndex + 1) + "/" + _activePositions.Count;
            var closed = legs.Where((leg, i) => i != _positionIndex).ToList();
            var canReduceHalf = ValidVolume(selected.Symbol, selected.VolumeInUnits / 2);
            var halfRisk = double.PositiveInfinity;
            if (canReduceHalf)
            {
                var reduced = legs.ToList();
                reduced[_positionIndex] = ToLeg(selected.Symbol, selected.TradeType, selected.VolumeInUnits / 2);
                halfRisk = ExposureEngine.Calculate(reduced, rates, Account.Asset.Name, ShockPercent / 100.0).WorstShockLoss;
            }
            var closeRisk = ExposureEngine.Calculate(closed, rates, Account.Asset.Name, ShockPercent / 100.0).WorstShockLoss;
            _halfRisk = halfRisk; _closeRisk = closeRisk;
            var selectedLeg = ToLeg(selected.Symbol, selected.TradeType, selected.VolumeInUnits);
            _alternatives.Text = "Simulated reduce 50%: " +
                (canReduceHalf ? Money(halfRisk) + " stress loss" : "below broker volume minimum/step") + "\n" +
                "Simulated close: " + Money(closeRisk) + " stress loss";
            _candidates.Clear();
            _before = before;
            var missing = 0;
            var anyPositionMarketClosed = _activePositions.Any(p => !p.Symbol.MarketHours.IsOpened());
            foreach (var pair in PairUniverse)
            {
                if (anyPositionMarketClosed || panda == null) break;
                if (pair == selected.Symbol.BaseAsset.Name + selected.Symbol.QuoteAsset.Name) continue;
                PandaSetup setup;
                if (!panda.Pairs.TryGetValue(pair, out setup)) continue;
                Symbol symbol;
                if (!_symbols.TryGetValue(pair, out symbol) || symbol == null) { missing++; continue; }
                if (!IsSupportedFx(symbol) || !symbol.MarketHours.IsOpened()) continue;
                var units = symbol.QuantityToVolumeInUnits(NewLots);
                if (!ValidVolume(symbol, units) || !ValidQuote(symbol)) continue;
                try { AddRate(rates, symbol.BaseAsset.Name); AddRate(rates, symbol.QuoteAsset.Name); }
                catch { continue; }
                foreach (var side in new[] { TradeType.Buy, TradeType.Sell })
                {
                    var pandaState = setup.Classify(side == TradeType.Buy ? "BUY" : "SELL");
                    if (pandaState == PandaSetupState.Rejected) continue;
                    try
                    {
                        var candidateLeg = ToLeg(symbol, side, units);
                        if (!ExposureEngine.OffsetsAnySelectedCurrency(selectedLeg, candidateLeg)) continue;
                        var withCandidate = new List<ExposureLeg>(legs) { candidateLeg };
                        var after = ExposureEngine.Calculate(withCandidate, rates, Account.Asset.Name, ShockPercent / 100.0);
                        var spreadCost = units * (symbol.Ask - symbol.Bid) * rates[symbol.QuoteAsset.Name];
                        var improvement = before.WorstShockLoss - after.WorstShockLoss;
                        var minImprovement = before.WorstShockLoss * MinImprovementPercent / 100.0;
                        if (!Finite(spreadCost) || spreadCost < 0 || !Finite(improvement) ||
                            improvement <= spreadCost || improvement < minImprovement || improvement <= 0) continue;
                        var margin = symbol.GetEstimatedMargin(side, units);
                        if (!Finite(margin) || margin < 0 || margin > Account.FreeMargin) continue;
                        _candidates.Add(new Candidate { Pair = pair, Side = side, Units = units,
                            Margin = margin, SpreadCost = spreadCost, Improvement = improvement,
                            NewRisk = after.WorstShockLoss, NewGross = after.GrossAccountValue,
                            FitScore = ExposureEngine.HedgeFitScore(before, after, ShockPercent / 100.0, spreadCost),
                            NetExposureChange = ExposureEngine.TotalAbsoluteNet(after) - ExposureEngine.TotalAbsoluteNet(before),
                            PandaState = pandaState, Setup = setup,
                            Snapshot = after });
                    }
                    catch { /* Skip an unavailable broker symbol, quote, or conversion. */ }
                }
            }
            _candidates.Sort((a, b) => b.FitScore.CompareTo(a.FitScore));
            for (var i = 0; i < _candidateButtons.Length; i++)
            {
                var visible = i < _candidates.Count;
                _candidateButtons[i].IsVisible = visible;
                if (visible)
                    _candidateButtons[i].Text = _candidates[i].Key +
                        " | gap " + _candidates[i].Setup.Gap.ToString("0.#") + " | stress -" +
                        Money(_candidates[i].Improvement);
            }
            if (_candidates.Count == 0)
            {
                _chosenCandidate = "";
                _bestFit.Text = panda == null ? "No current Panda setup; no pair suggestion" :
                    "No Panda-aligned cross-hedge fit at " + NewLots.ToString("0.00") + " lot";
                _candidateDetail.Text = anyPositionMarketClosed ?
                    "A position market is closed. Quotes may be stale; hedge checks paused." :
                    "No suitable Panda cross hedge identified at " + NewLots.ToString("0.00") +
                    " lot.\nCompare reducing or closing the selected position.";
            }
            else
            {
                var top = _candidates[0];
                _bestFit.Text = "VALID PANDA BIAS + MODEL FIT: " +
                    top.Side.ToString().ToUpperInvariant() + " " +
                    top.Pair + "  " + NewLots.ToString("0.00") + " lot" +
                    "\nWorst shock " + Money(before.WorstShockLoss) + " → " + Money(top.NewRisk) +
                    (equity > 0 && 100 * top.NewRisk / equity >= StressLimitPercent ?
                        "  |  STILL OVER YOUR LIMIT" : "  |  within your set limit") +
                    "\nCompare with reducing/closing before placing any trade.";
                if (!_candidates.Any(c => c.Key == _chosenCandidate)) _chosenCandidate = _candidates[0].Key;
                ShowCandidate();
            }
            _dataStatus.Text = "Account snapshot " + Server.TimeInUtc.ToString("HH:mm:ss") + " UTC" +
                (missing > 0 ? "  |  " + missing + " broker pairs unavailable" : "") +
                "\nFX rates: broker mid quotes" + (_usedConverterFallback ? " + cTrader converter" : "") +
                ". Spread only; commission/swap excluded.\n" +
                "Quote timestamps unavailable; check cTrader prices before acting.";
        }

        private void ShowCandidate()
        {
            var candidate = _candidates.FirstOrDefault(c => c.Key == _chosenCandidate);
            if (candidate == null) return;
            var before = _before;
            var offset = candidate.Snapshot.NetAccountValue
                .Where(kv => before != null && before.NetAccountValue.ContainsKey(kv.Key) &&
                    Math.Abs(kv.Value) < Math.Abs(before.NetAccountValue[kv.Key]))
                .Select(kv => kv.Key).ToArray();
            var increased = candidate.Snapshot.NetAccountValue
                .Where(kv => {
                    double prior;
                    before.NetAccountValue.TryGetValue(kv.Key, out prior);
                    return Math.Abs(kv.Value) > Math.Abs(prior) + 0.01;
                }).Select(kv => kv.Key).ToArray();
            _candidateDetail.Text = "SIMULATE " + candidate.Side.ToString().ToUpperInvariant() + " " + candidate.Pair +
                "  |  " + NewLots.ToString("0.00") + " lot (" + candidate.Units.ToString("0") + " units)" +
                "\nWorst shock: " + Money(before.WorstShockLoss) +
                " -> " + Money(candidate.NewRisk) + "  |  model -" + Money(candidate.Improvement) +
                "\nOffsets: " + (offset.Length == 0 ? "none" : string.Join(", ", offset)) +
                "  |  Increases: " + (increased.Length == 0 ? "none" : string.Join(", ", increased)) +
                "\nTotal net exposure: " + (candidate.NetExposureChange <= 0 ? "-" : "+") +
                    Money(Math.Abs(candidate.NetExposureChange)) + " (account value)" +
                "\nPanda gap " + candidate.Setup.Gap.ToString("0.#") + " | PL " +
                    candidate.Setup.Zone + (candidate.Setup.G1Valid ? " + G1" : " / G1 absent") +
                    " | H1 " + candidate.Setup.H1 +
                    " / H4 " + candidate.Setup.H4 +
                (candidate.Setup.BoxOpposes(candidate.Side == TradeType.Buy ? "BUY" : "SELL") ?
                    "\nBOX OPPOSES BIAS; pair remains eligible by your bias-only rule." : "") +
                "\nGross legs: " + Money(candidate.NewGross) +
                "  |  margin ~" + Money(candidate.Margin) +
                "\nSpread ~" + Money(candidate.SpreadCost) +
                "; correlation, commission and swaps not modelled." +
                (Math.Min(_halfRisk, _closeRisk) <= candidate.NewRisk ?
                    "\nReducing/closing the selected trade models at least as well." : "");
        }

        private void ClearCandidates()
        {
            _candidates.Clear();
            _before = null;
            foreach (var button in _candidateButtons) button.IsVisible = false;
            _bestFit.Text = "";
            _candidateDetail.Text = "";
        }

        private static bool IsSupportedFx(Symbol symbol) => symbol != null && symbol.BaseAsset != null &&
            symbol.QuoteAsset != null && FxCurrencies.Contains(symbol.BaseAsset.Name) &&
            FxCurrencies.Contains(symbol.QuoteAsset.Name) && symbol.BaseAsset.Name != symbol.QuoteAsset.Name;

        private static bool ValidQuote(Symbol symbol) => Finite(symbol.Bid) && Finite(symbol.Ask) &&
            symbol.Bid > 0 && symbol.Ask >= symbol.Bid;

        private static bool ValidVolume(Symbol symbol, double units)
        {
            if (!Finite(units) || !Finite(symbol.VolumeInUnitsStep) || symbol.VolumeInUnitsStep <= 0 ||
                units < symbol.VolumeInUnitsMin || units > symbol.VolumeInUnitsMax) return false;
            var steps = (units - symbol.VolumeInUnitsMin) / symbol.VolumeInUnitsStep;
            return Math.Abs(steps - Math.Round(steps)) < 0.000001;
        }

        private static ExposureLeg ToLeg(Symbol symbol, TradeType side, double units)
        {
            if (!ValidQuote(symbol)) throw new InvalidOperationException("Quote unavailable for " + symbol.Name);
            return new ExposureLeg { BaseCurrency = symbol.BaseAsset.Name,
                QuoteCurrency = symbol.QuoteAsset.Name,
                SignedBaseUnits = side == TradeType.Buy ? units : -units,
                MidPrice = (symbol.Bid + symbol.Ask) / 2.0 };
        }

        private string ResolveSymbol(string pair)
        {
            if (Symbols.Exists(pair)) return pair;
            var matches = Symbols.Where(name =>
                new string(name.ToUpperInvariant().Where(char.IsLetter).ToArray()).Contains(pair)).ToArray();
            return matches.Length == 1 ? matches[0] : null;
        }

        private static bool Finite(double value) => !double.IsNaN(value) && !double.IsInfinity(value);
        private void AddRate(IDictionary<string, double> rates, string currency)
        {
            if (rates.ContainsKey(currency)) return;
            var quoteRate = FxRateResolver.FindRate(_conversionQuotes, currency, Account.Asset.Name);
            double converted;
            if (quoteRate.HasValue) converted = quoteRate.Value;
            else
            {
                _usedConverterFallback = true;
                try { converted = AssetConverter.Convert(1.0, currency, Account.Asset.Name); }
                catch (Exception ex) { throw new InvalidOperationException(
                    "Conversion unavailable for " + currency + " (broker quotes and cTrader): " + ex.Message); }
            }
            if (!Finite(converted) || converted <= 0)
                throw new InvalidOperationException("Conversion unavailable for " + currency);
            rates[currency] = converted;
        }
        private static string Money(double amount) => amount.ToString("N2", CultureInfo.InvariantCulture);
        private static string Pct(double value) => Finite(value) ? value.ToString("0.##", CultureInfo.InvariantCulture) + "%" : "n/a";
    }
}
