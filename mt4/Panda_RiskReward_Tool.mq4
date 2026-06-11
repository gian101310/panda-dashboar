//+------------------------------------------------------------------+
//|                                      Panda_RiskReward_Tool.mq4   |
//|   MT4 long/short position drawing tool for visual trade planning.|
//|   Drag Entry, Stop, Target, or resize boxes to update RR display.|
//+------------------------------------------------------------------+
#property copyright "Panda Engine"
#property version   "1.33"
#property strict
#property indicator_chart_window

enum PandaPositionSide
{
   PANDA_LONG  = 0,
   PANDA_SHORT = 1
};

input bool              InpEnabled           = true;                // Show position drawing
input PandaPositionSide InpDefaultSide       = PANDA_LONG;          // Initial side
input bool              InpShowButtons       = true;                // Show LONG/SHORT/OFF buttons
input bool              InpAllowBoxResize    = true;                // Allow resizing TP/SL boxes
input string            InpObjectPrefix      = "PandaPosition";     // Object prefix
input double            InpEntryPrice        = 0.0;                 // Entry price (0 = market)
input double            InpStopLossPrice     = 0.0;                 // Stop price (0 = pips)
input double            InpTakeProfitPrice   = 0.0;                 // Target price (0 = RR)
input double            InpStopLossPips      = 50.0;                // Default stop size in pips
input double            InpRiskReward        = 2.0;                 // Target RR when TP price is 0
input int               InpExtendBars        = 80;                  // Box width in bars
input bool              InpShowInfoLabel     = true;                // Show RR/pips label
input int               InpPanelX            = 12;                  // Panel X position
input int               InpPanelY            = 80;                  // Panel Y position
input color             InpEntryColor        = clrDodgerBlue;       // Entry line color
input color             InpStopColor         = clrTomato;           // Stop/risk color
input color             InpTargetColor       = clrLimeGreen;        // Target/reward color
input color             InpTextColor         = clrWhite;            // Info text color

string g_prefix;
string g_entryName;
string g_stopName;
string g_targetName;
string g_riskName;
string g_rewardName;
string g_labelName;
string g_longButtonName;
string g_shortButtonName;
string g_offButtonName;
string g_deleteButtonName;
string g_panelName;
string g_panelTitleName;
string g_entryTagName;
string g_stopTagName;
string g_targetTagName;

double g_entry;
double g_stop;
double g_target;
PandaPositionSide g_side = PANDA_LONG;
bool g_runtimeEnabled = true;
bool g_hasPrices = false;

//+------------------------------------------------------------------+
int OnInit()
{
   g_side = InpDefaultSide;
   g_runtimeEnabled = InpEnabled;
   SetObjectNames();
   LoadSavedState();

   if(InpShowButtons) DrawFloatingPanel();

   if(!g_runtimeEnabled)
   {
      RemovePositionObjects();
      return(INIT_SUCCEEDED);
   }

   InitPrices();
   DrawPosition();
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   SaveState();
   RemovePositionObjects();
   RemoveControlButtons();
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
   SetObjectNames();

   if(InpShowButtons) DrawFloatingPanel();

   if(!g_runtimeEnabled)
   {
      RemovePositionObjects();
      return(rates_total);
   }

   if(!g_hasPrices)
      InitPrices();

   SyncLinePrices();
   SyncBoxPrices();
   DrawPosition();
   return(rates_total);
}

//+------------------------------------------------------------------+
void OnChartEvent(const int id,
                  const long &lparam,
                  const double &dparam,
                  const string &sparam)
{
   if(id == CHARTEVENT_OBJECT_CLICK && ApplyButtonMode(sparam))
      return;

   if(!g_runtimeEnabled) return;

   if(id != CHARTEVENT_OBJECT_DRAG && id != CHARTEVENT_OBJECT_CHANGE) return;

   if(sparam == g_entryName)
   {
      MoveWholePositionFromEntry();
      SaveState();
      DrawPosition();
      return;
   }

   if(sparam == g_stopName || sparam == g_targetName)
   {
      SyncLinePrices();
      SaveState();
      DrawPosition();
      return;
   }

   if(InpAllowBoxResize && (sparam == g_riskName || sparam == g_rewardName))
   {
      SyncBoxPrices();
      SaveState();
      DrawPosition();
   }
}

//+------------------------------------------------------------------+
void SetObjectNames()
{
   string controlPrefix = InpObjectPrefix + "_" + _Symbol + "_" + IntegerToString(_Period) + "_Controls";
   g_longButtonName  = controlPrefix + "_Long";
   g_shortButtonName = controlPrefix + "_Short";
   g_offButtonName   = controlPrefix + "_Off";
   g_deleteButtonName = controlPrefix + "_Delete";
   g_panelName       = controlPrefix + "_Panel";
   g_panelTitleName  = controlPrefix + "_Title";

   string modeSuffix = ModeSuffix();
   g_prefix     = InpObjectPrefix + "_" + _Symbol + "_" + IntegerToString(_Period) + "_" + modeSuffix;
   g_entryName  = g_prefix + "_Entry";
   g_stopName   = g_prefix + "_Stop";
   g_targetName = g_prefix + "_Target";
   g_riskName   = g_prefix + "_RiskBox";
   g_rewardName = g_prefix + "_RewardBox";
   g_labelName  = g_prefix + "_Info";
   g_entryTagName  = g_prefix + "_EntryTag";
   g_stopTagName   = g_prefix + "_StopTag";
   g_targetTagName = g_prefix + "_TargetTag";
}

//+------------------------------------------------------------------+
string ModeSuffix()
{
   if(g_side == PANDA_LONG) return("LONG");
   return("SHORT");
}

//+------------------------------------------------------------------+
void InitPrices()
{
   if(LoadSavedState())
   {
      g_hasPrices = true;
      return;
   }

   RefreshRates();

   double pip = PipSize();
   g_entry = NormalizeDouble((InpEntryPrice > 0.0 ? InpEntryPrice : Bid), _Digits);

   if(InpStopLossPrice > 0.0)
   {
      g_stop = NormalizeDouble(InpStopLossPrice, _Digits);
   }
   else if(g_side == PANDA_LONG)
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

   g_hasPrices = true;
}

//+------------------------------------------------------------------+
string StateKey(const string name)
{
   return(InpObjectPrefix + "_" + _Symbol + "_State_" + name);
}

//+------------------------------------------------------------------+
bool LoadSavedState()
{
   if(!GlobalVariableCheck(StateKey("entry")) ||
      !GlobalVariableCheck(StateKey("stop")) ||
      !GlobalVariableCheck(StateKey("target")))
      return(false);

   g_entry = NormalizeDouble(GlobalVariableGet(StateKey("entry")), _Digits);
   g_stop = NormalizeDouble(GlobalVariableGet(StateKey("stop")), _Digits);
   g_target = NormalizeDouble(GlobalVariableGet(StateKey("target")), _Digits);

   if(GlobalVariableCheck(StateKey("side")))
      g_side = (GlobalVariableGet(StateKey("side")) >= 0.5 ? PANDA_SHORT : PANDA_LONG);

   if(GlobalVariableCheck(StateKey("enabled")))
      g_runtimeEnabled = (GlobalVariableGet(StateKey("enabled")) >= 0.5);

   g_hasPrices = true;
   return(true);
}

//+------------------------------------------------------------------+
void SaveState()
{
   if(!g_hasPrices) return;

   GlobalVariableSet(StateKey("entry"), g_entry);
   GlobalVariableSet(StateKey("stop"), g_stop);
   GlobalVariableSet(StateKey("target"), g_target);
   GlobalVariableSet(StateKey("side"), (g_side == PANDA_SHORT ? 1.0 : 0.0));
   GlobalVariableSet(StateKey("enabled"), (g_runtimeEnabled ? 1.0 : 0.0));
}

//+------------------------------------------------------------------+
void ClearSavedState()
{
   GlobalVariableDel(StateKey("entry"));
   GlobalVariableDel(StateKey("stop"));
   GlobalVariableDel(StateKey("target"));
   GlobalVariableDel(StateKey("side"));
   GlobalVariableDel(StateKey("enabled"));
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

   if(g_side == PANDA_LONG)
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
void MoveWholePositionFromEntry()
{
   if(ObjectFind(0, g_entryName) < 0) return;

   double newEntry = NormalizeDouble(ObjectGetDouble(0, g_entryName, OBJPROP_PRICE1), _Digits);
   double delta = newEntry - g_entry;

   g_entry = newEntry;
   g_stop = NormalizeDouble(g_stop + delta, _Digits);
   g_target = NormalizeDouble(g_target + delta, _Digits);
}

//+------------------------------------------------------------------+
void SyncBoxPrices()
{
   if(ObjectFind(0, g_riskName) >= 0)
   {
      double r1 = ObjectGetDouble(0, g_riskName, OBJPROP_PRICE1);
      double r2 = ObjectGetDouble(0, g_riskName, OBJPROP_PRICE2);
      PickEntryAndSidePrice(r1, r2, g_stop);
   }

   if(ObjectFind(0, g_rewardName) >= 0)
   {
      double p1 = ObjectGetDouble(0, g_rewardName, OBJPROP_PRICE1);
      double p2 = ObjectGetDouble(0, g_rewardName, OBJPROP_PRICE2);
      PickEntryAndSidePrice(p1, p2, g_target);
   }
}

//+------------------------------------------------------------------+
void PickEntryAndSidePrice(const double price1, const double price2, double &sidePrice)
{
   if(MathAbs(price1 - g_entry) <= MathAbs(price2 - g_entry))
      sidePrice = NormalizeDouble(price2, _Digits);
   else
      sidePrice = NormalizeDouble(price1, _Digits);
}

//+------------------------------------------------------------------+
void DrawPosition()
{
   if(InpShowButtons) DrawFloatingPanel();

   datetime startTime = iTime(_Symbol, _Period, 0);
   if(startTime <= 0) startTime = TimeCurrent();

   datetime endTime = startTime + PeriodSecondsSafe() * MathMax(InpExtendBars, 5);

   DrawBox(g_riskName, startTime, g_entry, endTime, g_stop, InpStopColor);
   DrawBox(g_rewardName, startTime, g_entry, endTime, g_target, InpTargetColor);

   DrawLine(g_entryName, g_entry, InpEntryColor, STYLE_SOLID, 3, "ENTRY");
   DrawLine(g_stopName, g_stop, InpStopColor, STYLE_SOLID, 3, "SL");
   DrawLine(g_targetName, g_target, InpTargetColor, STYLE_SOLID, 3, "TP");
   DrawPriceTag(g_entryTagName, "ENTRY", g_entry, InpEntryColor);
   DrawPriceTag(g_stopTagName, "SL", g_stop, InpStopColor);
   DrawPriceTag(g_targetTagName, "TP", g_target, InpTargetColor);

   if(InpShowInfoLabel)
      DrawInfoLabel();
   else
      ObjectDelete(0, g_labelName);

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
      ObjectSetInteger(0, name, OBJPROP_SELECTED, true);
   }

   ObjectSetDouble(0, name, OBJPROP_PRICE1, price);
   ObjectSetInteger(0, name, OBJPROP_COLOR, lineColor);
   ObjectSetInteger(0, name, OBJPROP_STYLE, lineStyle);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, lineWidth);
   ObjectSetInteger(0, name, OBJPROP_BACK, false);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, true);
   ObjectSetString(0, name, OBJPROP_TEXT, description + " " + DoubleToString(price, _Digits));
}

//+------------------------------------------------------------------+
void DrawPriceTag(const string name,
                  const string label,
                  const double price,
                  const color tagColor)
{
   datetime tagTime = iTime(_Symbol, _Period, 0) + PeriodSecondsSafe() * 4;
   if(ObjectFind(0, name) < 0)
   {
      ObjectCreate(0, name, OBJ_TEXT, 0, tagTime, price);
      ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   }

   ObjectSetInteger(0, name, OBJPROP_TIME1, tagTime);
   ObjectSetDouble(0, name, OBJPROP_PRICE1, price);
   ObjectSetString(0, name, OBJPROP_TEXT, label + "  " + DoubleToString(price, _Digits));
   ObjectSetString(0, name, OBJPROP_FONT, "Arial Bold");
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, 9);
   ObjectSetInteger(0, name, OBJPROP_COLOR, tagColor);
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
      ObjectSetInteger(0, name, OBJPROP_SELECTED, false);
   }

   ObjectSetInteger(0, name, OBJPROP_TIME1, time1);
   ObjectSetDouble(0, name, OBJPROP_PRICE1, price1);
   ObjectSetInteger(0, name, OBJPROP_TIME2, time2);
   ObjectSetDouble(0, name, OBJPROP_PRICE2, price2);
   ObjectSetInteger(0, name, OBJPROP_COLOR, boxColor);
   ObjectSetInteger(0, name, OBJPROP_STYLE, STYLE_SOLID);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, 1);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, InpAllowBoxResize);
}

//+------------------------------------------------------------------+
void DrawInfoLabel()
{
   double pip = PipSize();
   double riskPips = MathAbs(g_entry - g_stop) / pip;
   double rewardPips = MathAbs(g_target - g_entry) / pip;
   double rr = 0.0;
   if(riskPips > 0.0) rr = rewardPips / riskPips;

   string side = (g_side == PANDA_LONG ? "LONG" : "SHORT");
   string text = side +
      " | Entry " + DoubleToString(g_entry, _Digits) +
      " | SL " + DoubleToString(g_stop, _Digits) +
      " | TP " + DoubleToString(g_target, _Digits) +
      " | Risk " + DoubleToString(riskPips, 1) + " pips" +
      " | Reward " + DoubleToString(rewardPips, 1) + " pips" +
      " | RR 1:" + DoubleToString(rr, 2);

   DrawLabel(text);
}

//+------------------------------------------------------------------+
void DrawLabel(const string text)
{
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
void RemovePositionObjects()
{
   ObjectDelete(0, g_entryName);
   ObjectDelete(0, g_stopName);
   ObjectDelete(0, g_targetName);
   ObjectDelete(0, g_riskName);
   ObjectDelete(0, g_rewardName);
   ObjectDelete(0, g_labelName);
   ObjectDelete(0, g_entryTagName);
   ObjectDelete(0, g_stopTagName);
   ObjectDelete(0, g_targetTagName);
   g_hasPrices = false;
}

//+------------------------------------------------------------------+
void DeleteAllDrawings()
{
   string matchPrefix = InpObjectPrefix + "_" + _Symbol + "_";

   for(int i = ObjectsTotal(0, -1, -1) - 1; i >= 0; i--)
   {
      string name = ObjectName(0, i, -1, -1);
      if(StringFind(name, matchPrefix) == 0)
         ObjectDelete(0, name);
   }

   ClearSavedState();
   g_hasPrices = false;
   g_runtimeEnabled = false;
}

//+------------------------------------------------------------------+
bool ApplyButtonMode(const string objectName)
{
   if(!InpShowButtons) return(false);
   if(objectName != g_longButtonName &&
      objectName != g_shortButtonName &&
      objectName != g_offButtonName &&
      objectName != g_deleteButtonName)
      return(false);

   ObjectSetInteger(0, objectName, OBJPROP_SELECTED, false);

   if(objectName == g_deleteButtonName)
   {
      DeleteAllDrawings();
      DrawFloatingPanel();
      ChartRedraw(0);
      return(true);
   }

   RemovePositionObjects();

   if(objectName == g_offButtonName)
   {
      g_runtimeEnabled = false;
      SaveState();
      DrawFloatingPanel();
      ChartRedraw(0);
      return(true);
   }

   g_runtimeEnabled = true;
   g_side = (objectName == g_longButtonName ? PANDA_LONG : PANDA_SHORT);
   SetObjectNames();
   InitPrices();
   SaveState();
   DrawPosition();
   return(true);
}

//+------------------------------------------------------------------+
void DrawFloatingPanel()
{
   DrawPanelBox();
   DrawPanelTitle();
   DrawButton(g_longButtonName, "LONG", InpPanelX + 10, InpPanelY + 30, 64, (g_runtimeEnabled && g_side == PANDA_LONG), InpTargetColor);
   DrawButton(g_shortButtonName, "SHORT", InpPanelX + 80, InpPanelY + 30, 66, (g_runtimeEnabled && g_side == PANDA_SHORT), InpStopColor);
   DrawButton(g_offButtonName, "OFF", InpPanelX + 152, InpPanelY + 30, 48, !g_runtimeEnabled, clrDimGray);
   DrawButton(g_deleteButtonName, "DELETE", InpPanelX + 10, InpPanelY + 56, 200, false, clrFireBrick);
}

//+------------------------------------------------------------------+
void DrawPanelBox()
{
   if(ObjectFind(0, g_panelName) < 0)
   {
      ObjectCreate(0, g_panelName, OBJ_RECTANGLE_LABEL, 0, 0, 0);
      ObjectSetInteger(0, g_panelName, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, g_panelName, OBJPROP_SELECTABLE, false);
   }

   ObjectSetInteger(0, g_panelName, OBJPROP_XDISTANCE, InpPanelX);
   ObjectSetInteger(0, g_panelName, OBJPROP_YDISTANCE, InpPanelY);
   ObjectSetInteger(0, g_panelName, OBJPROP_XSIZE, 212);
   ObjectSetInteger(0, g_panelName, OBJPROP_YSIZE, 96);
   ObjectSetInteger(0, g_panelName, OBJPROP_BGCOLOR, clrBlack);
   ObjectSetInteger(0, g_panelName, OBJPROP_BORDER_COLOR, clrDimGray);
}

//+------------------------------------------------------------------+
void DrawPanelTitle()
{
   if(ObjectFind(0, g_panelTitleName) < 0)
   {
      ObjectCreate(0, g_panelTitleName, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, g_panelTitleName, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, g_panelTitleName, OBJPROP_SELECTABLE, false);
   }

   ObjectSetInteger(0, g_panelTitleName, OBJPROP_XDISTANCE, InpPanelX + 10);
   ObjectSetInteger(0, g_panelTitleName, OBJPROP_YDISTANCE, InpPanelY + 8);
   ObjectSetString(0, g_panelTitleName, OBJPROP_TEXT, "PANDA POSITION");
   ObjectSetString(0, g_panelTitleName, OBJPROP_FONT, "Arial Bold");
   ObjectSetInteger(0, g_panelTitleName, OBJPROP_FONTSIZE, 9);
   ObjectSetInteger(0, g_panelTitleName, OBJPROP_COLOR, clrWhite);
}

//+------------------------------------------------------------------+
void DrawButton(const string name,
                const string text,
                const int x,
                const int y,
                const int width,
                const bool active,
                const color activeColor)
{
   if(ObjectFind(0, name) < 0)
   {
      ObjectCreate(0, name, OBJ_BUTTON, 0, 0, 0);
      ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, name, OBJPROP_YSIZE, 22);
      ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   }

   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, name, OBJPROP_XSIZE, width);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetString(0, name, OBJPROP_FONT, "Arial");
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, 8);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clrWhite);
   ObjectSetInteger(0, name, OBJPROP_BGCOLOR, active ? activeColor : clrBlack);
   ObjectSetInteger(0, name, OBJPROP_BORDER_COLOR, active ? activeColor : clrDimGray);
}

//+------------------------------------------------------------------+
void RemoveControlButtons()
{
   ObjectDelete(0, g_longButtonName);
   ObjectDelete(0, g_shortButtonName);
   ObjectDelete(0, g_offButtonName);
   ObjectDelete(0, g_deleteButtonName);
   ObjectDelete(0, g_panelName);
   ObjectDelete(0, g_panelTitleName);
}
//+------------------------------------------------------------------+
