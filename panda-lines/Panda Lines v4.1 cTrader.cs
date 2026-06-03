// -----------------------------------------------------------------
//  TBG Indicator for cTrader (cAlgo)
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
    public class Panda_Lines_v4_1_cTrader : Indicator
    {
        // ============================================================
        // SUPERTREND PARAMETERS
        // ============================================================
        [Parameter("ATR Period", Group = "SuperTrend", DefaultValue = 10, MinValue = 1)]
        public int ST_Period { get; set; }

        [Parameter("ATR Multiplier", Group = "SuperTrend", DefaultValue = 3.0, MinValue = 0.1, Step = 0.1)]
        public double ST_Multiplier { get; set; }

        [Parameter("Use ATR (else SMA of TR)", Group = "SuperTrend", DefaultValue = true)]
        public bool ST_UseATR { get; set; }

        [Parameter("Show Buy/Sell Signals", Group = "SuperTrend", DefaultValue = true)]
        public bool ST_ShowSignals { get; set; }

        // ============================================================
        // BB TRENDLINE PARAMETERS
        // ============================================================
        [Parameter("BB Period", Group = "BB TrendLine", DefaultValue = 21, MinValue = 2)]
        public int BB_Period { get; set; }

        [Parameter("BB Deviations", Group = "BB TrendLine", DefaultValue = 1.0, MinValue = 0.1, Step = 0.1)]
        public double BB_Deviations { get; set; }

        [Parameter("ATR Filter", Group = "BB TrendLine", DefaultValue = true)]
        public bool BB_UseATR { get; set; }

        [Parameter("BB ATR Period", Group = "BB TrendLine", DefaultValue = 5, MinValue = 1)]
        public int BB_ATRPeriod { get; set; }

        [Parameter("Hide BB Labels", Group = "BB TrendLine", DefaultValue = false)]
        public bool BB_HideLabels { get; set; }

        // ============================================================
        // S/R ZONES PARAMETERS
        // ============================================================
        [Parameter("Show S/R Zones", Group = "S/R Zones", DefaultValue = true)]
        public bool SR_Show { get; set; }

        [Parameter("Previous Day", Group = "S/R Zones", DefaultValue = true)]
        public bool SR_Daily { get; set; }

        [Parameter("Previous Week", Group = "S/R Zones", DefaultValue = true)]
        public bool SR_Weekly { get; set; }

        [Parameter("Previous Month", Group = "S/R Zones", DefaultValue = true)]
        public bool SR_Monthly { get; set; }

        [Parameter("Previous Year", Group = "S/R Zones", DefaultValue = true)]
        public bool SR_Yearly { get; set; }

        [Parameter("Zone Thickness (%)", Group = "S/R Zones", DefaultValue = 0.15, MinValue = 0.01, MaxValue = 1.0, Step = 0.05)]
        public double SR_ZoneWidth { get; set; }

        [Parameter("Extend Left (bars)", Group = "S/R Zones", DefaultValue = 200, MinValue = 0, MaxValue = 5000, Step = 50)]
        public int SR_ExtendLeft { get; set; }

        [Parameter("Daily Color", Group = "S/R Zones", DefaultValue = "Orange")]
        public Color SR_DailyColor { get; set; }

        [Parameter("Weekly Color", Group = "S/R Zones", DefaultValue = "DodgerBlue")]
        public Color SR_WeeklyColor { get; set; }

        [Parameter("Monthly Color", Group = "S/R Zones", DefaultValue = "DarkViolet")]
        public Color SR_MonthlyColor { get; set; }

        [Parameter("Yearly Color", Group = "S/R Zones", DefaultValue = "Crimson")]
        public Color SR_YearlyColor { get; set; }

        // ============================================================
        // ALERT PARAMETERS
        // ============================================================
        [Parameter("SuperTrend Alerts", Group = "Alerts", DefaultValue = true)]
        public bool AL_SuperTrend { get; set; }

        [Parameter("BB TrendLine Alerts", Group = "Alerts", DefaultValue = true)]
        public bool AL_BB { get; set; }

        [Parameter("Show Panda Panel", Group = "Panda Panel", DefaultValue = true)]
        public bool Panel_Show { get; set; }

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
        private const string ObjPrefix = "PandaLinesV41_";
        private const string BoxPrefix = "PandaBoxV41_";
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
