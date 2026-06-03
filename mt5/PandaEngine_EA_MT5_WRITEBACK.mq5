//+------------------------------------------------------------------+
//| PandaEngine_EA_MT5.mq5                                            |
//| Panda Engine EA — 4 Strategies: BB, INTRA, PULLBACK, INTRA MASTER|
//| Reads panda_score_SYMBOL.txt from engine (MT5 version)            |
//| v2.10 — Added execution write-back to Supabase via API            |
//+------------------------------------------------------------------+
#property copyright "Panda Engine"
#property link      "https://pandaengine.app"
#property version   "2.10"

#include <Trade\Trade.mqh>

//=== GENERAL INPUTS ===
input double   LotSize           = 0.01;     // Lot size
input int      SwingLookback     = 20;       // Bars to scan for swing high/low
input int      SwingStrength     = 3;        // Bars on each side to confirm swing
input ulong    SlippagePoints    = 30;       // Max slippage in points
input int      MaxSpreadPoints   = 40;       // Max spread to allow entry (points)
input double   SL_Buffer_Points  = 50;       // Buffer beyond swing for SL (points)
input int      UAE_Offset        = 4;        // UAE offset from UTC
input int      MinConfluence     = 0;        // Min confluence score to trade (0=disabled)
input bool     ShowDashboard     = false;    // Show detailed on-chart info panel
input bool     EnableDebugLogs   = true;     // Print skip reasons in Experts log

//=== EXPOSURE GUARD ===
input bool     EnableExposureGuard              = true;  // Block overexposed signals
input int      MaxTotalOpenTrades               = 20;    // Max all open positions
input int      MaxTradesPerCurrency             = 4;     // Max positions involving one currency
input int      MaxDirectionalTradesPerCurrency  = 2;     // Max same long/short currency exposure
input bool     BlockOppositeCurrencyHedges      = false; // Block if trade hedges existing currency exposure

//=== BB STRATEGY ===
input bool     EnableBB          = true;     // Enable BB strategy
input double   BB_RR             = 2.0;      // BB: TP = RR x SL distance
input ulong    BB_Magic          = 111001;   // BB: Magic number

//=== INTRA STRATEGY ===
input bool     EnableINTRA       = true;     // Enable INTRA strategy
input double   INTRA_RR          = 2.0;      // INTRA: TP = RR x SL distance
input ulong    INTRA_Magic       = 111002;   // INTRA: Magic number
input int      IntraStartHour    = 2;        // INTRA: Entry window start (UAE)
input int      IntraEndHour      = 4;        // INTRA: Entry window end (UAE)
input int      IntraCloseHour    = 10;       // INTRA: Hard close hour (UAE)

//=== PULLBACK STRATEGY ===
input bool     EnablePULLBACK    = true;     // Enable PULLBACK strategy
input ulong    PB_Magic          = 111003;   // PULLBACK: Magic number
input double   PB_ZonePips       = 15.0;     // PULLBACK: Max pips from generated S/R line
input double   PB_MinTPPips      = 50.0;     // PULLBACK: Minimum TP distance in pips
input int      PB_MinGap         = 5;        // PULLBACK: Minimum gap score
input bool     PB_UseDaily       = true;     // PULLBACK: Use PDH/PDL
input bool     PB_UseWeekly      = true;     // PULLBACK: Use PWH/PWL
input bool     PB_UseMonthly     = true;     // PULLBACK: Use PMH/PML
input bool     PB_UseYearly      = true;     // PULLBACK: Use PYH/PYL

//=== INTRA MASTER STRATEGY ===
input bool     EnableIM          = true;     // Enable INTRA MASTER strategy
input ulong    IM_Magic          = 111004;   // IM: Magic number
input int      IM_SuperTrendPd   = 10;       // IM: SuperTrend ATR period
input double   IM_SuperTrendMul  = 3.0;      // IM: SuperTrend multiplier
input bool     IM_UseSuperTrend  = true;     // IM: Use SuperTrend for SL (false=swing)
input double   IM_ST_Buffer      = 30;       // IM: Buffer below/above SuperTrend (pts)
input double   IM_TrailStep      = 20;       // IM: Trail step in points (min move)

//=== API WRITE-BACK ===
input bool     EnableWriteBack   = true;     // Report closed trades to API
input string   API_BaseURL       = "https://pandaengine.app/api/ea-result"; // Write-back endpoint
input string   API_Key           = "";       // EA_API_KEY (set in EA inputs)

//--- Global objects
CTrade   trade;
int      CheckIntervalSec = 30;
int      atrHandle = INVALID_HANDLE;

string WB_LABEL_MAIN   = "PandaWB_Label";
string WB_LABEL_STATUS = "PandaWB_Status";
string WB_LABEL_BB     = "PandaWB_BB";
string WB_LABEL_INTRA  = "PandaWB_INTRA";
string WB_LABEL_PB     = "PandaWB_PB";
string WB_LABEL_IM     = "PandaWB_IM";
string WB_LABEL_BADGE  = "PandaWB_BADGE";
string WB_PANEL_BG     = "PandaWB_PANEL_BG";

//+------------------------------------------------------------------+
//| STRUCT: Panda Signal Data                                         |
//+------------------------------------------------------------------+
struct PandaSignal
{
   int      gap;
   string   bias;
   string   confidence;
   string   execution;
   string   momentum;
   int      strength;
   bool     hardInvalid;
   string   plZone;
   bool     plG1;
   string   boxH1;
   string   boxH4;
   int      confluence;
   bool     valid;
};
struct SRLevel
{
   double   price;
   string   name;
   string   period;
};

//+------------------------------------------------------------------+
//| STRUCT: Entry Record (for slippage tracking)                       |
//+------------------------------------------------------------------+
struct EntryRecord
{
   ulong    positionId;
   double   requestedPrice;
   ulong    magic;
   int      spreadAtEntry;
};

EntryRecord g_entries[];
int         g_entryCount = 0;

void RecordEntry(ulong orderTicket, double requestedPrice, ulong magic)
{
   // MT5: trade.ResultOrder() returns the order ticket.
   // The position ID will match the order ticket for instant execution.
   // We store it and match in OnTradeTransaction when position closes.
   ArrayResize(g_entries, g_entryCount + 1);
   g_entries[g_entryCount].positionId = orderTicket;
   g_entries[g_entryCount].requestedPrice = requestedPrice;
   g_entries[g_entryCount].magic = magic;
   g_entries[g_entryCount].spreadAtEntry = GetSpreadPoints();
   g_entryCount++;

   if(EnableDebugLogs)
      Print("[PANDA WB] Entry recorded: order=", orderTicket, " price=", requestedPrice, " magic=", magic);
}

bool FindEntry(ulong posId, EntryRecord &rec)
{
   for(int i = 0; i < g_entryCount; i++)
   {
      if(g_entries[i].positionId == posId)
      {
         rec = g_entries[i];
         return true;
      }
   }
   return false;
}

void RemoveEntry(ulong posId)
{
   for(int i = 0; i < g_entryCount; i++)
   {
      if(g_entries[i].positionId == posId)
      {
         for(int j = i; j < g_entryCount - 1; j++)
            g_entries[j] = g_entries[j + 1];
         g_entryCount--;
         ArrayResize(g_entries, MathMax(g_entryCount, 0));
         return;
      }
   }
}

//+------------------------------------------------------------------+
//| Map magic → strategy name                                         |
//+------------------------------------------------------------------+
string MagicToStrategy(ulong magic)
{
   if(magic == BB_Magic)    return "BB";
   if(magic == INTRA_Magic) return "INTRA";
   if(magic == PB_Magic)    return "PULLBACK";
   if(magic == IM_Magic)    return "IM";
   return "UNKNOWN";
}

bool IsOurMagic(ulong magic)
{
   return (magic == BB_Magic || magic == INTRA_Magic || magic == PB_Magic || magic == IM_Magic);
}

//+------------------------------------------------------------------+
//| Determine close reason                                             |
//+------------------------------------------------------------------+
string DetermineCloseReason(ulong magic, double closePrice, double sl, double tp,
                            ENUM_DEAL_REASON dealReason)
{
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   double tol = 5.0 * point;

   if(tp > 0 && MathAbs(closePrice - tp) <= tol)   return "TP_HIT";
   if(sl > 0 && MathAbs(closePrice - sl) <= tol)   return "SL_HIT";
   if(dealReason == DEAL_REASON_SL)                 return "SL_HIT";
   if(dealReason == DEAL_REASON_TP)                 return "TP_HIT";
   if(magic == INTRA_Magic)                         return "INTRA_CLOSE";
   if(magic == IM_Magic)                            return "IM_TRAIL";
   return "MANUAL";
}

//+------------------------------------------------------------------+
//| Format datetime → ISO 8601                                         |
//+------------------------------------------------------------------+
string DateTimeToISO(datetime dt)
{
   MqlDateTime mdt;
   TimeToStruct(dt, mdt);
   return StringFormat("%04d-%02d-%02dT%02d:%02d:%02dZ",
                       mdt.year, mdt.mon, mdt.day, mdt.hour, mdt.min, mdt.sec);
}

//+------------------------------------------------------------------+
//| JSON escape                                                        |
//+------------------------------------------------------------------+
string JE(string s)
{
   StringReplace(s, "\\", "\\\\");
   StringReplace(s, "\"", "\\\"");
   return s;
}

//+------------------------------------------------------------------+
//| POST trade result to API                                           |
//+------------------------------------------------------------------+
void ReportTradeToAPI(ulong posId, string symbol, ulong magic, string direction,
                      double entryRequested, double fillPrice, double sl, double tp,
                      double closePrice, datetime openTime, datetime closeTime,
                      string closeReason, int spreadAtEntry, double profitPips,
                      double profitMoney, double lotSize)
{
   if(!EnableWriteBack || StringLen(API_Key) == 0 || StringLen(API_BaseURL) == 0)
      return;

   string strategy = MagicToStrategy(magic);
   double point = SymbolInfoDouble(symbol, SYMBOL_POINT);
   int slippagePoints = 0;
   if(entryRequested > 0 && fillPrice > 0 && point > 0)
      slippagePoints = (int)MathRound(MathAbs(fillPrice - entryRequested) / point);

   // Build JSON
   string json = "{";
   json += "\"ticket\":\"" + IntegerToString(posId) + "\",";
   json += "\"symbol\":\"" + JE(symbol) + "\",";
   json += "\"strategy\":\"" + JE(strategy) + "\",";
   json += "\"magic\":" + IntegerToString(magic) + ",";
   json += "\"direction\":\"" + JE(direction) + "\",";
   json += "\"entry_requested\":" + DoubleToString(entryRequested, 6) + ",";
   json += "\"fill_price\":" + DoubleToString(fillPrice, 6) + ",";
   json += "\"sl\":" + DoubleToString(sl, 6) + ",";
   json += "\"tp\":" + DoubleToString(tp, 6) + ",";
   json += "\"close_price\":" + DoubleToString(closePrice, 6) + ",";
   json += "\"open_time\":\"" + DateTimeToISO(openTime) + "\",";
   json += "\"close_time\":\"" + DateTimeToISO(closeTime) + "\",";
   json += "\"close_reason\":\"" + JE(closeReason) + "\",";
   json += "\"spread_at_entry\":" + IntegerToString(spreadAtEntry) + ",";
   json += "\"slippage_points\":" + IntegerToString(slippagePoints) + ",";
   json += "\"profit_pips\":" + DoubleToString(profitPips, 2) + ",";
   json += "\"profit_money\":" + DoubleToString(profitMoney, 2) + ",";
   json += "\"lot_size\":" + DoubleToString(lotSize, 2) + ",";
   json += "\"engine_version\":\"2.10\"";
   json += "}";

   string headers = "Authorization: Bearer " + API_Key + "\r\n"
                  + "Content-Type: application/json\r\n";

   char postData[];
   char resultData[];
   string resultHeaders;

   StringToCharArray(json, postData, 0, StringLen(json), CP_UTF8);
   ArrayResize(postData, StringLen(json));  // trim null terminator

   int httpCode = WebRequest("POST", API_BaseURL, headers, 5000, postData, resultData, resultHeaders);

   if(httpCode == 200)
      Print("[PANDA WB] OK: ", symbol, " ", strategy, " ", direction, " pips=", DoubleToString(profitPips, 1));
   else if(httpCode == -1)
      Print("[PANDA WB] FAILED err=", GetLastError(), " — whitelist ", API_BaseURL, " in Tools>Options>Expert Advisors");
   else
   {
      string resp = CharArrayToString(resultData, 0, WHOLE_ARRAY, CP_UTF8);
      Print("[PANDA WB] HTTP ", httpCode, ": ", resp);
   }
}

//+------------------------------------------------------------------+
//| OnTradeTransaction — detect our closed positions and report        |
//+------------------------------------------------------------------+
void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest &request,
                        const MqlTradeResult &result)
{
   if(trans.type != TRADE_TRANSACTION_DEAL_ADD)
      return;

   ulong dealTicket = trans.deal;
   if(dealTicket == 0) return;
   if(!HistoryDealSelect(dealTicket)) return;

   ENUM_DEAL_ENTRY dealEntry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
   if(dealEntry != DEAL_ENTRY_OUT && dealEntry != DEAL_ENTRY_INOUT)
      return;

   ulong magic = (ulong)HistoryDealGetInteger(dealTicket, DEAL_MAGIC);
   if(!IsOurMagic(magic)) return;

   // Extract close deal info
   string dealSymbol = HistoryDealGetString(dealTicket, DEAL_SYMBOL);
   ulong posId = (ulong)HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID);
   double closePrice = HistoryDealGetDouble(dealTicket, DEAL_PRICE);
   double profitMoney = HistoryDealGetDouble(dealTicket, DEAL_PROFIT);
   double lotSize = HistoryDealGetDouble(dealTicket, DEAL_VOLUME);
   datetime closeTime = (datetime)HistoryDealGetInteger(dealTicket, DEAL_TIME);
   ENUM_DEAL_TYPE dealType = (ENUM_DEAL_TYPE)HistoryDealGetInteger(dealTicket, DEAL_TYPE);
   ENUM_DEAL_REASON dealReason = (ENUM_DEAL_REASON)HistoryDealGetInteger(dealTicket, DEAL_REASON);

   // Direction of the POSITION (opposite of closing deal type)
   string direction = "";
   if(dealType == DEAL_TYPE_SELL)      direction = "BUY";
   else if(dealType == DEAL_TYPE_BUY)  direction = "SELL";
   else return;

   // Find opening deal for fill_price and open_time
   double fillPrice = 0;
   datetime openTime = 0;
   double sl = 0, tp = 0;

   if(HistorySelectByPosition(posId))
   {
      int totalDeals = HistoryDealsTotal();
      for(int i = 0; i < totalDeals; i++)
      {
         ulong hTicket = HistoryDealGetTicket(i);
         if(hTicket == 0) continue;
         ENUM_DEAL_ENTRY hEntry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(hTicket, DEAL_ENTRY);
         if(hEntry == DEAL_ENTRY_IN)
         {
            fillPrice = HistoryDealGetDouble(hTicket, DEAL_PRICE);
            openTime = (datetime)HistoryDealGetInteger(hTicket, DEAL_TIME);
            ulong orderTicket = (ulong)HistoryDealGetInteger(hTicket, DEAL_ORDER);
            if(orderTicket > 0 && HistoryOrderSelect(orderTicket))
            {
               sl = HistoryOrderGetDouble(orderTicket, ORDER_SL);
               tp = HistoryOrderGetDouble(orderTicket, ORDER_TP);
            }
            break;
         }
      }
   }

   // Fallback SL/TP from closing order
   if(sl == 0 && tp == 0)
   {
      ulong closeOrder = (ulong)HistoryDealGetInteger(dealTicket, DEAL_ORDER);
      if(closeOrder > 0 && HistoryOrderSelect(closeOrder))
      {
         sl = HistoryOrderGetDouble(closeOrder, ORDER_SL);
         tp = HistoryOrderGetDouble(closeOrder, ORDER_TP);
      }
   }

   // Profit in pips
   double point = SymbolInfoDouble(dealSymbol, SYMBOL_POINT);
   int digits = (int)SymbolInfoInteger(dealSymbol, SYMBOL_DIGITS);
   double pipSize = (digits == 3 || digits == 5) ? 10.0 * point : point;
   double profitPips = 0;
   if(pipSize > 0 && fillPrice > 0)
   {
      if(direction == "BUY")
         profitPips = (closePrice - fillPrice) / pipSize;
      else
         profitPips = (fillPrice - closePrice) / pipSize;
   }
   profitPips = NormalizeDouble(profitPips, 1);

   string closeReason = DetermineCloseReason(magic, closePrice, sl, tp, dealReason);

   // Get stored entry record
   double entryRequested = fillPrice;  // fallback
   int spreadAtEntry = 0;
   EntryRecord rec;
   if(FindEntry(posId, rec))
   {
      entryRequested = rec.requestedPrice;
      spreadAtEntry = rec.spreadAtEntry;
      RemoveEntry(posId);
   }

   if(EnableDebugLogs)
      Print("[PANDA WB] Closed: ", dealSymbol, " ", direction, " pos=", posId,
            " fill=", fillPrice, " close=", closePrice, " pips=", profitPips, " reason=", closeReason);

   ReportTradeToAPI(posId, dealSymbol, magic, direction,
                    entryRequested, fillPrice, sl, tp,
                    closePrice, openTime, closeTime,
                    closeReason, spreadAtEntry, profitPips,
                    profitMoney, lotSize);
}

//+------------------------------------------------------------------+
//| Debug helpers                                                     |
//+------------------------------------------------------------------+
string TfName()
{
   return EnumToString((ENUM_TIMEFRAMES)_Period);
}

void DebugSkip(string strategyName, string reason, PandaSignal &sig)
{
   if(!EnableDebugLogs) return;
   Print("[PANDA DEBUG] ", _Symbol, " ", TfName(), " ", strategyName,
         " skip: ", reason,
         " | gap=", sig.gap,
         " bias=", sig.bias,
         " zone=", sig.plZone,
         " hardInvalid=", sig.hardInvalid,
         " confluence=", sig.confluence,
         " spread=", GetSpreadPoints());
}

void DebugInfo(string reason)
{
   if(!EnableDebugLogs) return;
   Print("[PANDA DEBUG] ", _Symbol, " ", TfName(), " ", reason,
         " | spread=", GetSpreadPoints());
}

//+------------------------------------------------------------------+
//| Expert initialization                                             |
//+------------------------------------------------------------------+
int OnInit()
{
   // IMPORTANT: You MUST add the API URL to:
   //   Tools > Options > Expert Advisors > Allow WebRequest for listed URL
   //   Add: https://pandaengine.app
   // Without this, WebRequest() fails with error 4014.

   atrHandle = iATR(_Symbol, PERIOD_CURRENT, IM_SuperTrendPd);

   ObjectCreate(0, WB_PANEL_BG, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, WB_PANEL_BG, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, WB_PANEL_BG, OBJPROP_XDISTANCE, 8);
   ObjectSetInteger(0, WB_PANEL_BG, OBJPROP_YDISTANCE, 18);
   ObjectSetInteger(0, WB_PANEL_BG, OBJPROP_XSIZE, 180);
   ObjectSetInteger(0, WB_PANEL_BG, OBJPROP_YSIZE, 24);
   ObjectSetInteger(0, WB_PANEL_BG, OBJPROP_BGCOLOR, clrBlack);
   ObjectSetInteger(0, WB_PANEL_BG, OBJPROP_BORDER_COLOR, clrYellow);
   ObjectSetInteger(0, WB_PANEL_BG, OBJPROP_BACK, false);
   ObjectSetInteger(0, WB_PANEL_BG, OBJPROP_HIDDEN, false);
   ObjectSetInteger(0, WB_PANEL_BG, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, WB_PANEL_BG, OBJPROP_ZORDER, 999);

   ObjectCreate(0, WB_LABEL_BADGE, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, WB_LABEL_BADGE, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, WB_LABEL_BADGE, OBJPROP_ANCHOR, ANCHOR_LEFT_UPPER);
   ObjectSetInteger(0, WB_LABEL_BADGE, OBJPROP_XDISTANCE, 16);
   ObjectSetInteger(0, WB_LABEL_BADGE, OBJPROP_YDISTANCE, 23);
   ObjectSetString(0, WB_LABEL_BADGE, OBJPROP_FONT, "Arial");
   ObjectSetInteger(0, WB_LABEL_BADGE, OBJPROP_FONTSIZE, 9);
   ObjectSetInteger(0, WB_LABEL_BADGE, OBJPROP_COLOR, clrYellow);
   ObjectSetInteger(0, WB_LABEL_BADGE, OBJPROP_BACK, false);
   ObjectSetInteger(0, WB_LABEL_BADGE, OBJPROP_HIDDEN, false);
   ObjectSetInteger(0, WB_LABEL_BADGE, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, WB_LABEL_BADGE, OBJPROP_ZORDER, 1000);
   ObjectSetString(0, WB_LABEL_BADGE, OBJPROP_TEXT, "Panda WB EA: ON");
   Comment("");
   Alert("PANDA WRITEBACK EA attached to ", _Symbol, " ", TfName());
   ChartRedraw(0);

   if(ShowDashboard)
   {
      ObjectCreate(0, WB_LABEL_MAIN, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, WB_LABEL_MAIN, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, WB_LABEL_MAIN, OBJPROP_XDISTANCE, 15);
      ObjectSetInteger(0, WB_LABEL_MAIN, OBJPROP_YDISTANCE, 25);
      ObjectSetString(0, WB_LABEL_MAIN, OBJPROP_FONT, "Consolas");
      ObjectSetInteger(0, WB_LABEL_MAIN, OBJPROP_FONTSIZE, 10);
      ObjectSetInteger(0, WB_LABEL_MAIN, OBJPROP_COLOR, clrLime);
      ObjectSetString(0, WB_LABEL_MAIN, OBJPROP_TEXT, "Panda EA v2.10 WRITEBACK: Initializing...");
      ChartRedraw(0);
   }

   Print("[PANDA EA v2.10] Init | BB=", EnableBB, " INTRA=", EnableINTRA,
         " PB=", EnablePULLBACK, " IM=", EnableIM, " WB=", EnableWriteBack);

   if(EnableWriteBack && StringLen(API_Key) == 0)
      Print("[PANDA WB] WARNING: WriteBack enabled but API_Key is empty!");

   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization                                           |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if(atrHandle != INVALID_HANDLE)
      IndicatorRelease(atrHandle);
   ObjectDelete(0, WB_LABEL_MAIN);
   ObjectDelete(0, WB_LABEL_STATUS);
   ObjectDelete(0, WB_LABEL_BB);
   ObjectDelete(0, WB_LABEL_INTRA);
   ObjectDelete(0, WB_LABEL_PB);
   ObjectDelete(0, WB_LABEL_IM);
   ObjectDelete(0, WB_LABEL_BADGE);
   ObjectDelete(0, WB_PANEL_BG);
   Comment("");
}

//+------------------------------------------------------------------+
//| Read panda_score_SYMBOL.txt                                       |
//+------------------------------------------------------------------+
bool ReadPandaSignal(string symbol, PandaSignal &sig)
{
   string cleanSym = symbol;
   if(StringLen(cleanSym) > 6)
   {
      string test = StringSubstr(cleanSym, 0, 6);
      bool valid6 = true;
      for(int c = 0; c < 6; c++)
      {
         int ch = StringGetCharacter(test, c);
         if(ch < 'A' || ch > 'Z') { valid6 = false; break; }
      }
      if(valid6) cleanSym = test;
   }

   string filename = "panda_score_" + cleanSym + ".txt";
   int handle = FileOpen(filename, FILE_READ | FILE_TXT | FILE_COMMON | FILE_ANSI);
   if(handle == INVALID_HANDLE)
   {
      sig.valid = false;
      return false;
   }

   sig.gap = 0; sig.bias = "WAIT"; sig.confidence = "INVALID";
   sig.execution = "NONE"; sig.momentum = "NEUTRAL"; sig.strength = 0;
   sig.hardInvalid = true; sig.plZone = "BETWEEN"; sig.plG1 = false;
   sig.boxH1 = "UNKNOWN"; sig.boxH4 = "UNKNOWN"; sig.confluence = 0;
   sig.valid = false;

   while(!FileIsEnding(handle))
   {
      string line = FileReadString(handle);
      if(StringLen(line) == 0) continue;
      int colonPos = StringFind(line, ":");
      if(colonPos < 0) continue;

      string key   = StringSubstr(line, 0, colonPos);
      string value = StringSubstr(line, colonPos + 1);
      StringTrimLeft(key); StringTrimRight(key);
      StringTrimLeft(value); StringTrimRight(value);
      if(StringLen(key) > 0 && StringGetCharacter(key, 0) == 65279)
         key = StringSubstr(key, 1);

      if(key == "GAP")              sig.gap         = (int)StringToInteger(value);
      else if(key == "BIAS")        sig.bias        = value;
      else if(key == "CONFIDENCE")  sig.confidence  = value;
      else if(key == "EXECUTION")   sig.execution   = value;
      else if(key == "MOMENTUM")    sig.momentum    = value;
      else if(key == "STRENGTH")    sig.strength    = (int)StringToInteger(value);
      else if(key == "HARD_INVALID") sig.hardInvalid = (value == "1");
      else if(key == "PL_ZONE")     sig.plZone      = value;
      else if(key == "PL_G1")       sig.plG1        = (value == "1");
      else if(key == "BOX_H1")      sig.boxH1       = value;
      else if(key == "BOX_H4")      sig.boxH4       = value;
      else if(key == "CONFLUENCE")  sig.confluence  = (int)StringToInteger(value);
   }
   FileClose(handle);
   sig.valid = true;

   if(EnableDebugLogs)
      Print("[PANDA DEBUG] ", _Symbol, " ", TfName(), " loaded ", filename,
            " | gap=", sig.gap, " bias=", sig.bias,
            " hardInvalid=", sig.hardInvalid, " zone=", sig.plZone,
            " confluence=", sig.confluence);
   return true;
}

//+------------------------------------------------------------------+
//| Swing / Structure helpers (unchanged from v2.00)                   |
//+------------------------------------------------------------------+
double FindSwingLow(int lookback, int strength)
{
   for(int i = strength + 1; i < lookback; i++)
   {
      double low_i = iLow(_Symbol, PERIOD_CURRENT, i);
      bool isSwing = true;
      for(int j = 1; j <= strength; j++)
      {
         if(iLow(_Symbol, PERIOD_CURRENT, i - j) <= low_i ||
            iLow(_Symbol, PERIOD_CURRENT, i + j) <= low_i)
         { isSwing = false; break; }
      }
      if(isSwing) return low_i;
   }
   return 0;
}

double FindSwingHigh(int lookback, int strength)
{
   for(int i = strength + 1; i < lookback; i++)
   {
      double high_i = iHigh(_Symbol, PERIOD_CURRENT, i);
      bool isSwing = true;
      for(int j = 1; j <= strength; j++)
      {
         if(iHigh(_Symbol, PERIOD_CURRENT, i - j) >= high_i ||
            iHigh(_Symbol, PERIOD_CURRENT, i + j) >= high_i)
         { isSwing = false; break; }
      }
      if(isSwing) return high_i;
   }
   return 0;
}

double FindRecentLow(int lookback)
{
   double best = 0;
   int bars = MathMin(lookback, Bars(_Symbol, PERIOD_CURRENT) - 1);
   for(int i = 1; i <= bars; i++)
   {
      double val = iLow(_Symbol, PERIOD_CURRENT, i);
      if(val > 0 && (best <= 0 || val < best)) best = val;
   }
   return best;
}

double FindRecentHigh(int lookback)
{
   double best = 0;
   int bars = MathMin(lookback, Bars(_Symbol, PERIOD_CURRENT) - 1);
   for(int i = 1; i <= bars; i++)
   {
      double val = iHigh(_Symbol, PERIOD_CURRENT, i);
      if(val > best) best = val;
   }
   return best;
}

double FindSupport(int lookback)
{
   double price = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double bestSupport = 0; double minDist = 999999;
   for(int i = SwingStrength + 1; i < lookback; i++)
   {
      double low_i = iLow(_Symbol, PERIOD_CURRENT, i);
      bool isSwing = true;
      for(int j = 1; j <= SwingStrength; j++)
         if(iLow(_Symbol, PERIOD_CURRENT, i-j) <= low_i || iLow(_Symbol, PERIOD_CURRENT, i+j) <= low_i)
         { isSwing = false; break; }
      if(isSwing && low_i < price)
      { double dist = price - low_i; if(dist < minDist) { minDist = dist; bestSupport = low_i; } }
   }
   return bestSupport;
}

double FindResistance(int lookback)
{
   double price = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double bestResist = 0; double minDist = 999999;
   for(int i = SwingStrength + 1; i < lookback; i++)
   {
      double high_i = iHigh(_Symbol, PERIOD_CURRENT, i);
      bool isSwing = true;
      for(int j = 1; j <= SwingStrength; j++)
         if(iHigh(_Symbol, PERIOD_CURRENT, i-j) >= high_i || iHigh(_Symbol, PERIOD_CURRENT, i+j) >= high_i)
         { isSwing = false; break; }
      if(isSwing && high_i > price)
      { double dist = high_i - price; if(dist < minDist) { minDist = dist; bestResist = high_i; } }
   }
   return bestResist;
}

double FindSupportAbove(int lookback)
{
   double price = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double best = 0; double minDist = 999999;
   for(int i = SwingStrength + 1; i < lookback; i++)
   {
      double high_i = iHigh(_Symbol, PERIOD_CURRENT, i);
      bool isSwing = true;
      for(int j = 1; j <= SwingStrength; j++)
         if(iHigh(_Symbol, PERIOD_CURRENT, i-j) >= high_i || iHigh(_Symbol, PERIOD_CURRENT, i+j) >= high_i)
         { isSwing = false; break; }
      if(isSwing && high_i > price)
      { double dist = high_i - price; if(dist < minDist) { minDist = dist; best = high_i; } }
   }
   return best;
}

double FindResistanceBelow(int lookback)
{
   double price = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double best = 0; double minDist = 999999;
   for(int i = SwingStrength + 1; i < lookback; i++)
   {
      double low_i = iLow(_Symbol, PERIOD_CURRENT, i);
      bool isSwing = true;
      for(int j = 1; j <= SwingStrength; j++)
         if(iLow(_Symbol, PERIOD_CURRENT, i-j) <= low_i || iLow(_Symbol, PERIOD_CURRENT, i+j) <= low_i)
         { isSwing = false; break; }
      if(isSwing && low_i < price)
      { double dist = price - low_i; if(dist < minDist) { minDist = dist; best = low_i; } }
   }
   return best;
}

bool HasOpenTrade(ulong magic)
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) == _Symbol &&
         PositionGetInteger(POSITION_MAGIC) == (long)magic)
         return true;
   }
   return false;
}

//+------------------------------------------------------------------+
//| Exposure guard (unchanged from v2.00)                              |
//+------------------------------------------------------------------+
string BaseCurrency(string symbol)  { string s = symbol; if(StringLen(s)>6) s=StringSubstr(s,0,6); return StringSubstr(s,0,3); }
string QuoteCurrency(string symbol) { string s = symbol; if(StringLen(s)>6) s=StringSubstr(s,0,6); return StringSubstr(s,3,3); }

int DirectionalCurrencyImpact(string symbol, string currency, ENUM_POSITION_TYPE posType)
{
   string base = BaseCurrency(symbol); string quote = QuoteCurrency(symbol);
   if(currency != base && currency != quote) return 0;
   if(posType == POSITION_TYPE_BUY) return (currency == base) ? 1 : -1;
   return (currency == base) ? -1 : 1;
}

int SignalCurrencyImpact(string symbol, string bias, string currency)
{
   string base = BaseCurrency(symbol); string quote = QuoteCurrency(symbol);
   if(currency != base && currency != quote) return 0;
   if(bias == "BUY") return (currency == base) ? 1 : -1;
   if(bias == "SELL") return (currency == base) ? -1 : 1;
   return 0;
}

void GetCurrencyExposure(string currency, int &total, int &sameDirection, int &oppositeDirection, int newImpact)
{
   total = 0; sameDirection = 0; oppositeDirection = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      string posSymbol = PositionGetString(POSITION_SYMBOL);
      ENUM_POSITION_TYPE posType = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);
      int impact = DirectionalCurrencyImpact(posSymbol, currency, posType);
      if(impact == 0) continue;
      total++;
      if(impact == newImpact) sameDirection++;
      else if(impact == -newImpact) oppositeDirection++;
   }
}

bool ExposureAllowsTrade(string symbol, string bias, string strategyName, PandaSignal &sig)
{
   if(!EnableExposureGuard) return true;
   if(MaxTotalOpenTrades > 0 && PositionsTotal() >= MaxTotalOpenTrades)
   { DebugSkip(strategyName, StringFormat("exposure: max total %d reached", MaxTotalOpenTrades), sig); return false; }

   string base = BaseCurrency(symbol); string quote = QuoteCurrency(symbol);
   string currencies[2] = { base, quote };
   for(int i = 0; i < 2; i++)
   {
      string currency = currencies[i];
      int impact = SignalCurrencyImpact(symbol, bias, currency);
      if(impact == 0) continue;
      int total=0, sameDir=0, oppDir=0;
      GetCurrencyExposure(currency, total, sameDir, oppDir, impact);
      if(MaxTradesPerCurrency > 0 && total >= MaxTradesPerCurrency)
      { DebugSkip(strategyName, StringFormat("exposure: %s has %d, max %d", currency, total, MaxTradesPerCurrency), sig); return false; }
      if(MaxDirectionalTradesPerCurrency > 0 && sameDir >= MaxDirectionalTradesPerCurrency)
      { DebugSkip(strategyName, StringFormat("exposure: %s same-dir %d, max %d", currency, sameDir, MaxDirectionalTradesPerCurrency), sig); return false; }
      if(BlockOppositeCurrencyHedges && oppDir > 0)
      { DebugSkip(strategyName, StringFormat("exposure: %s hedges %d opposite", currency, oppDir), sig); return false; }
   }
   return true;
}

//+------------------------------------------------------------------+
//| Utility functions                                                  |
//+------------------------------------------------------------------+
int GetUAEHour()
{
   MqlDateTime dt;
   datetime uaeTime = TimeGMT() + UAE_Offset * 3600;
   TimeToStruct(uaeTime, dt);
   return dt.hour;
}

double NormPrice(double price)
{ return NormalizeDouble(price, (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS)); }

double DistanceToPips(double distance)
{
   int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   double pipSize = (digits == 3 || digits == 5) ? 10.0 * point : point;
   if(pipSize == 0) return 0;
   return distance / pipSize;
}

int GetSpreadPoints()
{ return (int)SymbolInfoInteger(_Symbol, SYMBOL_SPREAD); }

double GetSuperTrend(int shift)
{
   if(atrHandle == INVALID_HANDLE) return 0;
   double atrBuf[]; ArraySetAsSeries(atrBuf, true);
   if(CopyBuffer(atrHandle, 0, shift, 1, atrBuf) < 1) return 0;
   double atr = atrBuf[0];
   double median = (iHigh(_Symbol, PERIOD_CURRENT, shift) + iLow(_Symbol, PERIOD_CURRENT, shift)) / 2.0;
   double closeVal = iClose(_Symbol, PERIOD_CURRENT, shift);
   if(closeVal > median) return NormPrice(median - IM_SuperTrendMul * atr);
   else return NormPrice(median + IM_SuperTrendMul * atr);
}

//+------------------------------------------------------------------+
//| S/R Level building for PULLBACK                                    |
//+------------------------------------------------------------------+
void AddSRLevel(SRLevel &levels[], int &count, double price, string name, string period)
{
   if(price <= 0) return;
   ArrayResize(levels, count + 1);
   levels[count].price = NormPrice(price);
   levels[count].name = name;
   levels[count].period = period;
   count++;
}

void GetPreviousYearHL(double &yh, double &yl)
{
   yh = 0; yl = DBL_MAX;
   MqlDateTime dt; TimeCurrent(dt);
   int prevYear = dt.year - 1;
   int bars = Bars(_Symbol, PERIOD_MN1);
   int toCopy = MathMin(bars, 24);
   double hBuf[], lBuf[]; datetime tBuf[];
   if(CopyHigh(_Symbol, PERIOD_MN1, 1, toCopy, hBuf) < 1 ||
      CopyLow(_Symbol, PERIOD_MN1, 1, toCopy, lBuf) < 1 ||
      CopyTime(_Symbol, PERIOD_MN1, 1, toCopy, tBuf) < 1)
   { yh = 0; yl = 0; return; }
   for(int k = 0; k < ArraySize(tBuf); k++)
   { MqlDateTime mdt; TimeToStruct(tBuf[k], mdt); if(mdt.year == prevYear) { yh = MathMax(yh, hBuf[k]); yl = MathMin(yl, lBuf[k]); } }
   if(yl == DBL_MAX) { yh = 0; yl = 0; }
}

int BuildSRLevels(SRLevel &levels[])
{
   ArrayResize(levels, 0); double buf[]; int count = 0;
   if(PB_UseDaily)
   { if(CopyHigh(_Symbol, PERIOD_D1, 1, 1, buf) > 0) AddSRLevel(levels, count, buf[0], "PDH", "DAILY");
     if(CopyLow(_Symbol, PERIOD_D1, 1, 1, buf) > 0) AddSRLevel(levels, count, buf[0], "PDL", "DAILY"); }
   if(PB_UseWeekly)
   { if(CopyHigh(_Symbol, PERIOD_W1, 1, 1, buf) > 0) AddSRLevel(levels, count, buf[0], "PWH", "WEEKLY");
     if(CopyLow(_Symbol, PERIOD_W1, 1, 1, buf) > 0) AddSRLevel(levels, count, buf[0], "PWL", "WEEKLY"); }
   if(PB_UseMonthly)
   { if(CopyHigh(_Symbol, PERIOD_MN1, 1, 1, buf) > 0) AddSRLevel(levels, count, buf[0], "PMH", "MONTHLY");
     if(CopyLow(_Symbol, PERIOD_MN1, 1, 1, buf) > 0) AddSRLevel(levels, count, buf[0], "PML", "MONTHLY"); }
   if(PB_UseYearly)
   { double yh=0, yl=0; GetPreviousYearHL(yh, yl); AddSRLevel(levels, count, yh, "PYH", "YEARLY"); AddSRLevel(levels, count, yl, "PYL", "YEARLY"); }
   return count;
}

bool FindNearestSupport(SRLevel &levels[], double price, SRLevel &result)
{ double minDist = DBL_MAX; bool found = false;
  for(int i = 0; i < ArraySize(levels); i++)
    if(levels[i].price < price && price - levels[i].price < minDist)
    { minDist = price - levels[i].price; result = levels[i]; found = true; }
  return found; }

bool FindNearestResistance(SRLevel &levels[], double price, SRLevel &result)
{ double minDist = DBL_MAX; bool found = false;
  for(int i = 0; i < ArraySize(levels); i++)
    if(levels[i].price > price && levels[i].price - price < minDist)
    { minDist = levels[i].price - price; result = levels[i]; found = true; }
  return found; }

bool FindTargetResistance(SRLevel &levels[], double entry, double minPips, SRLevel &result)
{ double minDist = DBL_MAX; bool found = false;
  for(int i = 0; i < ArraySize(levels); i++)
  { if(levels[i].price <= entry) continue; double dist = levels[i].price - entry;
    if(DistanceToPips(dist) < minPips) continue;
    if(dist < minDist) { minDist = dist; result = levels[i]; found = true; } }
  return found; }

bool FindTargetSupport(SRLevel &levels[], double entry, double minPips, SRLevel &result)
{ double minDist = DBL_MAX; bool found = false;
  for(int i = 0; i < ArraySize(levels); i++)
  { if(levels[i].price >= entry) continue; double dist = entry - levels[i].price;
    if(DistanceToPips(dist) < minPips) continue;
    if(dist < minDist) { minDist = dist; result = levels[i]; found = true; } }
  return found; }

//+------------------------------------------------------------------+
//| Execute BB / INTRA trade                                           |
//+------------------------------------------------------------------+
bool ExecuteTrade(ENUM_ORDER_TYPE direction, ulong magic, string strategyName, double rrMultiplier)
{
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   if(GetSpreadPoints() > MaxSpreadPoints) { Print("[PANDA] ", strategyName, " — Spread too high"); return false; }

   trade.SetExpertMagicNumber(magic);
   trade.SetDeviationInPoints(SlippagePoints);
   double sl = 0, tp = 0, entry = 0, slDistance = 0;
   string comment = "Panda_" + strategyName;

   if(direction == ORDER_TYPE_BUY)
   {
      entry = NormPrice(SymbolInfoDouble(_Symbol, SYMBOL_ASK));
      double swingLow = FindSwingLow(SwingLookback, SwingStrength);
      if(swingLow <= 0) { swingLow = FindRecentLow(SwingLookback); Print("[PANDA] ", strategyName, " BUY fallback SL: ", swingLow); }
      if(swingLow <= 0) { Print("[PANDA] ", strategyName, " BUY - No SL"); return false; }
      sl = NormPrice(swingLow - SL_Buffer_Points * point);
      slDistance = entry - sl;
      if(slDistance <= 0) { Print("[PANDA] ", strategyName, " BUY — SL >= entry"); return false; }
      tp = NormPrice(entry + slDistance * rrMultiplier);
      if(!trade.Buy(LotSize, _Symbol, entry, sl, tp, comment))
      { Print("[PANDA] Buy FAIL: ", trade.ResultRetcode(), " ", trade.ResultRetcodeDescription()); return false; }
      Print("[PANDA] ", strategyName, " BUY #", trade.ResultOrder(), " E=", entry, " SL=", sl, " TP=", tp);
      RecordEntry(trade.ResultOrder(), entry, magic);
      return true;
   }
   else
   {
      entry = NormPrice(SymbolInfoDouble(_Symbol, SYMBOL_BID));
      double swingHigh = FindSwingHigh(SwingLookback, SwingStrength);
      if(swingHigh <= 0) { swingHigh = FindRecentHigh(SwingLookback); Print("[PANDA] ", strategyName, " SELL fallback SL: ", swingHigh); }
      if(swingHigh <= 0) { Print("[PANDA] ", strategyName, " SELL - No SL"); return false; }
      sl = NormPrice(swingHigh + SL_Buffer_Points * point);
      slDistance = sl - entry;
      if(slDistance <= 0) { Print("[PANDA] ", strategyName, " SELL — SL <= entry"); return false; }
      tp = NormPrice(entry - slDistance * rrMultiplier);
      if(!trade.Sell(LotSize, _Symbol, entry, sl, tp, comment))
      { Print("[PANDA] Sell FAIL: ", trade.ResultRetcode(), " ", trade.ResultRetcodeDescription()); return false; }
      Print("[PANDA] ", strategyName, " SELL #", trade.ResultOrder(), " E=", entry, " SL=", sl, " TP=", tp);
      RecordEntry(trade.ResultOrder(), entry, magic);
      return true;
   }
}

//+------------------------------------------------------------------+
//| Execute PULLBACK trade                                             |
//+------------------------------------------------------------------+
bool ExecutePullbackTrade(ENUM_ORDER_TYPE direction, PandaSignal &sig)
{
   if(GetSpreadPoints() > MaxSpreadPoints) { DebugSkip("PULLBACK", "spread too high", sig); return false; }
   trade.SetExpertMagicNumber(PB_Magic);
   trade.SetDeviationInPoints(SlippagePoints);

   SRLevel levels[]; int levelCount = BuildSRLevels(levels);
   if(levelCount < 2) { Print("[PANDA] PB - Not enough S/R"); return false; }

   double entry = 0, sl = 0, tp = 0;
   string comment = "Panda_PB";
   int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);

   if(direction == ORDER_TYPE_BUY)
   {
      entry = NormPrice(SymbolInfoDouble(_Symbol, SYMBOL_ASK));
      SRLevel entryLevel;
      if(!FindNearestSupport(levels, entry, entryLevel)) { Print("[PANDA] PB BUY - No support below"); return false; }
      double distPips = DistanceToPips(entry - entryLevel.price);
      if(distPips > PB_ZonePips) { Print("[PANDA] PB BUY - Too far from ", entryLevel.name); return false; }
      SRLevel tpLevel;
      if(!FindTargetResistance(levels, entry, PB_MinTPPips, tpLevel)) { Print("[PANDA] PB BUY - No TP target"); return false; }
      tp = NormPrice(tpLevel.price);
      double tpDistance = tp - entry; if(tpDistance <= 0) return false;
      double tpPips = DistanceToPips(tpDistance);
      double slRatio = 2.0; if(tpPips >= 300) slRatio = 4.0; else if(tpPips >= 200) slRatio = 3.0;
      sl = NormPrice(entry - tpDistance / slRatio);
      Print("[PANDA] PB BUY | Near ", entryLevel.name, " | TP ", tpLevel.name, " | ", DoubleToString(tpPips,1), " pips");
      if(!trade.Buy(LotSize, _Symbol, entry, sl, tp, comment + "_" + entryLevel.name))
      { Print("[PANDA] PB Buy FAIL: ", trade.ResultRetcodeDescription()); return false; }
      Print("[PANDA] PB BUY #", trade.ResultOrder(), " E=", entry, " SL=", sl, " TP=", tp);
      RecordEntry(trade.ResultOrder(), entry, PB_Magic);
      return true;
   }

   entry = NormPrice(SymbolInfoDouble(_Symbol, SYMBOL_BID));
   SRLevel entryLevel;
   if(!FindNearestResistance(levels, entry, entryLevel)) { Print("[PANDA] PB SELL - No resistance above"); return false; }
   double distPips = DistanceToPips(entryLevel.price - entry);
   if(distPips > PB_ZonePips) { Print("[PANDA] PB SELL - Too far from ", entryLevel.name); return false; }
   SRLevel tpLevel;
   if(!FindTargetSupport(levels, entry, PB_MinTPPips, tpLevel)) { Print("[PANDA] PB SELL - No TP target"); return false; }
   tp = NormPrice(tpLevel.price);
   double tpDistance = entry - tp; if(tpDistance <= 0) return false;
   double tpPips = DistanceToPips(tpDistance);
   double slRatio = 2.0; if(tpPips >= 300) slRatio = 4.0; else if(tpPips >= 200) slRatio = 3.0;
   sl = NormPrice(entry + tpDistance / slRatio);
   Print("[PANDA] PB SELL | Near ", entryLevel.name, " | TP ", tpLevel.name, " | ", DoubleToString(tpPips,1), " pips");
   if(!trade.Sell(LotSize, _Symbol, entry, sl, tp, comment + "_" + entryLevel.name))
   { Print("[PANDA] PB Sell FAIL: ", trade.ResultRetcodeDescription()); return false; }
   Print("[PANDA] PB SELL #", trade.ResultOrder(), " E=", entry, " SL=", sl, " TP=", tp);
   RecordEntry(trade.ResultOrder(), entry, PB_Magic);
   return true;
}

//+------------------------------------------------------------------+
//| Execute INTRA MASTER trade                                         |
//+------------------------------------------------------------------+
bool ExecuteIMTrade(ENUM_ORDER_TYPE direction)
{
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   if(GetSpreadPoints() > MaxSpreadPoints) { DebugInfo("IM: spread too high"); return false; }
   trade.SetExpertMagicNumber(IM_Magic);
   trade.SetDeviationInPoints(SlippagePoints);
   double entry = 0, sl = 0;
   string comment = "Panda_IM";

   if(direction == ORDER_TYPE_BUY)
   {
      entry = NormPrice(SymbolInfoDouble(_Symbol, SYMBOL_ASK));
      if(IM_UseSuperTrend)
      {
         double st = GetSuperTrend(1);
         if(st >= entry || st <= 0)
         { double swLow = FindSwingLow(SwingLookback, SwingStrength);
           if(swLow <= 0) swLow = FindRecentLow(SwingLookback);
           if(swLow <= 0) { Print("[PANDA] IM BUY - No SL"); return false; }
           sl = NormPrice(swLow - SL_Buffer_Points * point); }
         else sl = NormPrice(st - IM_ST_Buffer * point);
      }
      else
      { double swLow = FindSwingLow(SwingLookback, SwingStrength);
        if(swLow <= 0) swLow = FindRecentLow(SwingLookback);
        if(swLow <= 0) { Print("[PANDA] IM BUY - No swing low"); return false; }
        sl = NormPrice(swLow - SL_Buffer_Points * point); }
      if(entry - sl <= 0) { Print("[PANDA] IM BUY — SL >= entry"); return false; }
      double safeTP = NormPrice(entry + (entry - sl) * 10);
      if(!trade.Buy(LotSize, _Symbol, entry, sl, safeTP, comment))
      { Print("[PANDA] IM Buy FAIL: ", trade.ResultRetcodeDescription()); return false; }
      Print("[PANDA] IM BUY #", trade.ResultOrder(), " E=", entry, " SL=", sl, " (trail)");
      RecordEntry(trade.ResultOrder(), entry, IM_Magic);
      return true;
   }
   else
   {
      entry = NormPrice(SymbolInfoDouble(_Symbol, SYMBOL_BID));
      if(IM_UseSuperTrend)
      {
         double st = GetSuperTrend(1);
         if(st <= entry || st <= 0)
         { double swHigh = FindSwingHigh(SwingLookback, SwingStrength);
           if(swHigh <= 0) swHigh = FindRecentHigh(SwingLookback);
           if(swHigh <= 0) { Print("[PANDA] IM SELL - No SL"); return false; }
           sl = NormPrice(swHigh + SL_Buffer_Points * point); }
         else sl = NormPrice(st + IM_ST_Buffer * point);
      }
      else
      { double swHigh = FindSwingHigh(SwingLookback, SwingStrength);
        if(swHigh <= 0) swHigh = FindRecentHigh(SwingLookback);
        if(swHigh <= 0) { Print("[PANDA] IM SELL - No swing high"); return false; }
        sl = NormPrice(swHigh + SL_Buffer_Points * point); }
      if(sl - entry <= 0) { Print("[PANDA] IM SELL — SL <= entry"); return false; }
      double safeTP = NormPrice(entry - (sl - entry) * 10);
      if(!trade.Sell(LotSize, _Symbol, entry, sl, safeTP, comment))
      { Print("[PANDA] IM Sell FAIL: ", trade.ResultRetcodeDescription()); return false; }
      Print("[PANDA] IM SELL #", trade.ResultOrder(), " E=", entry, " SL=", sl, " (trail)");
      RecordEntry(trade.ResultOrder(), entry, IM_Magic);
      return true;
   }
}

//+------------------------------------------------------------------+
//| Close trades + INTRA MASTER trailing                               |
//+------------------------------------------------------------------+
void CloseTradesByMagic(ulong magic, string reason)
{
   trade.SetExpertMagicNumber(magic);
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i); if(ticket == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC) != (long)magic) continue;
      if(trade.PositionClose(ticket)) Print("[PANDA] Closed #", ticket, " | ", reason);
      else Print("[PANDA] Close FAIL #", ticket, " Err=", GetLastError());
   }
}

void ManageIMTrailingStop()
{
   if(!EnableIM) return;
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i); if(ticket == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC) != (long)IM_Magic) continue;

      ENUM_POSITION_TYPE posType = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);
      double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      double currentSL = PositionGetDouble(POSITION_SL);
      double currentTP = PositionGetDouble(POSITION_TP);

      if(posType == POSITION_TYPE_BUY)
      {
         double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
         double slDist = openPrice - currentSL;
         double profit = bid - openPrice;
         if(profit >= slDist && currentSL < openPrice)
         { double newSL = NormPrice(openPrice + point);
           if(newSL > currentSL) { trade.PositionModify(ticket, newSL, currentTP); Print("[PANDA] IM #", ticket, " BE"); } }
         else if(currentSL >= openPrice && profit > slDist)
         { double trail = NormPrice(bid - slDist);
           if(trail > currentSL + IM_TrailStep * point) { trade.PositionModify(ticket, trail, currentTP); Print("[PANDA] IM #", ticket, " TRAIL to ", trail); } }
      }
      else
      {
         double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
         double slDist = currentSL - openPrice;
         double profit = openPrice - ask;
         if(profit >= slDist && currentSL > openPrice)
         { double newSL = NormPrice(openPrice - point);
           if(newSL < currentSL) { trade.PositionModify(ticket, newSL, currentTP); Print("[PANDA] IM #", ticket, " BE"); } }
         else if(currentSL <= openPrice && profit > slDist)
         { double trail = NormPrice(ask + slDist);
           if(trail < currentSL - IM_TrailStep * point) { trade.PositionModify(ticket, trail, currentTP); Print("[PANDA] IM #", ticket, " TRAIL to ", trail); } }
      }
   }
}

//+------------------------------------------------------------------+
//| Strategy checks                                                    |
//+------------------------------------------------------------------+
void CheckBBStrategy(PandaSignal &sig)
{
   if(!EnableBB) return;
   if(HasOpenTrade(BB_Magic)) { DebugSkip("BB", "has open trade", sig); return; }
   if(sig.hardInvalid) { DebugSkip("BB", "hard invalid", sig); return; }
   if(MathAbs(sig.gap) < 5) { DebugSkip("BB", "gap<5", sig); return; }
   if(sig.bias != "BUY" && sig.bias != "SELL") { DebugSkip("BB", "no bias", sig); return; }
   if(MinConfluence > 0 && sig.confluence < MinConfluence) { DebugSkip("BB", "low confluence", sig); return; }
   ENUM_ORDER_TYPE dir = (sig.bias == "BUY") ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   if(!ExposureAllowsTrade(_Symbol, sig.bias, "BB", sig)) return;
   ExecuteTrade(dir, BB_Magic, "BB", BB_RR);
}

void CheckINTRAStrategy(PandaSignal &sig)
{
   if(!EnableINTRA) return;
   if(HasOpenTrade(INTRA_Magic)) { DebugSkip("INTRA", "has open trade", sig); return; }
   if(sig.hardInvalid) { DebugSkip("INTRA", "hard invalid", sig); return; }
   if(MathAbs(sig.gap) < 9) { DebugSkip("INTRA", "gap<9", sig); return; }
   if(sig.bias != "BUY" && sig.bias != "SELL") { DebugSkip("INTRA", "no bias", sig); return; }
   if(sig.bias == "BUY" && sig.plZone != "ABOVE") { DebugSkip("INTRA", "BUY needs ABOVE", sig); return; }
   if(sig.bias == "SELL" && sig.plZone != "BELOW") { DebugSkip("INTRA", "SELL needs BELOW", sig); return; }
   int uaeHour = GetUAEHour();
   if(uaeHour < IntraStartHour || uaeHour >= IntraEndHour) { DebugSkip("INTRA", "outside window", sig); return; }
   if(MinConfluence > 0 && sig.confluence < MinConfluence) { DebugSkip("INTRA", "low confluence", sig); return; }
   ENUM_ORDER_TYPE dir = (sig.bias == "BUY") ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   if(!ExposureAllowsTrade(_Symbol, sig.bias, "INTRA", sig)) return;
   ExecuteTrade(dir, INTRA_Magic, "INTRA", INTRA_RR);
}

void CheckINTRAHardClose()
{
   if(!EnableINTRA) return;
   if(GetUAEHour() >= IntraCloseHour && HasOpenTrade(INTRA_Magic))
      CloseTradesByMagic(INTRA_Magic, "INTRA 10AM hard close");
}

void CheckPULLBACKStrategy(PandaSignal &sig)
{
   if(!EnablePULLBACK) return;
   if(HasOpenTrade(PB_Magic)) { DebugSkip("PULLBACK", "has open trade", sig); return; }
   if(sig.hardInvalid) { DebugSkip("PULLBACK", "hard invalid", sig); return; }
   if(MathAbs(sig.gap) < PB_MinGap) { DebugSkip("PULLBACK", "gap below min", sig); return; }
   if(sig.bias != "BUY" && sig.bias != "SELL") { DebugSkip("PULLBACK", "no bias", sig); return; }
   if(MinConfluence > 0 && sig.confluence < MinConfluence) { DebugSkip("PULLBACK", "low confluence", sig); return; }
   ENUM_ORDER_TYPE dir = (sig.bias == "BUY") ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   if(!ExposureAllowsTrade(_Symbol, sig.bias, "PULLBACK", sig)) return;
   ExecutePullbackTrade(dir, sig);
}

void CheckIMStrategy(PandaSignal &sig)
{
   if(!EnableIM) return;
   if(HasOpenTrade(IM_Magic)) { DebugSkip("IM", "has open trade", sig); return; }
   if(sig.hardInvalid) { DebugSkip("IM", "hard invalid", sig); return; }
   if(MathAbs(sig.gap) < 9) { DebugSkip("IM", "gap<9", sig); return; }
   if(sig.bias != "BUY" && sig.bias != "SELL") { DebugSkip("IM", "no bias", sig); return; }
   if(sig.bias == "BUY" && sig.plZone != "ABOVE") { DebugSkip("IM", "BUY needs ABOVE", sig); return; }
   if(sig.bias == "SELL" && sig.plZone != "BELOW") { DebugSkip("IM", "SELL needs BELOW", sig); return; }
   if(MinConfluence > 0 && sig.confluence < MinConfluence) { DebugSkip("IM", "low confluence", sig); return; }
   ENUM_ORDER_TYPE dir = (sig.bias == "BUY") ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   if(!ExposureAllowsTrade(_Symbol, sig.bias, "IM", sig)) return;
   ExecuteIMTrade(dir);
}

//+------------------------------------------------------------------+
//| Dashboard                                                          |
//+------------------------------------------------------------------+
void CreateLabel(string name, int x, int y, int fontSize, color clr)
{
   ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetString(0, name, OBJPROP_FONT, "Consolas");
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, fontSize);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
}

void UpdateDashboard(PandaSignal &sig)
{
   if(!ShowDashboard) return;
   color panelColor = (sig.bias == "BUY") ? clrLime : (sig.bias == "SELL") ? clrRed : clrGray;
   string mainText = StringFormat("PANDA EA v2.10 | %s | Gap:%d | Bias:%s | Zone:%s | Conf:%d",
                                   _Symbol, sig.gap, sig.bias, sig.plZone, sig.confluence);
   ObjectSetString(0, WB_LABEL_MAIN, OBJPROP_TEXT, mainText);
   ObjectSetInteger(0, WB_LABEL_MAIN, OBJPROP_COLOR, panelColor);

   CreateLabel(WB_LABEL_BB, 15, 45, 9, EnableBB ? clrAqua : clrDarkGray);
   ObjectSetString(0, WB_LABEL_BB, OBJPROP_TEXT,
      StringFormat("BB: %s | RR 1:%.0f | Mom: %s",
         EnableBB ? (HasOpenTrade(BB_Magic) ? "ACTIVE" : "WATCHING") : "OFF", BB_RR, sig.momentum));

   CreateLabel(WB_LABEL_INTRA, 15, 62, 9, EnableINTRA ? clrGold : clrDarkGray);
   ObjectSetString(0, WB_LABEL_INTRA, OBJPROP_TEXT,
      StringFormat("INTRA: %s | UAE:%02d | Win %d-%d | Close %dAM",
         EnableINTRA ? (HasOpenTrade(INTRA_Magic) ? "ACTIVE" : "WATCHING") : "OFF",
         GetUAEHour(), IntraStartHour, IntraEndHour, IntraCloseHour));

   CreateLabel(WB_LABEL_PB, 15, 79, 9, EnablePULLBACK ? clrMagenta : clrDarkGray);
   ObjectSetString(0, WB_LABEL_PB, OBJPROP_TEXT,
      StringFormat("PB: %s | Zone %.0f | MinTP %.0f",
         EnablePULLBACK ? (HasOpenTrade(PB_Magic) ? "ACTIVE" : "WATCHING") : "OFF", PB_ZonePips, PB_MinTPPips));

   CreateLabel(WB_LABEL_IM, 15, 96, 9, EnableIM ? clrOrange : clrDarkGray);
   ObjectSetString(0, WB_LABEL_IM, OBJPROP_TEXT,
      StringFormat("IM: %s | SL:%s | Trail:%s",
         EnableIM ? (HasOpenTrade(IM_Magic) ? "ACTIVE" : "WATCHING") : "OFF",
         IM_UseSuperTrend ? "ST" : "Swing", HasOpenTrade(IM_Magic) ? "RUN" : "---"));

   CreateLabel(WB_LABEL_STATUS, 15, 113, 8, clrDarkGray);
   int d = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   ObjectSetString(0, WB_LABEL_STATUS, OBJPROP_TEXT,
      StringFormat("SwLo:%s | SwHi:%s | Lot:%.2f | Box H1:%s H4:%s",
         DoubleToString(FindSwingLow(SwingLookback, SwingStrength), d),
         DoubleToString(FindSwingHigh(SwingLookback, SwingStrength), d),
         LotSize, sig.boxH1, sig.boxH4));
   ChartRedraw(0);
}

//+------------------------------------------------------------------+
//| OnTick                                                             |
//+------------------------------------------------------------------+
void OnTick()
{
   ManageIMTrailingStop();

   static datetime lastCheck = 0;
   if(TimeCurrent() - lastCheck < CheckIntervalSec) return;
   lastCheck = TimeCurrent();

   CheckINTRAHardClose();

   PandaSignal sig;
   if(!ReadPandaSignal(_Symbol, sig))
   {
      DebugInfo("NO SIGNAL FILE");
      if(ShowDashboard)
      { ObjectSetString(0, WB_LABEL_MAIN, OBJPROP_TEXT, "PANDA EA v2.10 WRITEBACK | " + _Symbol + " | NO SIGNAL FILE");
        ObjectSetInteger(0, WB_LABEL_MAIN, OBJPROP_COLOR, clrOrangeRed);
        ChartRedraw(0); }
      return;
   }

   CheckBBStrategy(sig);
   CheckINTRAStrategy(sig);
   CheckPULLBACKStrategy(sig);
   CheckIMStrategy(sig);
   UpdateDashboard(sig);
}
//+------------------------------------------------------------------+
