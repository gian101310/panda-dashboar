//+------------------------------------------------------------------+
//| Panda Levels MT5 - standalone, display-only chart indicator      |
//| Box windows follow Panda Levels V2 (cTrader) H1 period ranges.   |
//+------------------------------------------------------------------+
#property copyright "Panda Engine"
#property version   "1.00"
#property indicator_chart_window
#property indicator_plots 0

input bool InpShowBoxes = true;                 // Show day/week/month boxes
input bool InpFillBoxes = true;                 // Shade boxes
input int  InpBoxFillOpacity = 20;             // Box shade strength, 0-100
input bool InpShowPreviousLevels = true;       // PD/PW/PM/PY high and low
input bool InpShowLevelLabels = true;          // Show level names and prices

struct PandaPeriod
{
   int key;
   datetime start;
   double high;
   double low;
};

string g_prefix;
datetime g_last_h1 = 0;
datetime g_last_chart_bar = 0;

int OnInit()
{
   g_prefix = "PandaLevelsMT5." + IntegerToString((long)ChartID()) + ".";
   IndicatorSetString(INDICATOR_SHORTNAME, "Panda Levels MT5");
   EventSetTimer(15);
   DrawLevels();
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   ObjectsDeleteAll(0, g_prefix);
   ChartRedraw(0);
}

int OnCalculate(const int rates_total, const int prev_calculated,
                const datetime &time[], const double &open[],
                const double &high[], const double &low[],
                const double &close[], const long &tick_volume[],
                const long &volume[], const int &spread[])
{
   datetime h1 = iTime(_Symbol, PERIOD_H1, 0);
   datetime chart_bar = iTime(_Symbol, _Period, 0);
   if(h1 != g_last_h1 || chart_bar != g_last_chart_bar)
   {
      g_last_h1 = h1;
      g_last_chart_bar = chart_bar;
      DrawLevels();
   }
   return rates_total;
}

void OnTimer()
{
   datetime h1 = iTime(_Symbol, PERIOD_H1, 0);
   datetime chart_bar = iTime(_Symbol, _Period, 0);
   if(h1 != g_last_h1 || chart_bar != g_last_chart_bar)
   {
      g_last_h1 = h1;
      g_last_chart_bar = chart_bar;
      DrawLevels();
   }
}

int PeriodKey(const datetime bar_time, const int kind)
{
   MqlDateTime p;
   TimeToStruct(bar_time, p);
   if(kind == 0) return p.year * 10000 + p.mon * 100 + p.day;
   if(kind == 2) return p.year * 12 + p.mon;
   // Monday is the first day of the week, matching Panda Levels V2.
   datetime midnight = bar_time - p.hour * 3600 - p.min * 60 - p.sec;
   datetime monday = midnight - ((p.day_of_week + 6) % 7) * 86400;
   MqlDateTime w;
   TimeToStruct(monday, w);
   return w.year * 10000 + w.mon * 100 + w.day;
}

void AppendPeriod(PandaPeriod &periods[], int &count, const int key,
                  const datetime start, const double high, const double low)
{
   if(count == 0 || periods[count - 1].key != key)
   {
      int next = ArrayResize(periods, count + 1);
      if(next != count + 1) return;
      periods[count].key = key;
      periods[count].start = start;
      periods[count].high = high;
      periods[count].low = low;
      count++;
   }
   else
   {
      periods[count - 1].high = MathMax(periods[count - 1].high, high);
      periods[count - 1].low = MathMin(periods[count - 1].low, low);
   }
}

color Shade(const color line_color)
{
   int opacity = MathMax(0, MathMin(100, InpBoxFillOpacity));
   color background = (color)ChartGetInteger(0, CHART_COLOR_BACKGROUND);
   int fg = (int)line_color;
   int bg = (int)background;
   int red   = (fg & 255) * opacity / 100 + (bg & 255) * (100 - opacity) / 100;
   int green = ((fg >> 8) & 255) * opacity / 100 + ((bg >> 8) & 255) * (100 - opacity) / 100;
   int blue  = ((fg >> 16) & 255) * opacity / 100 + ((bg >> 16) & 255) * (100 - opacity) / 100;
   return (color)(red | (green << 8) | (blue << 16));
}

void SetRectangle(const string suffix, const datetime left, const double top,
                  const datetime right, const double bottom, const color line_color)
{
   string fill = g_prefix + suffix + ".fill";
   string border = g_prefix + suffix + ".border";
   if(left <= 0 || right <= left || top <= bottom)
   {
      ObjectDelete(0, fill);
      ObjectDelete(0, border);
      return;
   }
   if(InpFillBoxes && InpBoxFillOpacity > 0)
   {
      if(ObjectFind(0, fill) < 0) ObjectCreate(0, fill, OBJ_RECTANGLE, 0, left, top, right, bottom);
      ObjectMove(0, fill, 0, left, top);
      ObjectMove(0, fill, 1, right, bottom);
      ObjectSetInteger(0, fill, OBJPROP_COLOR, Shade(line_color));
      ObjectSetInteger(0, fill, OBJPROP_FILL, true);
      ObjectSetInteger(0, fill, OBJPROP_BACK, true);
      ObjectSetInteger(0, fill, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, fill, OBJPROP_HIDDEN, true);
   }
   else ObjectDelete(0, fill);
   if(ObjectFind(0, border) < 0) ObjectCreate(0, border, OBJ_RECTANGLE, 0, left, top, right, bottom);
   ObjectMove(0, border, 0, left, top);
   ObjectMove(0, border, 1, right, bottom);
   ObjectSetInteger(0, border, OBJPROP_COLOR, line_color);
   ObjectSetInteger(0, border, OBJPROP_FILL, false);
   ObjectSetInteger(0, border, OBJPROP_BACK, true);
   ObjectSetInteger(0, border, OBJPROP_WIDTH, 1);
   ObjectSetInteger(0, border, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, border, OBJPROP_HIDDEN, true);
}

void SetLevel(const string label, const double price, const color line_color)
{
   string line = g_prefix + label + ".line";
   string text = g_prefix + label + ".text";
   if(price <= 0)
   {
      ObjectDelete(0, line);
      ObjectDelete(0, text);
      return;
   }
   if(ObjectFind(0, line) < 0) ObjectCreate(0, line, OBJ_HLINE, 0, 0, price);
   ObjectSetDouble(0, line, OBJPROP_PRICE, price);
   ObjectSetInteger(0, line, OBJPROP_COLOR, line_color);
   ObjectSetInteger(0, line, OBJPROP_STYLE, STYLE_DOT);
   ObjectSetInteger(0, line, OBJPROP_WIDTH, 1);
   ObjectSetInteger(0, line, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, line, OBJPROP_HIDDEN, true);
   if(InpShowLevelLabels)
   {
      datetime at = iTime(_Symbol, _Period, 0);
      if(at <= 0) at = TimeCurrent();
      if(ObjectFind(0, text) < 0) ObjectCreate(0, text, OBJ_TEXT, 0, at, price);
      ObjectMove(0, text, 0, at, price);
      ObjectSetString(0, text, OBJPROP_TEXT, label + "  " + DoubleToString(price, _Digits));
      ObjectSetInteger(0, text, OBJPROP_COLOR, line_color);
      ObjectSetInteger(0, text, OBJPROP_FONTSIZE, 8);
      ObjectSetInteger(0, text, OBJPROP_ANCHOR, ANCHOR_LEFT_LOWER);
      ObjectSetInteger(0, text, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, text, OBJPROP_HIDDEN, true);
   }
   else ObjectDelete(0, text);
}

void DrawLevels()
{
   MqlRates hourly[];
   // Four complete months are sufficient for all three box windows.
   int copied = CopyRates(_Symbol, PERIOD_H1, 0, 24 * 155, hourly);
   if(copied < 96)
   {
      g_last_h1 = 0; // Retry after MT5 finishes loading H1 history.
      return;
   }
   PandaPeriod days[], weeks[], months[];
   int dc = 0, wc = 0, mc = 0;
   for(int i = 0; i < copied; i++)
   {
      AppendPeriod(days, dc, PeriodKey(hourly[i].time, 0), hourly[i].time, hourly[i].high, hourly[i].low);
      AppendPeriod(weeks, wc, PeriodKey(hourly[i].time, 1), hourly[i].time, hourly[i].high, hourly[i].low);
      AppendPeriod(months, mc, PeriodKey(hourly[i].time, 2), hourly[i].time, hourly[i].high, hourly[i].low);
   }
   if(dc < 4 || wc < 4 || mc < 4) g_last_h1 = 0;
   if(InpShowBoxes && dc >= 4 && wc >= 4 && mc >= 4)
   {
      SetRectangle("box.day", days[dc-4].start, MathMax(days[dc-3].high, days[dc-4].high),
                   days[dc-2].start, MathMin(days[dc-3].low, days[dc-4].low), clrOrange);
      SetRectangle("box.week", weeks[wc-4].start, MathMax(weeks[wc-3].high, weeks[wc-4].high),
                   weeks[wc-2].start, MathMin(weeks[wc-3].low, weeks[wc-4].low), clrMediumSeaGreen);
      SetRectangle("box.month", months[mc-4].start, MathMax(months[mc-3].high, months[mc-4].high),
                   months[mc-2].start, MathMin(months[mc-3].low, months[mc-4].low), clrRoyalBlue);
   }
   else
   {
      ObjectDelete(0, g_prefix + "box.day.fill"); ObjectDelete(0, g_prefix + "box.day.border");
      ObjectDelete(0, g_prefix + "box.week.fill"); ObjectDelete(0, g_prefix + "box.week.border");
      ObjectDelete(0, g_prefix + "box.month.fill"); ObjectDelete(0, g_prefix + "box.month.border");
   }
   if(InpShowPreviousLevels)
   {
      SetLevel("PDH", dc >= 2 ? days[dc-2].high : 0, clrOrange);
      SetLevel("PDL", dc >= 2 ? days[dc-2].low : 0, clrOrange);
      SetLevel("PWH", wc >= 2 ? weeks[wc-2].high : 0, clrDodgerBlue);
      SetLevel("PWL", wc >= 2 ? weeks[wc-2].low : 0, clrDodgerBlue);
      SetLevel("PMH", mc >= 2 ? months[mc-2].high : 0, clrDarkViolet);
      SetLevel("PML", mc >= 2 ? months[mc-2].low : 0, clrDarkViolet);
      MqlDateTime now;
      TimeToStruct(TimeCurrent(), now);
      MqlRates monthly[];
      int n = CopyRates(_Symbol, PERIOD_MN1, 0, 25, monthly);
      double yh = 0, yl = DBL_MAX;
      for(int i = 0; i < n; i++)
      {
         MqlDateTime m;
         TimeToStruct(monthly[i].time, m);
         if(m.year == now.year - 1)
         {
            yh = MathMax(yh, monthly[i].high);
            yl = MathMin(yl, monthly[i].low);
         }
      }
      SetLevel("PYH", yl < DBL_MAX ? yh : 0, clrCrimson);
      SetLevel("PYL", yl < DBL_MAX ? yl : 0, clrCrimson);
   }
   else
   {
      string labels[] = {"PDH","PDL","PWH","PWL","PMH","PML","PYH","PYL"};
      for(int i = 0; i < ArraySize(labels); i++) SetLevel(labels[i], 0, clrNONE);
   }
   ChartRedraw(0);
}
