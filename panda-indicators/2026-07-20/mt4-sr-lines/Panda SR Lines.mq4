//+------------------------------------------------------------------+
//|  Panda SR Lines                                                  |
//|  Clean support/resistance from previous day/week/month/year       |
//|  high & low. Full-width horizontal lines, NO letter labels, just   |
//|  the price value shown on each line. No boxes. Lightweight.        |
//|  Computed from the chart's own data only. Never trades.            |
//+------------------------------------------------------------------+
#property strict
#property indicator_chart_window

input bool            ShowPrevDay    = true;         // previous day high/low
input bool            ShowPrevWeek   = true;         // previous week high/low
input bool            ShowPrevMonth  = true;         // previous month high/low
input bool            ShowPrevYear   = false;        // previous year high/low
input bool            ShowPriceLabel = true;         // show price value on each line
input color           DayColor       = clrOrange;
input color           WeekColor      = clrDodgerBlue;
input color           MonthColor     = clrDarkViolet;
input color           YearColor      = clrCrimson;
input int             LineWidth      = 1;
input ENUM_LINE_STYLE LineStyle      = STYLE_SOLID;
input int             LabelFontSize  = 8;
input int             LabelShiftBars = 3;            // push price label this many bars past the last candle

string PFX = "PSR_";

int OnInit()
{
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   ObjectsDeleteAll(0, PFX);
}

// Draw one full-width horizontal S/R line plus its price label at the right edge.
void DrawLevel(const string tag, const bool show, const double price, const color clr)
{
   string ln = PFX + tag;
   string tx = PFX + tag + "_p";
   if(!show || price <= 0.0)
   {
      ObjectDelete(0, ln);
      ObjectDelete(0, tx);
      return;
   }

   if(ObjectFind(0, ln) < 0) ObjectCreate(0, ln, OBJ_HLINE, 0, 0, price);
   ObjectSetDouble(0, ln, OBJPROP_PRICE1, price);
   ObjectSetInteger(0, ln, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, ln, OBJPROP_WIDTH, LineWidth);
   ObjectSetInteger(0, ln, OBJPROP_STYLE, LineStyle);
   ObjectSetInteger(0, ln, OBJPROP_BACK, false);
   ObjectSetInteger(0, ln, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, ln, OBJPROP_HIDDEN, true);

   if(ShowPriceLabel)
   {
      datetime tt = Time[0] + LabelShiftBars * PeriodSeconds();
      if(ObjectFind(0, tx) < 0) ObjectCreate(0, tx, OBJ_TEXT, 0, tt, price);
      ObjectSetInteger(0, tx, OBJPROP_TIME1, tt);
      ObjectSetDouble(0, tx, OBJPROP_PRICE1, price);
      ObjectSetString(0, tx, OBJPROP_TEXT, DoubleToString(price, Digits));
      ObjectSetInteger(0, tx, OBJPROP_COLOR, clr);
      ObjectSetInteger(0, tx, OBJPROP_FONTSIZE, LabelFontSize);
      ObjectSetInteger(0, tx, OBJPROP_ANCHOR, ANCHOR_LEFT);
      ObjectSetInteger(0, tx, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, tx, OBJPROP_HIDDEN, true);
   }
   else ObjectDelete(0, tx);
}

// Previous calendar-year high/low, scanned from monthly bars.
void PrevYearHL(double &yh, double &yl)
{
   yh = 0.0;
   yl = DBL_MAX;
   int py = TimeYear(TimeCurrent()) - 1;
   int mbars = iBars(NULL, PERIOD_MN1);
   for(int i = 0; i < mbars; i++)
   {
      datetime bt = iTime(NULL, PERIOD_MN1, i);
      if(TimeYear(bt) == py)
      {
         yh = MathMax(yh, iHigh(NULL, PERIOD_MN1, i));
         yl = MathMin(yl, iLow(NULL, PERIOD_MN1, i));
      }
   }
   if(yl == DBL_MAX) { yh = 0.0; yl = 0.0; }
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
   if(rates_total <= 0) return(0);

   // Previous completed period high/low from higher-timeframe bars (shift 1).
   double pdh = iHigh(NULL, PERIOD_D1,  1);  double pdl = iLow(NULL, PERIOD_D1,  1);
   double pwh = iHigh(NULL, PERIOD_W1,  1);  double pwl = iLow(NULL, PERIOD_W1,  1);
   double pmh = iHigh(NULL, PERIOD_MN1, 1);  double pml = iLow(NULL, PERIOD_MN1, 1);
   double pyh, pyl; PrevYearHL(pyh, pyl);

   DrawLevel("PDH", ShowPrevDay,   pdh, DayColor);
   DrawLevel("PDL", ShowPrevDay,   pdl, DayColor);
   DrawLevel("PWH", ShowPrevWeek,  pwh, WeekColor);
   DrawLevel("PWL", ShowPrevWeek,  pwl, WeekColor);
   DrawLevel("PMH", ShowPrevMonth, pmh, MonthColor);
   DrawLevel("PML", ShowPrevMonth, pml, MonthColor);
   DrawLevel("PYH", ShowPrevYear,  pyh, YearColor);
   DrawLevel("PYL", ShowPrevYear,  pyl, YearColor);

   ChartRedraw(0);
   return(rates_total);
}
