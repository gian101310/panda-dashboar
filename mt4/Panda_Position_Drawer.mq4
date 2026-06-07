//+------------------------------------------------------------------+
//|                                      Panda_Position_Drawer.mq4   |
//|   MT4 long/short position drawing tool for visual trade planning.|
//|   Drag Entry, Stop, or Target lines to update the risk/reward box.|
//+------------------------------------------------------------------+
#property copyright "Panda Engine"
#property version   "1.00"
#property strict
#property indicator_chart_window

enum PandaPositionSide
{
   PANDA_LONG  = 0,
   PANDA_SHORT = 1
};

input PandaPositionSide InpSide              = PANDA_LONG;       // Position side
input string            InpObjectPrefix      = "PandaPosition";  // Object prefix
input double            InpEntryPrice        = 0.0;              // Entry price (0 = market)
input double            InpStopLossPrice     = 0.0;              // Stop price (0 = pips)
input double            InpTakeProfitPrice   = 0.0;              // Target price (0 = RR)
input double            InpStopLossPips      = 50.0;             // Default stop size in pips
input double            InpRiskReward        = 2.0;              // Target RR when TP price is 0
input int               InpExtendBars        = 80;               // Box width in bars
input bool              InpShowInfoLabel     = true;             // Show RR/pips label
input color             InpEntryColor        = clrDodgerBlue;    // Entry line color
input color             InpStopColor         = clrTomato;        // Stop/risk color
input color             InpTargetColor       = clrLimeGreen;     // Target/reward color
input color             InpTextColor         = clrWhite;         // Info text color

string g_prefix;
string g_entryName;
string g_stopName;
string g_targetName;
string g_riskName;
string g_rewardName;
string g_labelName;

double g_entry;
double g_stop;
double g_target;

//+------------------------------------------------------------------+
int OnInit()
{
   string sideSuffix = (InpSide == PANDA_LONG ? "LONG" : "SHORT");
   g_prefix     = InpObjectPrefix + "_" + _Symbol + "_" + IntegerToString(_Period) + "_" + sideSuffix;
   g_entryName  = g_prefix + "_Entry";
   g_stopName   = g_prefix + "_Stop";
   g_targetName = g_prefix + "_Target";
   g_riskName   = g_prefix + "_RiskBox";
   g_rewardName = g_prefix + "_RewardBox";
   g_labelName  = g_prefix + "_Info";

   InitPrices();
   DrawPosition();
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   ObjectDelete(0, g_entryName);
   ObjectDelete(0, g_stopName);
   ObjectDelete(0, g_targetName);
   ObjectDelete(0, g_riskName);
   ObjectDelete(0, g_rewardName);
   ObjectDelete(0, g_labelName);
}

//+------------------------------------------------------------------+
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
   SyncLinePrices();
   DrawPosition();
   return(rates_total);
}

//+------------------------------------------------------------------+
void OnChartEvent(const int id,
                  const long &lparam,
                  const double &dparam,
                  const string &sparam)
{
   if(id != CHARTEVENT_OBJECT_DRAG && id != CHARTEVENT_OBJECT_CHANGE) return;
   if(sparam != g_entryName && sparam != g_stopName && sparam != g_targetName) return;

   SyncLinePrices();
   DrawPosition();
}

//+------------------------------------------------------------------+
void InitPrices()
{
   RefreshRates();

   double pip = PipSize();
   g_entry = NormalizeDouble((InpEntryPrice > 0.0 ? InpEntryPrice : Bid), _Digits);

   if(InpStopLossPrice > 0.0)
   {
      g_stop = NormalizeDouble(InpStopLossPrice, _Digits);
   }
   else if(InpSide == PANDA_LONG)
   {
      g_stop = NormalizeDouble(g_entry - InpStopLossPips * pip, _Digits);
   }
   else
   {
      g_stop = NormalizeDouble(g_entry + InpStopLossPips * pip, _Digits);
   }

   if(InpTakeProfitPrice > 0.0)
   {
      g_target = NormalizeDouble(InpTakeProfitPrice, _Digits);
   }
   else
   {
      RecalculateTargetFromRR();
   }
}

//+------------------------------------------------------------------+
double PipSize()
{
   if(_Digits == 3 || _Digits == 5) return(Point * 10.0);
   return(Point);
}

//+------------------------------------------------------------------+
void RecalculateTargetFromRR()
{
   double risk = MathAbs(g_entry - g_stop);
   double rr = MathMax(InpRiskReward, 0.1);

   if(InpSide == PANDA_LONG)
      g_target = NormalizeDouble(g_entry + risk * rr, _Digits);
   else
      g_target = NormalizeDouble(g_entry - risk * rr, _Digits);
}

//+------------------------------------------------------------------+
void SyncLinePrices()
{
   if(ObjectFind(0, g_entryName) >= 0)
      g_entry = NormalizeDouble(ObjectGetDouble(0, g_entryName, OBJPROP_PRICE1), _Digits);

   if(ObjectFind(0, g_stopName) >= 0)
      g_stop = NormalizeDouble(ObjectGetDouble(0, g_stopName, OBJPROP_PRICE1), _Digits);

   if(ObjectFind(0, g_targetName) >= 0)
      g_target = NormalizeDouble(ObjectGetDouble(0, g_targetName, OBJPROP_PRICE1), _Digits);
}

//+------------------------------------------------------------------+
void DrawPosition()
{
   datetime startTime = iTime(_Symbol, _Period, 0);
   if(startTime <= 0) startTime = TimeCurrent();

   datetime endTime = startTime + PeriodSecondsSafe() * MathMax(InpExtendBars, 5);

   DrawLine(g_entryName, g_entry, InpEntryColor, STYLE_SOLID, 2, "ENTRY");
   DrawLine(g_stopName, g_stop, InpStopColor, STYLE_SOLID, 2, "STOP");
   DrawLine(g_targetName, g_target, InpTargetColor, STYLE_SOLID, 2, "TARGET");

   DrawBox(g_riskName, startTime, g_entry, endTime, g_stop, InpStopColor);
   DrawBox(g_rewardName, startTime, g_entry, endTime, g_target, InpTargetColor);

   if(InpShowInfoLabel) DrawInfoLabel();

   ChartRedraw(0);
}

//+------------------------------------------------------------------+
int PeriodSecondsSafe()
{
   int seconds = PeriodSeconds(_Period);
   if(seconds <= 0) seconds = 60;
   return(seconds);
}

//+------------------------------------------------------------------+
void DrawLine(const string name,
              const double price,
              const color lineColor,
              const int lineStyle,
              const int lineWidth,
              const string description)
{
   if(ObjectFind(0, name) < 0)
   {
      ObjectCreate(0, name, OBJ_HLINE, 0, 0, price);
      ObjectSetInteger(0, name, OBJPROP_SELECTABLE, true);
      ObjectSetInteger(0, name, OBJPROP_SELECTED, false);
   }

   ObjectSetDouble(0, name, OBJPROP_PRICE1, price);
   ObjectSetInteger(0, name, OBJPROP_COLOR, lineColor);
   ObjectSetInteger(0, name, OBJPROP_STYLE, lineStyle);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, lineWidth);
   ObjectSetString(0, name, OBJPROP_TEXT, description + " " + DoubleToString(price, _Digits));
}

//+------------------------------------------------------------------+
void DrawBox(const string name,
             const datetime time1,
             const double price1,
             const datetime time2,
             const double price2,
             const color boxColor)
{
   if(ObjectFind(0, name) < 0)
   {
      ObjectCreate(0, name, OBJ_RECTANGLE, 0, time1, price1, time2, price2);
      ObjectSetInteger(0, name, OBJPROP_BACK, true);
      ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   }

   ObjectSetInteger(0, name, OBJPROP_TIME1, time1);
   ObjectSetDouble(0, name, OBJPROP_PRICE1, price1);
   ObjectSetInteger(0, name, OBJPROP_TIME2, time2);
   ObjectSetDouble(0, name, OBJPROP_PRICE2, price2);
   ObjectSetInteger(0, name, OBJPROP_COLOR, boxColor);
   ObjectSetInteger(0, name, OBJPROP_STYLE, STYLE_SOLID);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, 1);
}

//+------------------------------------------------------------------+
void DrawInfoLabel()
{
   double pip = PipSize();
   double riskPips = MathAbs(g_entry - g_stop) / pip;
   double rewardPips = MathAbs(g_target - g_entry) / pip;
   double rr = 0.0;
   if(riskPips > 0.0) rr = rewardPips / riskPips;

   string side = (InpSide == PANDA_LONG ? "LONG" : "SHORT");
   string text = side +
      " | Entry " + DoubleToString(g_entry, _Digits) +
      " | Stop " + DoubleToString(g_stop, _Digits) +
      " | Target " + DoubleToString(g_target, _Digits) +
      " | Risk " + DoubleToString(riskPips, 1) + " pips" +
      " | Reward " + DoubleToString(rewardPips, 1) + " pips" +
      " | RR 1:" + DoubleToString(rr, 2);

   if(ObjectFind(0, g_labelName) < 0)
   {
      ObjectCreate(0, g_labelName, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, g_labelName, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, g_labelName, OBJPROP_XDISTANCE, 12);
      ObjectSetInteger(0, g_labelName, OBJPROP_YDISTANCE, 24);
   }

   ObjectSetString(0, g_labelName, OBJPROP_TEXT, text);
   ObjectSetInteger(0, g_labelName, OBJPROP_COLOR, InpTextColor);
   ObjectSetInteger(0, g_labelName, OBJPROP_FONTSIZE, 10);
   ObjectSetString(0, g_labelName, OBJPROP_FONT, "Arial");
}
//+------------------------------------------------------------------+
