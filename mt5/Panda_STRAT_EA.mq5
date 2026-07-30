//+------------------------------------------------------------------+
//| Panda_STRAT_EA.mq5                                               |
//| Panda Strat — Data-Refined Strategy EA (Forward Test)            |
//| Polls engine API for 7-layer filtered PANDA signals              |
//| Entry: gap>=6, A-tier pairs, ASIAN/NY, STRONG/BUILDING/SPARK,    |
//|        H4 box aligned. Exit: gap<5 or peak drop>=2 or 16h flat   |
//+------------------------------------------------------------------+
#property copyright "Panda Engine"
#property link      "https://pandaengine.app"
#property version   "1.00"
#property description "Panda Strat EA — polls engine API for refined signals"

#include <Trade\Trade.mqh>

//=== INPUTS ===
input string   EngineURL        = "http://localhost:8000";  // Engine base URL
input string   EngineSecret     = "";                       // ENGINE_SECRET for auth
input double   LotSize          = 0.01;                     // Fixed lot size
input ulong    MagicNumber      = 111010;                   // Magic number
input int      PollSeconds      = 30;                       // Poll interval (seconds)
input double   RR_Ratio         = 2.0;                      // TP = RR x SL distance
input int      SwingLookback    = 20;                       // Bars for swing SL
input int      SwingStrength    = 3;                        // Bars each side for swing
input double   SL_Buffer_Pts    = 50;                       // Buffer beyond swing (points)
input ulong    SlippagePoints   = 30;                       // Max slippage
input int      MaxSpreadPts     = 40;                       // Max spread (points)
input int      FlatTimeoutHours = 16;                       // Close if flat after N hours
input double   FlatPipsThresh   = 5.0;                      // Flat = pips within +/- this
input bool     ShowPanel        = true;                     // Show on-chart panel

//--- Globals
CTrade   trade;
datetime lastPoll = 0;
datetime entryTime = 0;          // Track when we entered
string   lastReason = "INIT";    // Last API reason for panel

//+------------------------------------------------------------------+
//| Init                                                              |
//+------------------------------------------------------------------+
int OnInit()
{
   if(ShowPanel)
   {
      CreateLabel("PandaStrat_Title", 15, 25, "Panda STRAT EA v1.0", clrLime, 11);
      CreateLabel("PandaStrat_Status", 15, 45, "Initializing...", clrWhite, 9);
      CreateLabel("PandaStrat_Signal", 15, 62, "", clrWhite, 9);
   }

   Print("[PANDA STRAT] Init | Symbol=", _Symbol, " Lot=", LotSize, " RR=", RR_Ratio);
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Deinit                                                            |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   ObjectDelete(0, "PandaStrat_Title");
   ObjectDelete(0, "PandaStrat_Status");
   ObjectDelete(0, "PandaStrat_Signal");
}

//+------------------------------------------------------------------+
//| Tick                                                              |
//+------------------------------------------------------------------+
void OnTick()
{
   // Check flat timeout on open positions first
   CheckFlatTimeout();

   // Rate limit polls
   if(TimeCurrent() - lastPoll < PollSeconds) return;
   lastPoll = TimeCurrent();

   // If we already have an open PANDA trade, check exit
   if(HasOpenTrade())
   {
      CheckEngineExit();
      return;
   }

   // No open trade — check for entry
   CheckEngineEntry();
}

//+------------------------------------------------------------------+
//| HTTP GET helper                                                    |
//+------------------------------------------------------------------+
string HttpGet(string url)
{
   string headers = "X-Engine-Secret: " + EngineSecret + "\r\n";
   char   postData[];
   char   result[];
   string resultHeaders;

   int timeout = 5000;  // 5 second timeout
   int code = WebRequest("GET", url, headers, timeout, postData, result, resultHeaders);

   if(code != 200)
   {
      if(code == -1)
         Print("[PANDA STRAT] WebRequest error — add ", EngineURL, " to Tools > Options > Expert Advisors > Allow WebRequest");
      else
         Print("[PANDA STRAT] HTTP ", code, " from ", url);
      return "";
   }

   return CharArrayToString(result);
}

//+------------------------------------------------------------------+
//| Simple JSON value extractor (no library needed)                    |
//| Extracts value for "key":"value" or "key":number                   |
//+------------------------------------------------------------------+
string JsonGetString(string json, string key)
{
   string search = "\"" + key + "\":";
   int pos = StringFind(json, search);
   if(pos < 0) return "";

   int valStart = pos + StringLen(search);
   // Skip whitespace
   while(valStart < StringLen(json) && StringGetCharacter(json, valStart) == ' ')
      valStart++;

   if(valStart >= StringLen(json)) return "";

   int ch = StringGetCharacter(json, valStart);

   // String value
   if(ch == '"')
   {
      int endQuote = StringFind(json, "\"", valStart + 1);
      if(endQuote < 0) return "";
      return StringSubstr(json, valStart + 1, endQuote - valStart - 1);
   }

   // Number or bool — read until comma, } or whitespace
   int endPos = valStart;
   while(endPos < StringLen(json))
   {
      int c = StringGetCharacter(json, endPos);
      if(c == ',' || c == '}' || c == ' ' || c == '\n' || c == '\r') break;
      endPos++;
   }
   return StringSubstr(json, valStart, endPos - valStart);
}

int JsonGetInt(string json, string key)
{
   string val = JsonGetString(json, key);
   if(val == "") return 0;
   return (int)StringToInteger(val);
}

bool JsonGetBool(string json, string key)
{
   string val = JsonGetString(json, key);
   return (val == "true");
}

//+------------------------------------------------------------------+
//| Get clean 6-char symbol                                           |
//+------------------------------------------------------------------+
string CleanSymbol()
{
   string sym = _Symbol;
   if(StringLen(sym) > 6)
   {
      string test = StringSubstr(sym, 0, 6);
      bool ok = true;
      for(int i = 0; i < 6; i++)
      {
         int c = StringGetCharacter(test, i);
         if(c < 'A' || c > 'Z') { ok = false; break; }
      }
      if(ok) sym = test;
   }
   return sym;
}

//+------------------------------------------------------------------+
//| Check engine for entry signal                                      |
//+------------------------------------------------------------------+
void CheckEngineEntry()
{
   string sym = CleanSymbol();
   string url = EngineURL + "/api/ea/panda?symbol=" + sym;
   string json = HttpGet(url);

   if(json == "")
   {
      UpdatePanel("NO RESPONSE", "", 0);
      return;
   }

   string action = JsonGetString(json, "action");
   string reason = JsonGetString(json, "reason");
   int    gap    = JsonGetInt(json, "gap");
   string mom    = JsonGetString(json, "momentum");
   string box    = JsonGetString(json, "box_h4");

   lastReason = reason;
   UpdatePanel(action, reason, gap);

   if(action != "BUY" && action != "SELL") return;

   // Spread check
   if(GetSpreadPoints() > MaxSpreadPts)
   {
      Print("[PANDA STRAT] Spread too high: ", GetSpreadPoints());
      return;
   }

   ENUM_ORDER_TYPE dir = (action == "BUY") ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   if(ExecuteTrade(dir))
   {
      entryTime = TimeCurrent();
      Print("[PANDA STRAT] ENTRY ", action, " | gap=", gap, " mom=", mom, " box=", box);
   }
}

//+------------------------------------------------------------------+
//| Check engine for exit signal                                       |
//+------------------------------------------------------------------+
void CheckEngineExit()
{
   string sym = CleanSymbol();
   string url = EngineURL + "/api/ea/panda/exit?symbol=" + sym;
   string json = HttpGet(url);

   if(json == "") return;

   bool shouldExit = JsonGetBool(json, "should_exit");
   string reason   = JsonGetString(json, "reason");
   int    gap      = JsonGetInt(json, "gap");

   UpdatePanel("OPEN", reason, gap);

   if(shouldExit)
   {
      Print("[PANDA STRAT] ENGINE EXIT: ", reason, " gap=", gap);
      CloseAllTrades("Engine: " + reason);
   }
}

//+------------------------------------------------------------------+
//| Check flat timeout — close if held > N hours with tiny pips       |
//+------------------------------------------------------------------+
void CheckFlatTimeout()
{
   if(FlatTimeoutHours <= 0) return;
   if(!HasOpenTrade()) return;

   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC) != (long)MagicNumber) continue;

      datetime openTime = (datetime)PositionGetInteger(POSITION_TIME);
      double   profit   = PositionGetDouble(POSITION_PROFIT);
      double   openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      double   curPrice  = PositionGetDouble(POSITION_PRICE_CURRENT);
      long     posDir    = PositionGetInteger(POSITION_TYPE);

      int ageHours = (int)((TimeCurrent() - openTime) / 3600);
      if(ageHours < FlatTimeoutHours) continue;

      // Calculate pips
      double pipSize = (StringFind(_Symbol, "JPY") >= 0) ? 0.01 : 0.0001;
      double rawPips;
      if(posDir == POSITION_TYPE_BUY)
         rawPips = (curPrice - openPrice) / pipSize;
      else
         rawPips = (openPrice - curPrice) / pipSize;

      if(MathAbs(rawPips) <= FlatPipsThresh)
      {
         Print("[PANDA STRAT] FLAT TIMEOUT: ", ageHours, "h | pips=", NormalizeDouble(rawPips, 1));
         trade.SetExpertMagicNumber(MagicNumber);
         trade.PositionClose(ticket);
      }
   }
}

//+------------------------------------------------------------------+
//| Execute trade with swing SL and RR-based TP                       |
//+------------------------------------------------------------------+
bool ExecuteTrade(ENUM_ORDER_TYPE direction)
{
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);

   trade.SetExpertMagicNumber(MagicNumber);
   trade.SetDeviationInPoints(SlippagePoints);

   double sl = 0, tp = 0, entry = 0, slDist = 0;
   string comment = "Panda_STRAT";

   if(direction == ORDER_TYPE_BUY)
   {
      entry = NormPrice(SymbolInfoDouble(_Symbol, SYMBOL_ASK));
      double swLow = FindSwingLow();
      if(swLow <= 0) { Print("[PANDA STRAT] No swing low for SL"); return false; }

      sl = NormPrice(swLow - SL_Buffer_Pts * point);
      slDist = entry - sl;
      if(slDist <= 0) return false;
      tp = NormPrice(entry + slDist * RR_Ratio);

      if(!trade.Buy(LotSize, _Symbol, entry, sl, tp, comment))
      { Print("[PANDA STRAT] Buy FAIL: ", trade.ResultRetcodeDescription()); return false; }
      return true;
   }
   else
   {
      entry = NormPrice(SymbolInfoDouble(_Symbol, SYMBOL_BID));
      double swHigh = FindSwingHigh();
      if(swHigh <= 0) { Print("[PANDA STRAT] No swing high for SL"); return false; }

      sl = NormPrice(swHigh + SL_Buffer_Pts * point);
      slDist = sl - entry;
      if(slDist <= 0) return false;
      tp = NormPrice(entry - slDist * RR_Ratio);

      if(!trade.Sell(LotSize, _Symbol, entry, sl, tp, comment))
      { Print("[PANDA STRAT] Sell FAIL: ", trade.ResultRetcodeDescription()); return false; }
      return true;
   }
}

//+------------------------------------------------------------------+
//| Find swing low                                                     |
//+------------------------------------------------------------------+
double FindSwingLow()
{
   double lowest = DBL_MAX;
   for(int i = 1; i <= SwingLookback; i++)
   {
      double lo = iLow(_Symbol, PERIOD_CURRENT, i);
      bool isSwing = true;
      for(int j = 1; j <= SwingStrength; j++)
      {
         if(i - j >= 0 && iLow(_Symbol, PERIOD_CURRENT, i - j) < lo) { isSwing = false; break; }
         if(iLow(_Symbol, PERIOD_CURRENT, i + j) < lo) { isSwing = false; break; }
      }
      if(isSwing && lo < lowest) lowest = lo;
   }
   return (lowest == DBL_MAX) ? 0 : lowest;
}

//+------------------------------------------------------------------+
//| Find swing high                                                    |
//+------------------------------------------------------------------+
double FindSwingHigh()
{
   double highest = 0;
   for(int i = 1; i <= SwingLookback; i++)
   {
      double hi = iHigh(_Symbol, PERIOD_CURRENT, i);
      bool isSwing = true;
      for(int j = 1; j <= SwingStrength; j++)
      {
         if(i - j >= 0 && iHigh(_Symbol, PERIOD_CURRENT, i - j) > hi) { isSwing = false; break; }
         if(iHigh(_Symbol, PERIOD_CURRENT, i + j) > hi) { isSwing = false; break; }
      }
      if(isSwing && hi > highest) highest = hi;
   }
   return highest;
}

//+------------------------------------------------------------------+
//| Helpers                                                            |
//+------------------------------------------------------------------+
bool HasOpenTrade()
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) == _Symbol &&
         PositionGetInteger(POSITION_MAGIC) == (long)MagicNumber)
         return true;
   }
   return false;
}

void CloseAllTrades(string reason)
{
   trade.SetExpertMagicNumber(MagicNumber);
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC) != (long)MagicNumber) continue;
      trade.PositionClose(ticket);
      Print("[PANDA STRAT] Closed #", ticket, " — ", reason);
   }
}

double NormPrice(double price)
{
   return NormalizeDouble(price, (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS));
}

int GetSpreadPoints()
{
   return (int)SymbolInfoInteger(_Symbol, SYMBOL_SPREAD);
}

//+------------------------------------------------------------------+
//| On-chart panel                                                     |
//+------------------------------------------------------------------+
void CreateLabel(string name, int x, int y, string text, color clr, int size)
{
   ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetString(0, name, OBJPROP_FONT, "Consolas");
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, size);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
}

void UpdatePanel(string action, string reason, int gap)
{
   if(!ShowPanel) return;

   color statusClr = clrWhite;
   if(action == "BUY")       statusClr = clrLime;
   else if(action == "SELL") statusClr = clrOrangeRed;
   else if(action == "OPEN") statusClr = clrDodgerBlue;
   else                      statusClr = clrGray;

   string statusText = action + " | gap=" + IntegerToString(gap) + " | " + reason;
   ObjectSetString(0, "PandaStrat_Status", OBJPROP_TEXT, statusText);
   ObjectSetInteger(0, "PandaStrat_Status", OBJPROP_COLOR, statusClr);

   string posInfo = HasOpenTrade() ? "POSITION OPEN" : "NO POSITION";
   ObjectSetString(0, "PandaStrat_Signal", OBJPROP_TEXT, posInfo);
   ObjectSetInteger(0, "PandaStrat_Signal", OBJPROP_COLOR, HasOpenTrade() ? clrYellow : clrGray);
}
//+------------------------------------------------------------------+
