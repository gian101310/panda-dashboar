// -----------------------------------------------------------------
//  pandalinev3 Indicator for cTrader (cAlgo)
//  SuperTrend + BB TrendLine + S/R Zones — Non-Repainting
// -----------------------------------------------------------------

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text.RegularExpressions;
using cAlgo.API;
using cAlgo.API.Indicators;
using cAlgo.API.Internals;

namespace cAlgo.Indicators
{
    [Indicator(IsOverlay = true, TimeZone = TimeZones.UTC, AccessRights = AccessRights.FullAccess)]
    public class pandalinev3 : Indicator
    {
        // ============================================================
        // PRIVATE DEFAULTS
        // ============================================================
        private const int ST_Period = 10;
        private const double ST_Multiplier = 3.0;
        private const bool ST_UseATR = true;
        private const bool ST_ShowSignals = true;

        private const int BB_Period = 21;
        private const double BB_Deviations = 1.0;
        private const bool BB_UseATR = true;
        private const int BB_ATRPeriod = 5;
        private const bool BB_HideLabels = false;

        private const bool SR_Show = true;
        private const bool SR_Daily = true;
        private const bool SR_Weekly = true;
        private const bool SR_Monthly = true;
        private const bool SR_Yearly = true;
        private const double SR_ZoneWidth = 0.01;
        private static readonly Color SR_DailyColor = Color.Orange;
        private static readonly Color SR_WeeklyColor = Color.DodgerBlue;
        private static readonly Color SR_MonthlyColor = Color.DarkViolet;
        private static readonly Color SR_YearlyColor = Color.Crimson;

        private const bool AL_SuperTrend = true;
        private const bool AL_BB = true;
        private const bool Panel_Show = true;

        // ============================================================
        // OUTPUT BUFFERS
        // ============================================================
        [Output("ST Bullish", LineColor = "Lime", PlotType = PlotType.DiscontinuousLine, Thickness = 2)]
        public IndicatorDataSeries STBullish { get; set; }

        [Output("ST Bearish", LineColor = "Red", PlotType = PlotType.DiscontinuousLine, Thickness = 2)]
        public IndicatorDataSeries STBearish { get; set; }

        [Output("BB Trend Bullish", LineColor = "DodgerBlue", PlotType = PlotType.DiscontinuousLine, Thickness = 2)]
        public IndicatorDataSeries BBTrendBull { get; set; }

        [Output("BB Trend Bearish", LineColor = "Red", PlotType = PlotType.DiscontinuousLine, Thickness = 2)]
        public IndicatorDataSeries BBTrendBear { get; set; }

        // ============================================================
        // INTERNAL DATA
        // ============================================================
        private AverageTrueRange _atr;
        private AverageTrueRange _atrBB;
        private AverageTrueRange _atrLabel;
        private SimpleMovingAverage _bbSMA;
        private BollingerBands _bb;

        private IndicatorDataSeries _upBand;
        private IndicatorDataSeries _dnBand;
        private IndicatorDataSeries _trendDir;
        private IndicatorDataSeries _bbTrendLine;
        private IndicatorDataSeries _bbITrend;

        private Bars _daily;
        private Bars _weekly;
        private Bars _monthly;

        private int _lastAlertBar = -1;
        private const string ObjPrefix = "PandaLinesV3_";
        private const string BoxPrefix = "PandaBoxV3_";
        private readonly string _pandaPath =
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData) +
            @"\MetaQuotes\Terminal\Common\Files\";
        private readonly HashSet<string> _drawnBoxes = new HashSet<string>();

        private string _lastMt4Snapshot = "";
        private int _scoreGap;
        private string _scoreBias = "NO DATA";
        private string _scoreExecution = "--";
        private string _scoreConfidence = "--";
        private int _baseAbs;
        private int _quoteAbs;
        private int _engineGap;
        private string _engineBias = "--";
        private string _engineExecution = "--";
        private string _engineConfidence = "--";
        private string _momentum = "--";
        private double _strength;
        private string _plZone = "--";
        private int _plG1;
        private string _boxH1 = "--";
        private string _boxH4 = "--";
        private int _confluence;
        private string _baseLine = "";
        private string _quoteLine = "";
        private string _advBase = "";
        private string _advQuote = "";
        private string _atrLine = "";
        private string _spreadLine = "";
        private int _boxCount;
        private DateTime _lastRead = DateTime.MinValue;
        private DateTime _lastEngineRead = DateTime.MinValue;

        // ============================================================
        // INITIALIZE
        // ============================================================
        protected override void Initialize()
        {
            _atr = Indicators.AverageTrueRange(ST_Period, MovingAverageType.Simple);
            _atrBB = Indicators.AverageTrueRange(BB_ATRPeriod, MovingAverageType.Simple);
            _atrLabel = Indicators.AverageTrueRange(8, MovingAverageType.Simple);
            _bbSMA = Indicators.SimpleMovingAverage(Bars.ClosePrices, BB_Period);
            _bb = Indicators.BollingerBands(Bars.ClosePrices, BB_Period, BB_Deviations, MovingAverageType.Simple);

            _upBand = CreateDataSeries();
            _dnBand = CreateDataSeries();
            _trendDir = CreateDataSeries();
            _bbTrendLine = CreateDataSeries();
            _bbITrend = CreateDataSeries();

            // Load higher-timeframe bars for S/R
            _daily = MarketData.GetBars(TimeFrame.Daily);
            _weekly = MarketData.GetBars(TimeFrame.Weekly);
            _monthly = MarketData.GetBars(TimeFrame.Monthly);
        }

        // ============================================================
        // CALCULATE
        // ============================================================
        public override void Calculate(int index)
        {
            if (index < Math.Max(ST_Period, BB_Period) + 2)
            {
                return;
            }

            CalculateSuperTrend(index);
            CalculateBBTrend(index);

            if (Panel_Show && IsLastBar)
                ReadPandaFiles();

            // Draw S/R zones on the last bar
            if (IsLastBar && SR_Show)
                DrawAllSRZones(index);

            // Alerts on new confirmed bar
            if (IsLastBar && index != _lastAlertBar)
            {
                CheckAlerts(index);
                _lastAlertBar = index;
            }
        }

        // ============================================================
        // SUPERTREND
        // ============================================================
        private void CalculateSuperTrend(int index)
        {
            double atrVal;
            if (ST_UseATR)
                atrVal = _atr.Result[index];
            else
                atrVal = SmaTR(index);

            double src = (Bars.HighPrices[index] + Bars.LowPrices[index]) / 2.0;

            double curUp = src - ST_Multiplier * atrVal;
            double curDn = src + ST_Multiplier * atrVal;

            double prevUp = double.IsNaN(_upBand[index - 1]) ? curUp : _upBand[index - 1];
            double prevDn = double.IsNaN(_dnBand[index - 1]) ? curDn : _dnBand[index - 1];

            // Use close[1] (index-1) to prevent repainting
            if (Bars.ClosePrices[index - 1] > prevUp)
                curUp = Math.Max(curUp, prevUp);

            if (Bars.ClosePrices[index - 1] < prevDn)
                curDn = Math.Min(curDn, prevDn);

            _upBand[index] = curUp;
            _dnBand[index] = curDn;

            // Trend direction using close[1]
            double prevTrend = double.IsNaN(_trendDir[index - 1]) ? 1 : _trendDir[index - 1];

            if (prevTrend == -1 && Bars.ClosePrices[index - 1] > prevDn)
                _trendDir[index] = 1;
            else if (prevTrend == 1 && Bars.ClosePrices[index - 1] < prevUp)
                _trendDir[index] = -1;
            else
                _trendDir[index] = prevTrend;

            // Plot with per-bar coloring via two discontinuous buffers
            double stValue = _trendDir[index] == 1 ? curUp : curDn;

            if (_trendDir[index] == 1)
            {
                STBullish[index] = stValue;
                STBearish[index] = double.NaN;

                // Bridge: if previous was bearish, also set bullish at index-1 to connect
                if (_trendDir[index - 1] == -1)
                    STBullish[index - 1] = _trendDir[index - 1] == 1 ? _upBand[index - 1] : _dnBand[index - 1];
            }
            else
            {
                STBearish[index] = stValue;
                STBullish[index] = double.NaN;

                if (_trendDir[index - 1] == 1)
                    STBearish[index - 1] = _trendDir[index - 1] == 1 ? _upBand[index - 1] : _dnBand[index - 1];
            }

            // Buy/Sell signal arrows
            if (ST_ShowSignals)
            {
                if (_trendDir[index] == 1 && _trendDir[index - 1] == -1)
                {
                    double offset = _atrLabel.Result[index] * 0.5;
                    Chart.DrawIcon(ObjPrefix + "buy_" + index, ChartIconType.UpArrow,
                        Bars.OpenTimes[index], stValue - offset, Color.Lime);
                }

                if (_trendDir[index] == -1 && _trendDir[index - 1] == 1)
                {
                    double offset = _atrLabel.Result[index] * 0.5;
                    Chart.DrawIcon(ObjPrefix + "sell_" + index, ChartIconType.DownArrow,
                        Bars.OpenTimes[index], stValue + offset, Color.Red);
                }
            }
        }

        // ============================================================
        // BB TRENDLINE
        // ============================================================
        private void CalculateBBTrend(int index)
        {
            double bbUpper = _bb.Top[index];
            double bbLower = _bb.Bottom[index];
            double atrBB = _atrBB.Result[index];

            // Previous TrendLine
            double prevTL = double.IsNaN(_bbTrendLine[index - 1]) || _bbTrendLine[index - 1] == 0
                ? Bars.ClosePrices[index]
                : _bbTrendLine[index - 1];

            // Use close[1] and BB[1] to prevent repainting
            double prevClose = Bars.ClosePrices[index - 1];
            double prevBBUpper = _bb.Top[index - 1];
            double prevBBLower = _bb.Bottom[index - 1];

            int bbSignal = 0;
            if (!double.IsNaN(prevBBUpper) && prevClose > prevBBUpper) bbSignal = 1;
            else if (!double.IsNaN(prevBBLower) && prevClose < prevBBLower) bbSignal = -1;

            double curTL = prevTL;

            if (bbSignal == 1)
            {
                curTL = BB_UseATR ? Bars.LowPrices[index] - atrBB : Bars.LowPrices[index];
                curTL = Math.Max(curTL, prevTL);
            }
            else if (bbSignal == -1)
            {
                curTL = BB_UseATR ? Bars.HighPrices[index] + atrBB : Bars.HighPrices[index];
                curTL = Math.Min(curTL, prevTL);
            }

            _bbTrendLine[index] = curTL;

            // iTrend direction
            double prevITrend = double.IsNaN(_bbITrend[index - 1]) ? 0 : _bbITrend[index - 1];
            _bbITrend[index] = prevITrend;

            if (curTL > prevTL) _bbITrend[index] = 1;
            else if (curTL < prevTL) _bbITrend[index] = -1;

            // Plot with per-bar coloring
            if (_bbITrend[index] > 0)
            {
                BBTrendBull[index] = curTL;
                BBTrendBear[index] = double.NaN;

                if (_bbITrend[index - 1] <= 0)
                    BBTrendBull[index - 1] = _bbTrendLine[index - 1];
            }
            else
            {
                BBTrendBear[index] = curTL;
                BBTrendBull[index] = double.NaN;

                if (_bbITrend[index - 1] > 0)
                    BBTrendBear[index - 1] = _bbTrendLine[index - 1];
            }

            // BB Buy/Sell labels
            if (!BB_HideLabels)
            {
                bool buy = _bbITrend[index] == 1 && _bbITrend[index - 1] == -1;
                bool sell = _bbITrend[index] == -1 && _bbITrend[index - 1] == 1;
                double labelOffset = _atrLabel.Result[index];

                if (buy)
                    Chart.DrawIcon(ObjPrefix + "bbBuy_" + index, ChartIconType.Diamond,
                        Bars.OpenTimes[index], curTL - labelOffset, Color.DodgerBlue);

                if (sell)
                    Chart.DrawIcon(ObjPrefix + "bbSell_" + index, ChartIconType.Diamond,
                        Bars.OpenTimes[index], curTL + labelOffset, Color.Red);
            }
        }

        // ============================================================
        // S/R ZONES
        // ============================================================
        private void DrawAllSRZones(int index)
        {
            // Clear old S/R objects
            RemoveObjectsByPrefix(ObjPrefix + "SR_");

            double barSeconds = (Bars.OpenTimes[index] - Bars.OpenTimes[Math.Max(0, index - 1)]).TotalSeconds;
            if (barSeconds <= 0)
                barSeconds = 60;

            DateTime timeLeft = Bars.OpenTimes[0];
            DateTime timeRight = Bars.OpenTimes[index].AddSeconds(barSeconds * Math.Max(Bars.Count, 50));

            // Previous Day
            if (SR_Daily)
            {
                int di = GetPreviousPeriodIndex(_daily);
                if (di >= 0)
                {
                    DrawZone("PDH", _daily.HighPrices[di], SR_DailyColor, timeLeft, timeRight, 1);
                    DrawZone("PDL", _daily.LowPrices[di], SR_DailyColor, timeLeft, timeRight, 1);
                }
            }

            // Previous Week
            if (SR_Weekly)
            {
                int wi = GetPreviousPeriodIndex(_weekly);
                if (wi >= 0)
                {
                    DrawZone("PWH", _weekly.HighPrices[wi], SR_WeeklyColor, timeLeft, timeRight, 1);
                    DrawZone("PWL", _weekly.LowPrices[wi], SR_WeeklyColor, timeLeft, timeRight, 1);
                }
            }

            // Previous Month
            if (SR_Monthly)
            {
                int mi = GetPreviousPeriodIndex(_monthly);
                if (mi >= 0)
                {
                    DrawZone("PMH", _monthly.HighPrices[mi], SR_MonthlyColor, timeLeft, timeRight, 1);
                    DrawZone("PML", _monthly.LowPrices[mi], SR_MonthlyColor, timeLeft, timeRight, 1);
                }
            }

            // Previous Year
            if (SR_Yearly)
            {
                GetPreviousYearHL(out double pyh, out double pyl);
                if (pyh > 0)
                {
                    DrawZone("PYH", pyh, SR_YearlyColor, timeLeft, timeRight, 2);
                    DrawZone("PYL", pyl, SR_YearlyColor, timeLeft, timeRight, 2);
                }
            }
        }

        private void DrawZone(string label, double level, Color clr, DateTime timeLeft, DateTime timeRight, int thickness)
        {
            double offset = level * SR_ZoneWidth / 100.0;
            double top = level + offset;
            double bottom = level - offset;

            // Transparent fill color
            Color fillColor = Color.FromArgb(30, clr.R, clr.G, clr.B);
            Color borderColor = Color.FromArgb(180, clr.R, clr.G, clr.B);

            // Rectangle zone
            string rectName = ObjPrefix + "SR_" + label + "_zone";
            ChartRectangle rect = Chart.DrawRectangle(rectName, timeLeft, top, timeRight, bottom, borderColor, thickness);
            rect.IsFilled = true;
            rect.Color = fillColor;
            rect.IsInteractive = false;

            // Center dotted line
            string lineName = ObjPrefix + "SR_" + label + "_line";
            ChartTrendLine line = Chart.DrawTrendLine(lineName, timeLeft, level, timeRight, level, borderColor);
            line.LineStyle = LineStyle.Dots;
            line.Thickness = 1;
            line.IsInteractive = false;

            // Price label text
            string txtName = ObjPrefix + "SR_" + label + "_txt";
            string text = label + "  " + level.ToString("F" + Symbol.Digits);
            Chart.DrawText(txtName, text, timeRight, level, clr);
        }

        // ============================================================
        // HELPERS
        // ============================================================
        private int GetPreviousPeriodIndex(Bars htfBars)
        {
            int currentIndex = htfBars.Count - 1;
            if (currentIndex < 1) return -1;

            // If current HTF bar is still forming, previous completed = currentIndex - 1
            // If bar is complete, previous = currentIndex - 1
            return currentIndex - 1;
        }

        private void GetPreviousYearHL(out double yearHigh, out double yearLow)
        {
            yearHigh = 0;
            yearLow = double.MaxValue;

            int prevYear = Server.Time.Year - 1;
            DateTime startOfPrevYear = new DateTime(prevYear, 1, 1);
            DateTime endOfPrevYear = new DateTime(prevYear + 1, 1, 1);

            // Use monthly bars to scan previous year
            for (int i = 0; i < _monthly.Count; i++)
            {
                DateTime barTime = _monthly.OpenTimes[i];
                if (barTime >= startOfPrevYear && barTime < endOfPrevYear)
                {
                    yearHigh = Math.Max(yearHigh, _monthly.HighPrices[i]);
                    yearLow = Math.Min(yearLow, _monthly.LowPrices[i]);
                }
            }

            if (yearLow == double.MaxValue)
            {
                yearHigh = 0;
                yearLow = 0;
            }
        }

        private double SmaTR(int index)
        {
            double sum = 0;
            for (int i = 0; i < ST_Period; i++)
            {
                int idx = index - i;
                if (idx < 1) break;

                double tr = Math.Max(Bars.HighPrices[idx] - Bars.LowPrices[idx],
                            Math.Max(Math.Abs(Bars.HighPrices[idx] - Bars.ClosePrices[idx - 1]),
                                     Math.Abs(Bars.LowPrices[idx] - Bars.ClosePrices[idx - 1])));
                sum += tr;
            }
            return sum / ST_Period;
        }

        private void RemoveObjectsByPrefix(string prefix)
        {
            var objects = Chart.Objects;
            for (int i = objects.Count - 1; i >= 0; i--)
            {
                if (objects[i].Name.StartsWith(prefix))
                    Chart.RemoveObject(objects[i].Name);
            }
        }

        private void ReadPandaFiles()
        {
            string cleanSymbol = NormalizeSymbol(SymbolName);
            ReadEngineScoreFile(cleanSymbol);

            string mt4File = System.IO.Path.Combine(_pandaPath, "mt4_" + cleanSymbol + ".txt");
            if (!System.IO.File.Exists(mt4File))
            {
                _scoreBias = "NO DATA";
                DrawPandaPanel(cleanSymbol);
                return;
            }

            string mt4Content;
            try
            {
                using (var fs = new System.IO.FileStream(mt4File, System.IO.FileMode.Open, System.IO.FileAccess.Read, System.IO.FileShare.ReadWrite))
                using (var sr = new System.IO.StreamReader(fs))
                    mt4Content = sr.ReadToEnd();
            }
            catch
            {
                return;
            }

            if (mt4Content == _lastMt4Snapshot)
            {
                DrawPandaPanel(cleanSymbol);
                return;
            }

            _lastMt4Snapshot = mt4Content;
            string[] mt4Lines = mt4Content.Split(new[] { "\r\n", "\n" }, StringSplitOptions.None);
            if (mt4Lines.Length < 2)
                return;

            _baseLine = mt4Lines[0];
            _quoteLine = mt4Lines[1];
            _advBase = mt4Lines.Length > 2 ? mt4Lines[2] : "";
            _advQuote = mt4Lines.Length > 3 ? mt4Lines[3] : "";
            _atrLine = mt4Lines.Length > 4 ? mt4Lines[4] : "";
            _spreadLine = mt4Lines.Length > 5 ? mt4Lines[5] : "";

            bool baseInvalid = ExtractScore(_baseLine, out _baseAbs);
            bool quoteInvalid = ExtractScore(_quoteLine, out _quoteAbs);
            bool hardInvalid = baseInvalid || quoteInvalid;
            _scoreGap = hardInvalid ? 0 : _baseAbs - _quoteAbs;

            if (hardInvalid)
            {
                _scoreBias = "HARD_INVALID";
                _scoreExecution = "NONE";
                _scoreConfidence = "INVALID";
            }
            else
            {
                int g = Math.Abs(_scoreGap);
                if (g >= 5)
                {
                    _scoreBias = _scoreGap > 0 ? "BUY" : "SELL";
                    _scoreExecution = g >= 9 ? "MARKET" : "PULLBACK";
                    _scoreConfidence = g >= 10 ? "HIGH" : g >= 8 ? "MEDIUM" : "LOW";
                }
                else
                {
                    _scoreBias = "INVALID";
                    _scoreExecution = "NONE";
                    _scoreConfidence = "INVALID";
                }
            }

            WritePandaFile(cleanSymbol);
            DrawPandaBoxes(mt4Lines);
            _lastRead = DateTime.UtcNow;
            DrawPandaPanel(cleanSymbol);
        }

        private void ReadEngineScoreFile(string cleanSymbol)
        {
            string scoreFile = System.IO.Path.Combine(_pandaPath, "panda_score_" + cleanSymbol + ".txt");
            if (!System.IO.File.Exists(scoreFile))
                return;

            string[] lines;
            try
            {
                using (var fs = new System.IO.FileStream(scoreFile, System.IO.FileMode.Open, System.IO.FileAccess.Read, System.IO.FileShare.ReadWrite))
                using (var sr = new System.IO.StreamReader(fs))
                    lines = sr.ReadToEnd().Split(new[] { "\r\n", "\n" }, StringSplitOptions.RemoveEmptyEntries);
            }
            catch
            {
                return;
            }

            foreach (string raw in lines)
            {
                int sep = raw.IndexOf(':');
                if (sep < 0)
                    continue;

                string key = raw.Substring(0, sep).Trim();
                string val = raw.Substring(sep + 1).Trim();

                if (key == "GAP") _engineGap = ToInt(val);
                else if (key == "BIAS") _engineBias = val;
                else if (key == "CONFIDENCE") _engineConfidence = val;
                else if (key == "EXECUTION") _engineExecution = val;
                else if (key == "MOMENTUM") _momentum = val;
                else if (key == "STRENGTH") _strength = ToDouble(val);
                else if (key == "PL_ZONE") _plZone = val;
                else if (key == "PL_G1") _plG1 = ToInt(val);
                else if (key == "BOX_H1") _boxH1 = val;
                else if (key == "BOX_H4") _boxH4 = val;
                else if (key == "CONFLUENCE") _confluence = ToInt(val);
            }

            _lastEngineRead = DateTime.UtcNow;
        }

        private bool ExtractScore(string line, out int score)
        {
            score = 0;
            if (line.TrimStart().StartsWith("ADV"))
                return false;

            MatchCollection matches = Regex.Matches(line, @"(D1|H4|H1)\s*:\s*([+-]?\d+)(?:/([+-]?\d+))?");
            List<int> values = new List<int>();
            int posCount = 0;
            int negCount = 0;

            foreach (Match m in matches)
            {
                AddScore(int.Parse(m.Groups[2].Value), values, ref posCount, ref negCount);
                if (m.Groups[3].Success)
                    AddScore(int.Parse(m.Groups[3].Value), values, ref posCount, ref negCount);
            }

            if (posCount > 0 && negCount > 0)
                return true;

            int strongestPos = 0;
            int strongestNeg = 0;
            for (int i = 0; i < values.Count; i++)
            {
                int value = values[i];
                if (value > strongestPos)
                    strongestPos = value;
                if (value < strongestNeg)
                    strongestNeg = value;
            }

            int absPos = Math.Abs(strongestPos);
            int absNeg = Math.Abs(strongestNeg);
            if (absPos == absNeg && absPos != 0)
            {
                score = 0;
                return false;
            }

            score = absNeg > absPos ? strongestNeg : strongestPos;
            return false;
        }

        private void AddScore(int value, List<int> values, ref int posCount, ref int negCount)
        {
            values.Add(value);
            if (value >= 3)
                posCount++;
            if (value <= -3)
                negCount++;
        }

        private void WritePandaFile(string cleanSymbol)
        {
            try
            {
                string pandaFile = System.IO.Path.Combine(_pandaPath, "panda_" + cleanSymbol + ".txt");
                string content =
                    "GAP SCORE : " + _scoreGap + "\n" +
                    "BIAS : " + _scoreBias + "\n" +
                    "EXECUTION : " + _scoreExecution + "\n" +
                    "CONFIDENCE : " + _scoreConfidence + "\n";
                System.IO.File.WriteAllText(pandaFile, content);
            }
            catch
            {
            }
        }

        private void DrawPandaPanel(string cleanSymbol)
        {
            Color biasColor = Color.Gray;
            if (_scoreBias == "BUY")
                biasColor = Color.LimeGreen;
            else if (_scoreBias == "SELL")
                biasColor = Color.Red;
            else if (_scoreBias == "HARD_INVALID")
                biasColor = Color.Orange;

            string panel =
                "pandalinev3\n" +
                "PAIR        " + cleanSymbol + "\n" +
                "BIAS        " + _scoreBias + "\n" +
                "GAP SCORE   " + Signed(_scoreGap) + "\n" +
                "------------------------------\n" +
                "CONFLUENCE  " + _confluence + "\n" +
                "PL ZONE     " + _plZone + "   G1 " + (_plG1 == 1 ? "OK" : "WAIT") + "\n" +
                "BOX         H1 " + ShortBox(_boxH1) + "   H4 " + ShortBox(_boxH4) + "\n" +
                "BOX LINES   " + _boxCount + "\n" +
                "MOMENTUM    " + _momentum + "   STRENGTH " + _strength.ToString("0.0", CultureInfo.InvariantCulture) + "\n" +
                "------------------------------\n" +
                "ENGINE      " + Signed(_engineGap) + " " + _engineBias + " " + _engineExecution + " " + _engineConfidence + "\n" +
                "EXECUTION   " + _scoreExecution + "\n" +
                "CONFIDENCE  " + _scoreConfidence + "\n" +
                "------------------------------\n" +
                "RAW SCORING\n" +
                Clip(_baseLine) + "\n" +
                Clip(_quoteLine) + "\n" +
                Clip(_advBase) + "\n" +
                Clip(_advQuote) + "\n" +
                Clip(_atrLine) + "\n" +
                Clip(_spreadLine) + "\n" +
                Freshness();

            Chart.DrawStaticText("panda_lines_v41_panel", panel, VerticalAlignment.Bottom, HorizontalAlignment.Left, biasColor);
        }

        private void DrawPandaBoxes(string[] lines)
        {
            _boxCount = 0;
            foreach (string box in lines)
            {
                if (!box.StartsWith("BOX|"))
                    continue;

                string[] parts = box.Split('|');
                if (parts.Length < 6)
                    continue;

                string name = BoxPrefix + parts[1];
                DateTime t1 = UnixToDateTime(long.Parse(parts[2]));
                double price1 = ToDouble(parts[3]);
                DateTime t2 = UnixToDateTime(long.Parse(parts[4]));
                double price2 = ToDouble(parts[5]);

                Chart.RemoveObject(name);
                ChartRectangle rect = Chart.DrawRectangle(name, t1, price1, t2, price2, Color.FromArgb(160, 0, 255, 0), 2);
                rect.IsFilled = true;
                rect.IsInteractive = false;
                _drawnBoxes.Add(name);
                _boxCount++;
            }
        }

        private string NormalizeSymbol(string symbol)
        {
            string clean = Regex.Replace(symbol, @"[^A-Z]", "");
            return clean.Length > 6 ? clean.Substring(0, 6) : clean;
        }

        private DateTime UnixToDateTime(long seconds)
        {
            return new DateTime(1970, 1, 1).AddSeconds(seconds);
        }

        private int ToInt(string value)
        {
            int result;
            return int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out result) ? result : 0;
        }

        private double ToDouble(string value)
        {
            double result;
            return double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out result) ? result : 0;
        }

        private string Signed(int value)
        {
            return value > 0 ? "+" + value : value.ToString();
        }

        private string ShortBox(string value)
        {
            if (value == "UPTREND") return "UP";
            if (value == "DOWNTREND") return "DN";
            if (value == "RANGING") return "RNG";
            return IsBlank(value) ? "--" : value;
        }

        private string Clip(string value)
        {
            if (IsBlank(value))
                return "--";
            return value.Length > 46 ? value.Substring(0, 43) + "..." : value;
        }

        private bool IsBlank(string value)
        {
            return value == null || value.Trim().Length == 0;
        }

        private string Freshness()
        {
            List<string> parts = new List<string>();
            if (_lastRead != DateTime.MinValue)
                parts.Add("MT4 " + AgeLabel(_lastRead));
            if (_lastEngineRead != DateTime.MinValue)
                parts.Add("ENG " + AgeLabel(_lastEngineRead));
            return string.Join(" / ", parts.ToArray());
        }

        private string AgeLabel(DateTime time)
        {
            double seconds = Math.Max(0, (DateTime.UtcNow - time).TotalSeconds);
            return seconds < 120 ? "LIVE" : ((int)(seconds / 60)).ToString() + "m";
        }

        // ============================================================
        // ALERTS
        // ============================================================
        private void CheckAlerts(int index)
        {
            if (index < 3) return;

            if (AL_SuperTrend)
            {
                if (_trendDir[index - 1] == 1 && _trendDir[index - 2] == -1)
                    Notifications.PlaySound("C:\\Windows\\Media\\tada.wav");

                if (_trendDir[index - 1] == -1 && _trendDir[index - 2] == 1)
                    Notifications.PlaySound("C:\\Windows\\Media\\chord.wav");
            }

            if (AL_BB)
            {
                if (_bbITrend[index - 1] == 1 && _bbITrend[index - 2] == -1)
                    Notifications.PlaySound("C:\\Windows\\Media\\tada.wav");

                if (_bbITrend[index - 1] == -1 && _bbITrend[index - 2] == 1)
                    Notifications.PlaySound("C:\\Windows\\Media\\chord.wav");
            }
        }
    }
}
