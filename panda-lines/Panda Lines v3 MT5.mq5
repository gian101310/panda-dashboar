//+------------------------------------------------------------------+
//| Panda Lines v3 MT5.mq5                                           |
//| SuperTrend + BB TrendLine + S/R Zones + SCORING PANEL            |
//| Ported from MQL4 — identical logic                                |
//+------------------------------------------------------------------+
#property indicator_chart_window
#property indicator_buffers 8
#property indicator_plots   4

#property indicator_label1  "ST Bullish"
#property indicator_type1   DRAW_LINE
#property indicator_color1  clrLime
#property indicator_width1  2

#property indicator_label2  "ST Bearish"
#property indicator_type2   DRAW_LINE
#property indicator_color2  clrRed
#property indicator_width2  2

#property indicator_label3  "BB Trend Bullish"
#property indicator_type3   DRAW_LINE
#property indicator_color3  clrDodgerBlue
#property indicator_width3  2

#property indicator_label4  "BB Trend Bearish"
#property indicator_type4   DRAW_LINE
#property indicator_color4  clrRed
#property indicator_width4  2

input int      ST_Period       = 10;
input double   ST_Multiplier   = 3.0;
input bool     ST_UseATR       = true;
input bool     ST_ShowSignals  = true;

input int      BB_Period       = 21;
input double   BB_Deviations   = 1.0;
input bool     BB_UseATR       = true;
input int      BB_ATRPeriod    = 5;
input bool     BB_HideLabels   = false;

input bool     SR_Show         = true;
input bool     SR_Daily        = true;
input bool     SR_Weekly       = true;
input bool     SR_Monthly      = true;
input bool     SR_Yearly       = true;
input double   SR_ZoneWidth    = 0.15;
input int      SR_ExtendLeft   = 200;
input color    SR_DailyColor   = clrOrange;
input color    SR_WeeklyColor  = clrDodgerBlue;
input color    SR_MonthlyColor = clrDarkViolet;
input color    SR_YearlyColor  = clrCrimson;

input bool     AL_SuperTrend   = true;
input bool     AL_BB           = true;

// ===== SCORING PANEL INPUTS =====
input bool     Panel_Show      = true;
input int      Panel_X         = 20;
input int      Panel_Y         = 30;
input int      Panel_Width     = 220;
input color    Panel_BgColor   = C'20,20,30';
input color    Panel_BuyColor  = C'0,255,159';
input color    Panel_SellColor = C'255,77,109';
input color    Panel_WaitColor = C'128,128,128';
input color    Panel_TextColor = C'200,200,220';
input int      Panel_FontSize  = 10;
input int      Panel_Refresh   = 5;     // seconds between file reads

// Plot buffers (visible)
double STBullish[];
double STBearish[];
double BBTrendBull[];
double BBTrendBear[];

// Internal calc buffers (hidden)
double UpBand[];
double DnBand[];
double TrendDir[];
double BBTrendLine[];

// Extra internal array (not a buffer)
double BBITrend[];

datetime LastAlertTime = 0;
string ObjPrefix = "PandaLinesV3_";
string PanelPrefix = "PandaPanel_";

// Panel score data
int    ScoreGap        = 0;
string ScoreBias       = "WAIT";
string ScoreConfidence = "INVALID";
string ScoreExecution  = "NONE";
string ScoreMomentum   = "NEUTRAL";
double ScoreStrength   = 0;
int    ScoreInvalid    = 0;
string ScorePLZone     = "--";
int    ScorePLG1       = 0;
string ScoreBoxH1      = "--";
string ScoreBoxH4      = "--";
int    ScoreConfluence = 0;
datetime LastFileRead  = 0;

// Drag state
bool   PanelDragging   = false;
int    DragOffsetX     = 0;
int    DragOffsetY     = 0;
int    PanelPosX;
int    PanelPosY;
bool   PanelHidden     = false;

//+------------------------------------------------------------------+
int OnInit()
{
   IndicatorSetString(INDICATOR_SHORTNAME, "Panda Lines v3 MT5");

   // Plot buffers 0-3
   SetIndexBuffer(0, STBullish,    INDICATOR_DATA);
   SetIndexBuffer(1, STBearish,    INDICATOR_DATA);
   SetIndexBuffer(2, BBTrendBull,  INDICATOR_DATA);
   SetIndexBuffer(3, BBTrendBear,  INDICATOR_DATA);

   // Internal calc buffers 4-7
   SetIndexBuffer(4, UpBand,       INDICATOR_CALCULATIONS);
   SetIndexBuffer(5, DnBand,       INDICATOR_CALCULATIONS);
   SetIndexBuffer(6, TrendDir,     INDICATOR_CALCULATIONS);
   SetIndexBuffer(7, BBTrendLine,  INDICATOR_CALCULATIONS);

   PlotIndexSetDouble(0, PLOT_EMPTY_VALUE, EMPTY_VALUE);
   PlotIndexSetDouble(1, PLOT_EMPTY_VALUE, EMPTY_VALUE);
   PlotIndexSetDouble(2, PLOT_EMPTY_VALUE, EMPTY_VALUE);
   PlotIndexSetDouble(3, PLOT_EMPTY_VALUE, EMPTY_VALUE);

   PanelPosX = Panel_X;
   PanelPosY = Panel_Y;

   if(Panel_Show)
   {
      ReadScoreFile();
      DrawPanel();
      EventSetTimer(Panel_Refresh);
   }

   ChartSetInteger(0, CHART_EVENT_MOUSE_MOVE, true);

   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   RemoveObjectsByPrefix(ObjPrefix);
   RemoveObjectsByPrefix(PanelPrefix);
   EventKillTimer();
}

//+------------------------------------------------------------------+
void OnTimer()
{
   if(Panel_Show && !PanelHidden)
   {
      ReadScoreFile();
      DrawPanel();
   }
}

// ===== CHART EVENT — DRAG + HIDE =====
void OnChartEvent(const int id,
                  const long &lparam,
                  const double &dparam,
                  const string &sparam)
{
   if(!Panel_Show) return;

   if(id == CHARTEVENT_OBJECT_CLICK)
   {
      if(sparam == PanelPrefix + "toggle")
      {
         PanelHidden = !PanelHidden;
         if(PanelHidden)
            HidePanel();
         else
            DrawPanel();
         return;
      }
   }

   if(PanelHidden) return;

   if(id == CHARTEVENT_MOUSE_MOVE)
   {
      int mx = (int)lparam;
      int my = (int)dparam;
      int state = (int)StringToInteger(sparam);

      if(PanelDragging)
      {
         if((state & 1) == 1)
         {
            PanelPosX = mx - DragOffsetX;
            PanelPosY = my - DragOffsetY;
            if(PanelPosX < 0) PanelPosX = 0;
            if(PanelPosY < 0) PanelPosY = 0;
            DrawPanel();
            ChartRedraw();
         }
         else
         {
            PanelDragging = false;
            ChartSetInteger(0, CHART_EVENT_MOUSE_MOVE, true);
         }
      }
      else if((state & 1) == 1)
      {
         if(mx >= PanelPosX && mx <= PanelPosX + Panel_Width &&
            my >= PanelPosY && my <= PanelPosY + 24)
         {
            PanelDragging = true;
            DragOffsetX = mx - PanelPosX;
            DragOffsetY = my - PanelPosY;
         }
      }
   }
}

// ===== FILE READER =====
void ReadScoreFile()
{
   string sym = _Symbol;
   string clean = sym;
   if(StringLen(clean) > 6)
   {
      if(StringSubstr(clean, StringLen(clean)-2) == ".i")
         clean = StringSubstr(clean, 0, StringLen(clean)-2);
      else if(StringSubstr(clean, StringLen(clean)-1) == "m")
         clean = StringSubstr(clean, 0, StringLen(clean)-1);
      else if(StringLen(clean) > 6)
         clean = StringSubstr(clean, 0, 6);
   }

   string filename = "panda_score_" + clean + ".txt";
   int handle = FileOpen(filename, FILE_READ|FILE_TXT|FILE_COMMON|FILE_ANSI);
   if(handle == INVALID_HANDLE)
   {
      ScoreBias = "NO DATA";
      ScoreGap = 0;
      ScoreConfidence = "--";
      ScoreExecution = "--";
      ScoreMomentum = "--";
      ScoreStrength = 0;
      ScoreInvalid = 0;
      ScorePLZone = "--";
      ScorePLG1 = 0;
      ScoreBoxH1 = "--";
      ScoreBoxH4 = "--";
      ScoreConfluence = 0;
      return;
   }

   while(!FileIsEnding(handle))
   {
      string line = FileReadString(handle);
      if(StringLen(line) == 0) continue;

      int sep = StringFind(line, ":");
      if(sep < 0) continue;

      string key = StringSubstr(line, 0, sep);
      string val = StringSubstr(line, sep + 1);

      if(key == "GAP")             ScoreGap        = (int)StringToInteger(val);
      else if(key == "BIAS")       ScoreBias       = val;
      else if(key == "CONFIDENCE") ScoreConfidence = val;
      else if(key == "EXECUTION")  ScoreExecution  = val;
      else if(key == "MOMENTUM")   ScoreMomentum   = val;
      else if(key == "STRENGTH")   ScoreStrength   = StringToDouble(val);
      else if(key == "HARD_INVALID") ScoreInvalid  = (int)StringToInteger(val);
      else if(key == "PL_ZONE")    ScorePLZone     = val;
      else if(key == "PL_G1")      ScorePLG1       = (int)StringToInteger(val);
      else if(key == "BOX_H1")     ScoreBoxH1      = val;
      else if(key == "BOX_H4")     ScoreBoxH4      = val;
      else if(key == "CONFLUENCE") ScoreConfluence = (int)StringToInteger(val);
   }
   FileClose(handle);
   LastFileRead = TimeCurrent();
}

// ===== PANEL DRAWING =====
void DrawPanel()
{
   RemoveObjectsByPrefix(PanelPrefix);

   int x = PanelPosX;
   int y = PanelPosY;
   int w = Panel_Width;
   int lineH = 20;
   int sectGap = 6;
   int h = 26 + lineH + sectGap + lineH + lineH + sectGap + lineH + lineH + sectGap + lineH*3 + 24;

   CreateRect(PanelPrefix + "bg", x, y, w, h, Panel_BgColor);
   CreateRect(PanelPrefix + "header", x, y, w, 26, C'30,30,50');
   CreateLbl(PanelPrefix + "title", x + 8, y + 5, "Panda Panel Pr0 v3", C'0,180,255', 10, "Arial Bold");

   CreateLbl(PanelPrefix + "toggle", x + w - 20, y + 5, "x", C'180,180,180', 10, "Arial Bold");
   ObjectSetInteger(0, PanelPrefix + "toggle", OBJPROP_SELECTABLE, false);

   int cy = y + 30;
   int labelX = x + 10;
   int valueX = x + 100;

   // ---- PAIR NAME ----
   string pairName = _Symbol;
   if(StringLen(pairName) > 6)
   {
      if(StringSubstr(pairName, StringLen(pairName)-2) == ".i")
         pairName = StringSubstr(pairName, 0, StringLen(pairName)-2);
      else if(StringSubstr(pairName, StringLen(pairName)-1) == "m")
         pairName = StringSubstr(pairName, 0, StringLen(pairName)-1);
      else if(StringLen(pairName) > 6)
         pairName = StringSubstr(pairName, 0, 6);
   }
   CreateLbl(PanelPrefix + "pair", x + (w/2) - 25, cy, pairName, clrWhite, 13, "Arial Bold");
   cy += lineH + 2;

   CreateRect(PanelPrefix + "sep1", x + 8, cy, w - 16, 1, C'50,50,70');
   cy += sectGap;

   // ---- GAP + BIAS ROW ----
   color biasClr = Panel_WaitColor;
   if(ScoreBias == "BUY")              biasClr = Panel_BuyColor;
   else if(ScoreBias == "SELL")        biasClr = Panel_SellColor;
   else if(ScoreBias == "HARD_INVALID") biasClr = C'255,100,100';

   string gapStr = IntegerToString(ScoreGap);
   if(ScoreGap > 0) gapStr = "+" + gapStr;
   color gapClr = Panel_WaitColor;
   if(MathAbs(ScoreGap) >= 9)      gapClr = biasClr;
   else if(MathAbs(ScoreGap) >= 5) gapClr = C'255,215,102';

   CreateLbl(PanelPrefix + "lbl_gap", labelX, cy, "GAP", C'120,120,150', 8, "Arial");
   CreateLbl(PanelPrefix + "val_gap", labelX + 32, cy - 2, gapStr, gapClr, 16, "Arial Bold");
   CreateLbl(PanelPrefix + "val_bias", x + w - 10, cy, ScoreBias, biasClr, 13, "Arial Bold");
   ObjectSetInteger(0, PanelPrefix + "val_bias", OBJPROP_ANCHOR, ANCHOR_RIGHT_UPPER);
   cy += lineH + 2;

   // ---- CONFLUENCE ----
   color confClr = Panel_WaitColor;
   string confLabel = "WEAK";
   if(ScoreConfluence >= 90)      { confLabel = "ELITE"; confClr = Panel_BuyColor; }
   else if(ScoreConfluence >= 75) { confLabel = "HIGH";  confClr = C'0,180,255'; }
   else if(ScoreConfluence >= 60) { confLabel = "MOD";   confClr = C'255,215,102'; }
   else if(ScoreConfluence >= 40) { confLabel = "LOW";   confClr = C'255,170,68'; }
   else                           { confLabel = "WEAK";  confClr = Panel_WaitColor; }

   CreateLbl(PanelPrefix + "lbl_conf", labelX, cy, "CONF", C'120,120,150', 8, "Arial");
   CreateLbl(PanelPrefix + "val_conf_num", labelX + 38, cy, IntegerToString(ScoreConfluence), confClr, Panel_FontSize + 1, "Arial Bold");
   CreateLbl(PanelPrefix + "val_conf_lbl", labelX + 66, cy, confLabel, confClr, Panel_FontSize, "Arial Bold");
   cy += lineH;

   CreateRect(PanelPrefix + "sep2", x + 8, cy, w - 16, 1, C'50,50,70');
   cy += sectGap;

   // ---- PL BADGE ----
   CreateLbl(PanelPrefix + "lbl_pl", labelX, cy, "PL ZONE", C'120,120,150', 8, "Arial");
   string plText = ScorePLZone;
   color plClr = Panel_WaitColor;
   if(ScorePLZone == "ABOVE")      plClr = Panel_BuyColor;
   else if(ScorePLZone == "BELOW") plClr = Panel_SellColor;
   else if(ScorePLZone == "BETWEEN") plClr = C'255,170,68';

   string g1Tag = "";
   color g1Clr = Panel_WaitColor;
   if(ScorePLZone != "--" && ScorePLZone != "")
   {
      if(ScorePLG1 == 1) { g1Tag = " [OK]"; g1Clr = Panel_BuyColor; }
      else               { g1Tag = " [X]";  g1Clr = C'255,100,100'; }
   }
   CreateLbl(PanelPrefix + "val_pl", valueX, cy, plText, plClr, Panel_FontSize, "Arial Bold");
   CreateLbl(PanelPrefix + "val_g1", valueX + 70, cy, g1Tag, g1Clr, Panel_FontSize, "Arial Bold");
   cy += lineH;

   // ---- BOX BADGES ----
   CreateLbl(PanelPrefix + "lbl_box", labelX, cy, "BOX", C'120,120,150', 8, "Arial");

   color h1Clr = Panel_WaitColor;
   string h1Short = ScoreBoxH1;
   if(ScoreBoxH1 == "UPTREND")        { h1Clr = Panel_BuyColor;  h1Short = "UP"; }
   else if(ScoreBoxH1 == "DOWNTREND") { h1Clr = Panel_SellColor; h1Short = "DN"; }
   else if(ScoreBoxH1 == "RANGING")   { h1Clr = C'255,215,102';  h1Short = "RNG"; }

   color h4Clr = Panel_WaitColor;
   string h4Short = ScoreBoxH4;
   if(ScoreBoxH4 == "UPTREND")        { h4Clr = Panel_BuyColor;  h4Short = "UP"; }
   else if(ScoreBoxH4 == "DOWNTREND") { h4Clr = Panel_SellColor; h4Short = "DN"; }
   else if(ScoreBoxH4 == "RANGING")   { h4Clr = C'255,215,102';  h4Short = "RNG"; }

   CreateLbl(PanelPrefix + "val_h1lbl", valueX, cy, "H1:", C'150,150,170', 9, "Arial");
   CreateLbl(PanelPrefix + "val_h1", valueX + 22, cy, h1Short, h1Clr, 9, "Arial Bold");
   CreateLbl(PanelPrefix + "val_h4lbl", valueX + 58, cy, "H4:", C'150,150,170', 9, "Arial");
   CreateLbl(PanelPrefix + "val_h4", valueX + 80, cy, h4Short, h4Clr, 9, "Arial Bold");
   cy += lineH;

   CreateRect(PanelPrefix + "sep3", x + 8, cy, w - 16, 1, C'50,50,70');
   cy += sectGap;

   // ---- EXECUTION ----
   color execClr = Panel_WaitColor;
   if(ScoreExecution == "MARKET")       execClr = Panel_BuyColor;
   else if(ScoreExecution == "PULLBACK") execClr = C'255,215,102';

   CreateLbl(PanelPrefix + "lbl_exec", labelX, cy, "EXECUTION", C'120,120,150', 8, "Arial");
   CreateLbl(PanelPrefix + "val_exec", valueX, cy, ScoreExecution, execClr, Panel_FontSize, "Arial");
   cy += lineH;

   // ---- MOMENTUM ----
   color momClr = Panel_WaitColor;
   if(ScoreMomentum == "STRONG" || ScoreMomentum == "BUILDING") momClr = Panel_BuyColor;
   else if(ScoreMomentum == "SPARK")     momClr = C'255,215,102';
   else if(ScoreMomentum == "COOLING" || ScoreMomentum == "FADING") momClr = C'255,170,68';
   else if(ScoreMomentum == "REVERSING") momClr = Panel_SellColor;

   CreateLbl(PanelPrefix + "lbl_mom", labelX, cy, "MOMENTUM", C'120,120,150', 8, "Arial");
   CreateLbl(PanelPrefix + "val_mom", valueX, cy, ScoreMomentum, momClr, Panel_FontSize, "Arial");
   cy += lineH;

   // ---- STRENGTH ----
   color strClr = Panel_WaitColor;
   if(ScoreStrength >= 3)      strClr = Panel_BuyColor;
   else if(ScoreStrength >= 2) strClr = C'102,255,204';
   else if(ScoreStrength >= 1) strClr = C'255,215,102';

   CreateLbl(PanelPrefix + "lbl_str", labelX, cy, "STRENGTH", C'120,120,150', 8, "Arial");
   CreateLbl(PanelPrefix + "val_str", valueX, cy, DoubleToString(ScoreStrength, 1), strClr, Panel_FontSize, "Arial");
   cy += lineH;

   // ---- FRESHNESS ----
   if(LastFileRead > 0)
   {
      int age = (int)(TimeCurrent() - LastFileRead);
      string freshStr = (age < 120) ? "LIVE" : IntegerToString(age/60) + "m ago";
      color freshClr = (age < 120) ? C'0,180,255' : C'180,100,100';
      CreateLbl(PanelPrefix + "fresh", x + w - 12, cy, freshStr, freshClr, 7, "Arial");
      ObjectSetInteger(0, PanelPrefix + "fresh", OBJPROP_ANCHOR, ANCHOR_RIGHT_UPPER);
   }

   ChartRedraw();
}

void HidePanel()
{
   RemoveObjectsByPrefix(PanelPrefix);

   int x = PanelPosX;
   int y = PanelPosY;

   CreateRect(PanelPrefix + "mini_bg", x, y, 120, 24, Panel_BgColor);
   CreateLbl(PanelPrefix + "mini_label", x + 8, y + 5, "PANDA Pr0", C'0,180,255', 9, "Arial Bold");
   CreateLbl(PanelPrefix + "toggle", x + 102, y + 5, "+", C'180,180,180', 10, "Arial Bold");
   ObjectSetInteger(0, PanelPrefix + "toggle", OBJPROP_SELECTABLE, false);

   ChartRedraw();
}

// ===== PANEL HELPER OBJECTS =====
void CreateRect(const string name, int xp, int yp, int w, int h, color clr)
{
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, xp);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, yp);
   ObjectSetInteger(0, name, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, name, OBJPROP_YSIZE, h);
   ObjectSetInteger(0, name, OBJPROP_BGCOLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_BACK, false);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
}

void CreateLbl(const string name, int xp, int yp, string text, color clr, int fontSize, string font)
{
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, xp);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, yp);
   ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetString(0, name, OBJPROP_FONT, font);
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, fontSize);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_BACK, false);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
}

// ===== MAIN CALCULATION =====
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
   int min_required = MathMax(MathMax(ST_Period, BB_Period), BB_ATRPeriod) + 3;
   if(rates_total <= min_required)
      return(0);

   // MT5 buffers default to as-series=false. Set all to as-series for MT4-style indexing.
   ArraySetAsSeries(STBullish, true);
   ArraySetAsSeries(STBearish, true);
   ArraySetAsSeries(BBTrendBull, true);
   ArraySetAsSeries(BBTrendBear, true);
   ArraySetAsSeries(UpBand, true);
   ArraySetAsSeries(DnBand, true);
   ArraySetAsSeries(TrendDir, true);
   ArraySetAsSeries(BBTrendLine, true);

   ArraySetAsSeries(time, true);
   ArraySetAsSeries(open, true);
   ArraySetAsSeries(high, true);
   ArraySetAsSeries(low, true);
   ArraySetAsSeries(close, true);

   // BBITrend is not a buffer — manage manually
   ArrayResize(BBITrend, rates_total);
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
      CheckAlerts(time);
      LastAlertTime = time[0];
   }

   return(rates_total);
}

// ===== SUPERTREND =====
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
         DrawArrow(ObjPrefix + "buy_" + IntegerToString((int)time[i]), time[i], st_value - offset, clrLime, 233);
      if(TrendDir[i] == -1.0 && TrendDir[i + 1] == 1.0)
         DrawArrow(ObjPrefix + "sell_" + IntegerToString((int)time[i]), time[i], st_value + offset, clrRed, 234);
   }
}

// ===== BB TREND =====
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
         DrawArrow(ObjPrefix + "bbBuy_" + IntegerToString((int)time[i]), time[i], cur_tl - label_offset, clrDodgerBlue, 117);
      if(BBITrend[i] == -1.0 && BBITrend[i + 1] == 1.0)
         DrawArrow(ObjPrefix + "bbSell_" + IntegerToString((int)time[i]), time[i], cur_tl + label_offset, clrRed, 117);
   }
}

// ===== MATH HELPERS =====
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
   return(value != EMPTY_VALUE && value == value);
}

// ===== DRAWING HELPERS =====
void DrawArrow(const string name, const datetime t, const double price, const color clr, const int code)
{
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_ARROW, 0, t, price);
   ObjectSetInteger(0, name, OBJPROP_ARROWCODE, code);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, 1);
   ObjectSetDouble(0, name, OBJPROP_PRICE, price);
   ObjectSetInteger(0, name, OBJPROP_TIME, t);
}

// ===== S/R ZONES =====
void DrawAllSRZones(const datetime &time[], const int rates_total)
{
   RemoveObjectsByPrefix(ObjPrefix + "SR_");

   int leftIdx = MathMin(rates_total - 1, SR_ExtendLeft);
   datetime time_left  = time[leftIdx];
   datetime time_right = time[0] + PeriodSeconds() * 50;

   if(SR_Daily)
   {
      double hBuf[], lBuf[];
      if(CopyHigh(_Symbol, PERIOD_D1, 1, 1, hBuf) > 0 &&
         CopyLow(_Symbol, PERIOD_D1, 1, 1, lBuf) > 0)
      {
         if(hBuf[0] > 0 && lBuf[0] > 0)
         {
            DrawZone("PDH", hBuf[0], SR_DailyColor, time_left, time_right, 1);
            DrawZone("PDL", lBuf[0], SR_DailyColor, time_left, time_right, 1);
         }
      }
   }

   if(SR_Weekly)
   {
      double hBuf[], lBuf[];
      if(CopyHigh(_Symbol, PERIOD_W1, 1, 1, hBuf) > 0 &&
         CopyLow(_Symbol, PERIOD_W1, 1, 1, lBuf) > 0)
      {
         if(hBuf[0] > 0 && lBuf[0] > 0)
         {
            DrawZone("PWH", hBuf[0], SR_WeeklyColor, time_left, time_right, 1);
            DrawZone("PWL", lBuf[0], SR_WeeklyColor, time_left, time_right, 1);
         }
      }
   }

   if(SR_Monthly)
   {
      double hBuf[], lBuf[];
      if(CopyHigh(_Symbol, PERIOD_MN1, 1, 1, hBuf) > 0 &&
         CopyLow(_Symbol, PERIOD_MN1, 1, 1, lBuf) > 0)
      {
         if(hBuf[0] > 0 && lBuf[0] > 0)
         {
            DrawZone("PMH", hBuf[0], SR_MonthlyColor, time_left, time_right, 1);
            DrawZone("PML", lBuf[0], SR_MonthlyColor, time_left, time_right, 1);
         }
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
   TimeCurrent(dt);
   int prev_year = dt.year - 1;

   int bars = Bars(_Symbol, PERIOD_MN1);
   double hBuf[], lBuf[];
   datetime tBuf[];

   int toCopy = MathMin(bars, 24); // max 2 years of monthly bars
   if(CopyHigh(_Symbol, PERIOD_MN1, 1, toCopy, hBuf) < 1) { year_high = 0; year_low = 0; return; }
   if(CopyLow(_Symbol, PERIOD_MN1, 1, toCopy, lBuf) < 1)  { year_high = 0; year_low = 0; return; }
   if(CopyTime(_Symbol, PERIOD_MN1, 1, toCopy, tBuf) < 1)  { year_high = 0; year_low = 0; return; }

   for(int k = 0; k < ArraySize(tBuf); k++)
   {
      MqlDateTime mdt;
      TimeToStruct(tBuf[k], mdt);
      if(mdt.year == prev_year)
      {
         year_high = MathMax(year_high, hBuf[k]);
         year_low  = MathMin(year_low,  lBuf[k]);
      }
   }

   if(year_low == DBL_MAX)
   {
      year_high = 0.0;
      year_low = 0.0;
   }
}

// ===== ALERTS =====
void CheckAlerts(const datetime &time[])
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

// ===== CLEANUP =====
void RemoveObjectsByPrefix(const string prefix)
{
   for(int i = ObjectsTotal(0, 0, -1) - 1; i >= 0; i--)
   {
      string name = ObjectName(0, i, 0, -1);
      if(StringFind(name, prefix) == 0)
         ObjectDelete(0, name);
   }
}
//+------------------------------------------------------------------+
