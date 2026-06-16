//+------------------------------------------------------------------+
//| pandalinev3 for MetaTrader 5                                     |
//| Ported from cTrader/cAlgo: SuperTrend + BB TrendLine + S/R Zones |
//+------------------------------------------------------------------+
#property strict
#property indicator_chart_window
#property indicator_buffers 4
#property indicator_plots 4

#property indicator_label1 "ST Bullish"
#property indicator_type1 DRAW_LINE
#property indicator_color1 clrLime
#property indicator_width1 2

#property indicator_label2 "ST Bearish"
#property indicator_type2 DRAW_LINE
#property indicator_color2 clrRed
#property indicator_width2 2

#property indicator_label3 "BB Trend Bullish"
#property indicator_type3 DRAW_LINE
#property indicator_color3 clrDodgerBlue
#property indicator_width3 2

#property indicator_label4 "BB Trend Bearish"
#property indicator_type4 DRAW_LINE
#property indicator_color4 clrRed
#property indicator_width4 2

const int      ST_Period       = 10;
const double   ST_Multiplier   = 3.0;
const bool     ST_UseATR       = true;
const bool     ST_ShowSignals  = true;

const int      BB_Period       = 21;
const double   BB_Deviations   = 1.0;
const bool     BB_UseATR       = true;
const int      BB_ATRPeriod    = 5;
const bool     BB_HideLabels   = false;

const bool     SR_Show         = true;
const bool     SR_Daily        = true;
const bool     SR_Weekly       = true;
const bool     SR_Monthly      = true;
const bool     SR_Yearly       = true;
const double   SR_ZoneWidth    = 0.01;
const color    SR_DailyColor   = clrOrange;
const color    SR_WeeklyColor  = clrDodgerBlue;
const color    SR_MonthlyColor = clrDarkViolet;
const color    SR_YearlyColor  = clrCrimson;

const bool     AL_SuperTrend   = true;
const bool     AL_BB           = true;

double STBullish[];
double STBearish[];
double BBTrendBull[];
double BBTrendBear[];

double UpBand[];
double DnBand[];
double TrendDir[];
double BBTrendLine[];
double BBITrend[];

datetime LastAlertTime = 0;
string ObjPrefix = "PandaLinesV3_";

int OnInit()
{
   IndicatorSetString(INDICATOR_SHORTNAME, "pandalinev3");

   SetIndexBuffer(0, STBullish, INDICATOR_DATA);
   SetIndexBuffer(1, STBearish, INDICATOR_DATA);
   SetIndexBuffer(2, BBTrendBull, INDICATOR_DATA);
   SetIndexBuffer(3, BBTrendBear, INDICATOR_DATA);

   ArraySetAsSeries(STBullish, true);
   ArraySetAsSeries(STBearish, true);
   ArraySetAsSeries(BBTrendBull, true);
   ArraySetAsSeries(BBTrendBear, true);

   for(int plot = 0; plot < 4; plot++)
      PlotIndexSetDouble(plot, PLOT_EMPTY_VALUE, EMPTY_VALUE);

   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   RemoveObjectsByPrefix(ObjPrefix);
}

int OnCalculate(const int rates_total,
                const int prev_calculated,
                const datetime &time[],
                const double &open[],
                const double &high[],
                const double &low[],
                const double &close[],
                const long &tick_volume[],
                const long &volume[],
                const int &spread[])
{
   ArraySetAsSeries(time, true);
   ArraySetAsSeries(high, true);
   ArraySetAsSeries(low, true);
   ArraySetAsSeries(close, true);

   int min_required = MathMax(MathMax(ST_Period, BB_Period), BB_ATRPeriod) + 3;
   if(rates_total <= min_required)
      return(0);

   ArrayResize(UpBand, rates_total);
   ArrayResize(DnBand, rates_total);
   ArrayResize(TrendDir, rates_total);
   ArrayResize(BBTrendLine, rates_total);
   ArrayResize(BBITrend, rates_total);
   ArraySetAsSeries(UpBand, true);
   ArraySetAsSeries(DnBand, true);
   ArraySetAsSeries(TrendDir, true);
   ArraySetAsSeries(BBTrendLine, true);
   ArraySetAsSeries(BBITrend, true);

   int first = rates_total - min_required;
   UpBand[first + 1] = EMPTY_VALUE;
   DnBand[first + 1] = EMPTY_VALUE;
   TrendDir[first + 1] = EMPTY_VALUE;
   BBTrendLine[first + 1] = EMPTY_VALUE;
   BBITrend[first + 1] = EMPTY_VALUE;

   for(int i = first; i >= 0; i--)
   {
      STBullish[i] = EMPTY_VALUE;
      STBearish[i] = EMPTY_VALUE;
      BBTrendBull[i] = EMPTY_VALUE;
      BBTrendBear[i] = EMPTY_VALUE;

      CalculateSuperTrend(i, rates_total, time, high, low, close);
      CalculateBBTrend(i, rates_total, time, high, low, close);
   }

   if(SR_Show)
      DrawAllSRZones(time, rates_total);

   if(time[0] != LastAlertTime)
   {
      CheckAlerts();
      LastAlertTime = time[0];
   }

   return(rates_total);
}

void CalculateSuperTrend(const int i,
                         const int rates_total,
                         const datetime &time[],
                         const double &high[],
                         const double &low[],
                         const double &close[])
{
   double atr_val = AtrSma(i, ST_Period, rates_total, high, low, close);
   double src = (high[i] + low[i]) / 2.0;

   double cur_up = src - ST_Multiplier * atr_val;
   double cur_dn = src + ST_Multiplier * atr_val;

   double prev_up = IsValid(UpBand[i + 1]) ? UpBand[i + 1] : cur_up;
   double prev_dn = IsValid(DnBand[i + 1]) ? DnBand[i + 1] : cur_dn;

   if(close[i + 1] > prev_up)
      cur_up = MathMax(cur_up, prev_up);
   if(close[i + 1] < prev_dn)
      cur_dn = MathMin(cur_dn, prev_dn);

   UpBand[i] = cur_up;
   DnBand[i] = cur_dn;

   double prev_trend = IsValid(TrendDir[i + 1]) ? TrendDir[i + 1] : 1.0;
   if(prev_trend == -1.0 && close[i + 1] > prev_dn)
      TrendDir[i] = 1.0;
   else if(prev_trend == 1.0 && close[i + 1] < prev_up)
      TrendDir[i] = -1.0;
   else
      TrendDir[i] = prev_trend;

   double st_value = (TrendDir[i] == 1.0) ? cur_up : cur_dn;
   if(TrendDir[i] == 1.0)
   {
      STBullish[i] = st_value;
      STBearish[i] = EMPTY_VALUE;
      if(TrendDir[i + 1] == -1.0)
         STBullish[i + 1] = (TrendDir[i + 1] == 1.0) ? UpBand[i + 1] : DnBand[i + 1];
   }
   else
   {
      STBearish[i] = st_value;
      STBullish[i] = EMPTY_VALUE;
      if(TrendDir[i + 1] == 1.0)
         STBearish[i + 1] = (TrendDir[i + 1] == 1.0) ? UpBand[i + 1] : DnBand[i + 1];
   }

   if(ST_ShowSignals)
   {
      double offset = AtrSma(i, 8, rates_total, high, low, close) * 0.5;
      if(TrendDir[i] == 1.0 && TrendDir[i + 1] == -1.0)
         DrawArrow(ObjPrefix + "buy_" + IntegerToString((long)time[i]), time[i], st_value - offset, clrLime, 233);
      if(TrendDir[i] == -1.0 && TrendDir[i + 1] == 1.0)
         DrawArrow(ObjPrefix + "sell_" + IntegerToString((long)time[i]), time[i], st_value + offset, clrRed, 234);
   }
}

void CalculateBBTrend(const int i,
                      const int rates_total,
                      const datetime &time[],
                      const double &high[],
                      const double &low[],
                      const double &close[])
{
   double atr_bb = AtrSma(i, BB_ATRPeriod, rates_total, high, low, close);
   double prev_tl = (IsValid(BBTrendLine[i + 1]) && BBTrendLine[i + 1] != 0.0) ? BBTrendLine[i + 1] : close[i];

   double prev_close = close[i + 1];
   double prev_sma = SmaClose(i + 1, BB_Period, rates_total, close);
   double prev_std = StdDevClose(i + 1, BB_Period, rates_total, close, prev_sma);
   double prev_upper = prev_sma + BB_Deviations * prev_std;
   double prev_lower = prev_sma - BB_Deviations * prev_std;

   int bb_signal = 0;
   if(prev_close > prev_upper)
      bb_signal = 1;
   else if(prev_close < prev_lower)
      bb_signal = -1;

   double cur_tl = prev_tl;
   if(bb_signal == 1)
   {
      cur_tl = BB_UseATR ? low[i] - atr_bb : low[i];
      cur_tl = MathMax(cur_tl, prev_tl);
   }
   else if(bb_signal == -1)
   {
      cur_tl = BB_UseATR ? high[i] + atr_bb : high[i];
      cur_tl = MathMin(cur_tl, prev_tl);
   }

   BBTrendLine[i] = cur_tl;

   double prev_itrend = IsValid(BBITrend[i + 1]) ? BBITrend[i + 1] : 0.0;
   BBITrend[i] = prev_itrend;
   if(cur_tl > prev_tl)
      BBITrend[i] = 1.0;
   else if(cur_tl < prev_tl)
      BBITrend[i] = -1.0;

   if(BBITrend[i] > 0.0)
   {
      BBTrendBull[i] = cur_tl;
      BBTrendBear[i] = EMPTY_VALUE;
      if(BBITrend[i + 1] <= 0.0)
         BBTrendBull[i + 1] = BBTrendLine[i + 1];
   }
   else
   {
      BBTrendBear[i] = cur_tl;
      BBTrendBull[i] = EMPTY_VALUE;
      if(BBITrend[i + 1] > 0.0)
         BBTrendBear[i + 1] = BBTrendLine[i + 1];
   }

   if(!BB_HideLabels)
   {
      double label_offset = AtrSma(i, 8, rates_total, high, low, close);
      if(BBITrend[i] == 1.0 && BBITrend[i + 1] == -1.0)
         DrawArrow(ObjPrefix + "bbBuy_" + IntegerToString((long)time[i]), time[i], cur_tl - label_offset, clrDodgerBlue, 117);
      if(BBITrend[i] == -1.0 && BBITrend[i + 1] == 1.0)
         DrawArrow(ObjPrefix + "bbSell_" + IntegerToString((long)time[i]), time[i], cur_tl + label_offset, clrRed, 117);
   }
}

double TrueRange(const int i,
                 const int rates_total,
                 const double &high[],
                 const double &low[],
                 const double &close[])
{
   if(i + 1 >= rates_total)
      return(high[i] - low[i]);

   return(MathMax(high[i] - low[i],
          MathMax(MathAbs(high[i] - close[i + 1]),
                  MathAbs(low[i] - close[i + 1]))));
}

double AtrSma(const int i,
              const int period,
              const int rates_total,
              const double &high[],
              const double &low[],
              const double &close[])
{
   double sum = 0.0;
   int count = 0;
   for(int k = 0; k < period && i + k < rates_total; k++)
   {
      sum += TrueRange(i + k, rates_total, high, low, close);
      count++;
   }
   return(count > 0 ? sum / period : 0.0);
}

double SmaClose(const int i, const int period, const int rates_total, const double &close[])
{
   double sum = 0.0;
   for(int k = 0; k < period && i + k < rates_total; k++)
      sum += close[i + k];
   return(sum / period);
}

double StdDevClose(const int i, const int period, const int rates_total, const double &close[], const double mean)
{
   double sum = 0.0;
   for(int k = 0; k < period && i + k < rates_total; k++)
   {
      double delta = close[i + k] - mean;
      sum += delta * delta;
   }
   return(MathSqrt(sum / period));
}

bool IsValid(const double value)
{
   return(value != EMPTY_VALUE && MathIsValidNumber(value));
}

void DrawArrow(const string name, const datetime t, const double price, const color clr, const int code)
{
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_ARROW, 0, t, price);
   ObjectSetInteger(0, name, OBJPROP_ARROWCODE, code);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, 1);
   ObjectSetDouble(0, name, OBJPROP_PRICE, 0, price);
   ObjectSetInteger(0, name, OBJPROP_TIME, 0, t);
}

void DrawAllSRZones(const datetime &time[], const int rates_total)
{
   RemoveObjectsByPrefix(ObjPrefix + "SR_");

   int chart_bars = (int)ChartGetInteger(0, CHART_VISIBLE_BARS);
   int future_bars = MathMax(chart_bars, 50);
   int period_seconds = PeriodSeconds(_Period);
   if(period_seconds <= 0)
      period_seconds = 60;

   datetime time_left = time[rates_total - 1];
   datetime time_right = time[0] + period_seconds * future_bars;

   if(SR_Daily)
   {
      double h = iHigh(_Symbol, PERIOD_D1, 1);
      double l = iLow(_Symbol, PERIOD_D1, 1);
      if(h > 0.0 && l > 0.0)
      {
         DrawZone("PDH", h, SR_DailyColor, time_left, time_right, 1);
         DrawZone("PDL", l, SR_DailyColor, time_left, time_right, 1);
      }
   }

   if(SR_Weekly)
   {
      double h = iHigh(_Symbol, PERIOD_W1, 1);
      double l = iLow(_Symbol, PERIOD_W1, 1);
      if(h > 0.0 && l > 0.0)
      {
         DrawZone("PWH", h, SR_WeeklyColor, time_left, time_right, 1);
         DrawZone("PWL", l, SR_WeeklyColor, time_left, time_right, 1);
      }
   }

   if(SR_Monthly)
   {
      double h = iHigh(_Symbol, PERIOD_MN1, 1);
      double l = iLow(_Symbol, PERIOD_MN1, 1);
      if(h > 0.0 && l > 0.0)
      {
         DrawZone("PMH", h, SR_MonthlyColor, time_left, time_right, 1);
         DrawZone("PML", l, SR_MonthlyColor, time_left, time_right, 1);
      }
   }

   if(SR_Yearly)
   {
      double yh, yl;
      GetPreviousYearHL(yh, yl);
      if(yh > 0.0 && yl > 0.0)
      {
         DrawZone("PYH", yh, SR_YearlyColor, time_left, time_right, 2);
         DrawZone("PYL", yl, SR_YearlyColor, time_left, time_right, 2);
      }
   }
}

void DrawZone(const string label,
              const double level,
              const color clr,
              const datetime time_left,
              const datetime time_right,
              const int thickness)
{
   double offset = level * SR_ZoneWidth / 100.0;
   double top = level + offset;
   double bottom = level - offset;

   string rect_name = ObjPrefix + "SR_" + label + "_zone";
   ObjectCreate(0, rect_name, OBJ_RECTANGLE, 0, time_left, top, time_right, bottom);
   ObjectSetInteger(0, rect_name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, rect_name, OBJPROP_WIDTH, thickness);
   ObjectSetInteger(0, rect_name, OBJPROP_BACK, true);
   ObjectSetInteger(0, rect_name, OBJPROP_FILL, true);
   ObjectSetInteger(0, rect_name, OBJPROP_SELECTABLE, false);

   string line_name = ObjPrefix + "SR_" + label + "_line";
   ObjectCreate(0, line_name, OBJ_TREND, 0, time_left, level, time_right, level);
   ObjectSetInteger(0, line_name, OBJPROP_RAY_RIGHT, false);
   ObjectSetInteger(0, line_name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, line_name, OBJPROP_STYLE, STYLE_DOT);
   ObjectSetInteger(0, line_name, OBJPROP_WIDTH, 1);
   ObjectSetInteger(0, line_name, OBJPROP_SELECTABLE, false);

   string txt_name = ObjPrefix + "SR_" + label + "_txt";
   ObjectCreate(0, txt_name, OBJ_TEXT, 0, time_right, level);
   ObjectSetString(0, txt_name, OBJPROP_TEXT, label + "  " + DoubleToString(level, _Digits));
   ObjectSetString(0, txt_name, OBJPROP_FONT, "Arial");
   ObjectSetInteger(0, txt_name, OBJPROP_FONTSIZE, 8);
   ObjectSetInteger(0, txt_name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, txt_name, OBJPROP_SELECTABLE, false);
}

void GetPreviousYearHL(double &year_high, double &year_low)
{
   year_high = 0.0;
   year_low = DBL_MAX;

   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   int prev_year = dt.year - 1;

   int bars = Bars(_Symbol, PERIOD_MN1);
   for(int shift = 1; shift < bars; shift++)
   {
      datetime t = iTime(_Symbol, PERIOD_MN1, shift);
      MqlDateTime bar_dt;
      TimeToStruct(t, bar_dt);
      if(bar_dt.year == prev_year)
      {
         year_high = MathMax(year_high, iHigh(_Symbol, PERIOD_MN1, shift));
         year_low = MathMin(year_low, iLow(_Symbol, PERIOD_MN1, shift));
      }
   }

   if(year_low == DBL_MAX)
   {
      year_high = 0.0;
      year_low = 0.0;
   }
}

void CheckAlerts()
{
   if(AL_SuperTrend)
   {
      if(TrendDir[1] == 1.0 && TrendDir[2] == -1.0)
         PlaySound("tada.wav");
      if(TrendDir[1] == -1.0 && TrendDir[2] == 1.0)
         PlaySound("chord.wav");
   }

   if(AL_BB)
   {
      if(BBITrend[1] == 1.0 && BBITrend[2] == -1.0)
         PlaySound("tada.wav");
      if(BBITrend[1] == -1.0 && BBITrend[2] == 1.0)
         PlaySound("chord.wav");
   }
}

void RemoveObjectsByPrefix(const string prefix)
{
   for(int i = ObjectsTotal(0, 0, -1) - 1; i >= 0; i--)
   {
      string name = ObjectName(0, i, 0, -1);
      if(StringFind(name, prefix) == 0)
         ObjectDelete(0, name);
   }
}
