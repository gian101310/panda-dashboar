//+------------------------------------------------------------------+
//|                                              PandaEngineEA.mq4   |
//|                         Panda Engine Auto-Trader v1.0             |
//|                         Trades BB + INTRA from Engine API         |
//+------------------------------------------------------------------+
#property copyright "Panda Engine"
#property version   "1.00"
#property strict

//+------------------------------------------------------------------+
//| INPUTS                                                            |
//+------------------------------------------------------------------+
extern string  __API__         = "=== API SETTINGS ===";
extern string  ApiUrl          = "https://pandaengine.app/api/data";
extern string  ApiKey          = "";           // Your EA_API_KEY from Vercel env
extern int     PollSeconds     = 300;          // Poll interval (default 5 min = 300)

extern string  __STRATEGY__    = "=== STRATEGY ===";
extern bool    EnableBB        = true;         // Enable BB (Bias Based) strategy
extern bool    EnableINTRA     = true;         // Enable INTRA (Intraday) strategy
extern int     MinGapBB        = 5;            // Min |gap| for BB entry (default 5)
extern int     MinGapINTRA     = 9;            // Min |gap| for INTRA entry (default 9)
extern int     MinConfidence   = 40;           // Min confidence score (0-100) for entry
extern bool    RequireTBG_BB   = false;        // Require TBG confirmation for BB? (engine default: false)
extern bool    RequireBoxAlign = false;        // Require box trend alignment?
extern int     BBExitDrop      = 2;            // BB exit: gap drop from peak (default 2)

extern string  __MOMENTUM__   = "=== MOMENTUM FILTER ===";
extern bool    AllowSTRONG     = true;
extern bool    AllowBUILDING   = true;
extern bool    AllowSPARK      = true;
extern bool    AllowCONSOLIDATING = true;
extern bool    AllowSTABLE     = true;
extern bool    AllowCOOLING    = false;        // Off by default — weakening
extern bool    AllowFADING     = false;        // Off by default — exit territory
extern bool    AllowREVERSING  = false;        // Off by default — counter-trend

extern string  __RISK__       = "=== RISK MANAGEMENT ===";
extern double  LotSize         = 0.01;         // Fixed lot size
extern bool    UseRiskPercent  = false;        // Use % risk instead of fixed lots
extern double  RiskPercent     = 1.0;          // Risk % of balance per trade
extern int     SafetySL_Pips   = 0;            // Safety SL in pips (0 = no SL, engine manages exits)
extern int     SafetyTP_Pips   = 0;            // Safety TP in pips (0 = no TP)
extern int     MaxTradesTotal  = 5;            // Max simultaneous trades
extern int     MaxTradesPerPair= 1;            // Max trades per pair (across strategies)
extern int     Slippage        = 3;            // Max slippage in pips

extern string  __EA__         = "=== EA SETTINGS ===";
extern int     MagicBB        = 88801;         // Magic number for BB trades
extern int     MagicINTRA     = 88802;         // Magic number for INTRA trades
extern bool    ShowDashboard  = true;          // Show on-chart info panel
extern string  SymbolSuffix   = "";            // Broker suffix (e.g., ".m", ".pro", "")

//+------------------------------------------------------------------+
//| GLOBALS                                                           |
//+------------------------------------------------------------------+
// Engine pair list (must match app.py PAIRS)
string EnginePairs[] = {
   "EURUSD","GBPUSD","AUDUSD","NZDUSD","USDCAD","USDCHF","USDJPY",
   "EURJPY","GBPJPY","AUDJPY","NZDJPY","CADJPY","CHFJPY",
   "EURGBP","EURAUD","EURNZD","EURCAD","EURCHF",
   "GBPAUD","GBPNZD","GBPCAD"
};

// Per-pair tracking
double PrevGap[21];
double PeakGap[21];
string LastBias[21];
string LastMomentum[21];
string LastPLZone[21];
int    LastConfidence[21];
string LastBoxH1[21];
string LastBoxH4[21];
double LastStrength[21];
bool   PrevGapLoaded;
datetime LastPoll;
int    TotalPairs;

// Dashboard display
string DashLabel = "PandaEA_";

//+------------------------------------------------------------------+
//| INITIALIZATION                                                    |
//+------------------------------------------------------------------+
int OnInit()
{
   TotalPairs = ArraySize(EnginePairs);
   PrevGapLoaded = false;
   LastPoll = 0;

   for(int i = 0; i < TotalPairs; i++)
   {
      PrevGap[i]        = 0;
      PeakGap[i]        = 0;
      LastBias[i]        = "";
      LastMomentum[i]    = "";
      LastPLZone[i]      = "";
      LastConfidence[i]  = 0;
      LastBoxH1[i]       = "";
      LastBoxH4[i]       = "";
      LastStrength[i]    = 0;
   }

   // Set timer for polling
   EventSetTimer(PollSeconds);

   // Initial poll
   PollEngine();

   if(ShowDashboard) DrawDashboard();

   Print("[PandaEA] Initialized — BB=", EnableBB, " INTRA=", EnableINTRA,
         " Poll=", PollSeconds, "s Pairs=", TotalPairs);
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   // Clean chart objects
   ObjectsDeleteAll(0, DashLabel);
}

//+------------------------------------------------------------------+
//| TIMER — Main polling loop                                         |
//+------------------------------------------------------------------+
void OnTimer()
{
   PollEngine();
   if(ShowDashboard) DrawDashboard();
}

//+------------------------------------------------------------------+
//| POLL ENGINE API                                                   |
//+------------------------------------------------------------------+
void PollEngine()
{
   if(ApiKey == "")
   {
      Print("[PandaEA] ERROR: ApiKey is empty — set your EA_API_KEY");
      return;
   }

   string headers = "Authorization: Bearer " + ApiKey + "\r\n"
                   + "Content-Type: application/json\r\n";
   char   post[];
   char   result[];
   string resultHeaders;

   int timeout = 10000; // 10 second timeout

   ResetLastError();
   int res = WebRequest("GET", ApiUrl, headers, timeout, post, result, resultHeaders);

   if(res != 200)
   {
      int err = GetLastError();
      string body = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
      if(StringLen(body) > 180) body = StringSubstr(body, 0, 180) + "...";

      if(res == -1 && err == 4060)
         Print("[PandaEA] API error: add ", ApiUrl, " to Tools > Options > Expert Advisors > Allow WebRequest URLs");
      else
         Print("[PandaEA] API error: HTTP ", res, " MT4 err=", err, " body=", body);
      Print("[PandaEA] API error: HTTP ", res, " — check URL and key");
      return;
   }

   string json = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);

   if(StringLen(json) < 10)
   {
      Print("[PandaEA] Empty response from API");
      return;
   }

   LastPoll = TimeCurrent();

   // Parse and process each pair
   ProcessApiResponse(json);
}

//+------------------------------------------------------------------+
//| PROCESS API RESPONSE                                              |
//+------------------------------------------------------------------+
void ProcessApiResponse(string json)
{
   // The response is a JSON array of objects
   // We parse each pair object and run entry/exit logic

   for(int i = 0; i < TotalPairs; i++)
   {
      string symbol = EnginePairs[i];

      string obj = "";
      if(!ExtractPairObject(json, symbol, obj)) continue;

      // Extract fields
      double gap          = JsonDouble(obj, "gap");
      bool   hardInvalid  = JsonBool(obj, "hard_invalid");
      string bias         = JsonString(obj, "bias");
      string execution    = JsonString(obj, "execution");
      string confidence   = JsonString(obj, "confidence");
      string momentum     = JsonString(obj, "momentum");
      string plZone       = JsonString(obj, "pl_zone");
      string boxH1        = JsonString(obj, "box_h1_trend");
      string boxH4        = JsonString(obj, "box_h4_trend");
      double strength     = JsonDouble(obj, "strength");
      double deltaShort   = JsonDouble(obj, "delta_short");
      double deltaMid     = JsonDouble(obj, "delta_mid");
      int    baseD1       = (int)JsonDouble(obj, "base_d1");
      int    baseH4       = (int)JsonDouble(obj, "base_h4");
      int    baseH1       = (int)JsonDouble(obj, "base_h1");
      int    quoteD1      = (int)JsonDouble(obj, "quote_d1");
      int    quoteH4      = (int)JsonDouble(obj, "quote_h4");
      int    quoteH1      = (int)JsonDouble(obj, "quote_h1");
      double spread_val   = JsonDouble(obj, "spread");

      // Compute confidence score (mirrors engine logic)
      int confScore = ComputeConfidence(gap, plZone, boxH1, boxH4, momentum,
                                         baseD1, baseH4, baseH1, quoteD1, quoteH4, quoteH1);

      // Store for dashboard
      LastBias[i]       = bias;
      LastMomentum[i]   = momentum;
      LastPLZone[i]     = plZone;
      LastConfidence[i] = confScore;
      LastBoxH1[i]      = boxH1;
      LastBoxH4[i]      = boxH4;
      LastStrength[i]   = strength;

      // ---- EXIT LOGIC (check existing trades first) ----
      CheckExits(i, symbol, gap, momentum, deltaMid);

      // ---- ENTRY LOGIC ----
      if(!hardInvalid && bias != "HARD_INVALID")
      {
         // BB Strategy
         if(EnableBB)
            CheckBBEntry(i, symbol, gap, bias, momentum, plZone, boxH1, boxH4,
                         confScore, baseD1, baseH4, baseH1, quoteD1, quoteH4, quoteH1);

         // INTRA Strategy
         if(EnableINTRA)
            CheckINTRAEntry(i, symbol, gap, bias, momentum, plZone, boxH1, boxH4,
                            confScore);
      }

      // Reset peak if bias flipped (gap crossed zero) — check BEFORE updating PrevGap
      if((PrevGap[i] > 0 && gap < 0) || (PrevGap[i] < 0 && gap > 0))
         PeakGap[i] = 0;

      // Update previous gap AFTER entry check (BB needs crossover detection)
      PrevGap[i] = gap;

      // Track peak for exit logic
      if(MathAbs(gap) > PeakGap[i])
         PeakGap[i] = MathAbs(gap);
   }

   // Pre-load phase: after first successful poll, mark loaded
   if(!PrevGapLoaded)
   {
      PrevGapLoaded = true;
      Print("[PandaEA] Initial gaps loaded — BB crossover detection active next cycle");
   }
}

//+------------------------------------------------------------------+
//| BB ENTRY CHECK                                                    |
//+------------------------------------------------------------------+
void CheckBBEntry(int idx, string symbol, double gap, string bias,
                  string momentum, string plZone, string boxH1, string boxH4,
                  int confScore, int bD1, int bH4, int bH1, int qD1, int qH4, int qH1)
{
   // Must have loaded previous gaps first (prevents phantom signals on restart)
   if(!PrevGapLoaded) return;

   // BB rule: gap crosses from <5 to >=5
   if(MathAbs(PrevGap[idx]) >= MinGapBB) return;  // Was already above threshold
   if(MathAbs(gap) < MinGapBB) return;             // Still below threshold

   // Direction
   string direction = (gap >= MinGapBB) ? "BUY" : "SELL";

   // Neutral matchup filter (both currencies weak = avoid)
   if(IsNeutralMatchup(bD1, bH4, bH1, qD1, qH4, qH1)) return;

   // Confidence filter
   if(confScore < MinConfidence) return;

   // Momentum filter
   if(!IsMomentumAllowed(momentum)) return;

   // TBG filter (optional for BB, off by default)
   if(RequireTBG_BB)
   {
      if(direction == "BUY" && plZone != "ABOVE") return;
      if(direction == "SELL" && plZone != "BELOW") return;
   }

   // Box alignment filter (optional)
   if(RequireBoxAlign)
   {
      if(direction == "BUY" && boxH1 != "UPTREND" && boxH4 != "UPTREND") return;
      if(direction == "SELL" && boxH1 != "DOWNTREND" && boxH4 != "DOWNTREND") return;
   }

   // Duplicate check
   if(CountTrades(symbol, MagicBB) >= MaxTradesPerPair) return;
   if(CountAllTrades() >= MaxTradesTotal) return;

   // ENTRY
   string mt4Symbol = symbol + SymbolSuffix;
   if(!PrepareSymbol(mt4Symbol)) return;

   double lots = CalculateLots(symbol);
   int slip = SlippagePoints(mt4Symbol);

   int ticket = -1;
   if(direction == "BUY")
   {
      double price = NormalizeTradePrice(mt4Symbol, MarketInfo(mt4Symbol, MODE_ASK));
      double sl = (SafetySL_Pips > 0) ? NormalizeTradePrice(mt4Symbol, price - SafetySL_Pips * PipSize(mt4Symbol)) : 0;
      double tp = (SafetyTP_Pips > 0) ? NormalizeTradePrice(mt4Symbol, price + SafetyTP_Pips * PipSize(mt4Symbol)) : 0;
      ticket = OrderSend(mt4Symbol, OP_BUY, lots, price, slip, sl, tp,
                          "PandaBB|" + symbol + "|G" + DoubleToStr(gap,0) + "|C" + IntegerToString(confScore),
                          MagicBB, 0, clrLime);
   }
   else
   {
      double price = NormalizeTradePrice(mt4Symbol, MarketInfo(mt4Symbol, MODE_BID));
      double sl = (SafetySL_Pips > 0) ? NormalizeTradePrice(mt4Symbol, price + SafetySL_Pips * PipSize(mt4Symbol)) : 0;
      double tp = (SafetyTP_Pips > 0) ? NormalizeTradePrice(mt4Symbol, price - SafetyTP_Pips * PipSize(mt4Symbol)) : 0;
      ticket = OrderSend(mt4Symbol, OP_SELL, lots, price, slip, sl, tp,
                          "PandaBB|" + symbol + "|G" + DoubleToStr(gap,0) + "|C" + IntegerToString(confScore),
                          MagicBB, 0, clrRed);
   }

   if(ticket > 0)
   {
      PeakGap[idx] = MathAbs(gap);
      Print("[PandaEA] BB ENTRY: ", symbol, " ", direction, " gap=", gap,
            " conf=", confScore, " mom=", momentum, " ticket=", ticket);
   }
   else
      Print("[PandaEA] BB ORDER FAILED: ", symbol, " err=", GetLastError());
}

//+------------------------------------------------------------------+
//| INTRA ENTRY CHECK                                                 |
//+------------------------------------------------------------------+
void CheckINTRAEntry(int idx, string symbol, double gap, string bias,
                     string momentum, string plZone, string boxH1, string boxH4,
                     int confScore)
{
   // INTRA window: 2AM-4AM UAE = 22:00-00:00 UTC
   datetime now = TimeGMT();
   int hour = TimeHour(now);
   if(hour != 22 && hour != 23) return;

   // Gap must be >= 9
   if(MathAbs(gap) < MinGapINTRA) return;

   // Direction + TBG confirmation (REQUIRED for INTRA)
   string direction = (gap >= MinGapINTRA) ? "BUY" : "SELL";
   if(direction == "BUY" && plZone != "ABOVE") return;
   if(direction == "SELL" && plZone != "BELOW") return;

   // Confidence filter
   if(confScore < MinConfidence) return;

   // Momentum filter
   if(!IsMomentumAllowed(momentum)) return;

   // Duplicate check
   if(CountTrades(symbol, MagicINTRA) >= MaxTradesPerPair) return;
   if(CountAllTrades() >= MaxTradesTotal) return;

   // ENTRY
   string mt4Symbol = symbol + SymbolSuffix;
   if(!PrepareSymbol(mt4Symbol)) return;

   double lots = CalculateLots(symbol);
   int slip = SlippagePoints(mt4Symbol);

   int ticket = -1;
   if(direction == "BUY")
   {
      double price = NormalizeTradePrice(mt4Symbol, MarketInfo(mt4Symbol, MODE_ASK));
      double sl = (SafetySL_Pips > 0) ? NormalizeTradePrice(mt4Symbol, price - SafetySL_Pips * PipSize(mt4Symbol)) : 0;
      double tp = (SafetyTP_Pips > 0) ? NormalizeTradePrice(mt4Symbol, price + SafetyTP_Pips * PipSize(mt4Symbol)) : 0;
      ticket = OrderSend(mt4Symbol, OP_BUY, lots, price, slip, sl, tp,
                          "PandaINTRA|" + symbol + "|G" + DoubleToStr(gap,0),
                          MagicINTRA, 0, clrDeepSkyBlue);
   }
   else
   {
      double price = NormalizeTradePrice(mt4Symbol, MarketInfo(mt4Symbol, MODE_BID));
      double sl = (SafetySL_Pips > 0) ? NormalizeTradePrice(mt4Symbol, price + SafetySL_Pips * PipSize(mt4Symbol)) : 0;
      double tp = (SafetyTP_Pips > 0) ? NormalizeTradePrice(mt4Symbol, price - SafetyTP_Pips * PipSize(mt4Symbol)) : 0;
      ticket = OrderSend(mt4Symbol, OP_SELL, lots, price, slip, sl, tp,
                          "PandaINTRA|" + symbol + "|G" + DoubleToStr(gap,0),
                          MagicINTRA, 0, clrOrangeRed);
   }

   if(ticket > 0)
      Print("[PandaEA] INTRA ENTRY: ", symbol, " ", direction, " gap=", gap,
            " conf=", confScore, " TBG=", plZone, " ticket=", ticket);
   else
      Print("[PandaEA] INTRA ORDER FAILED: ", symbol, " err=", GetLastError());
}

//+------------------------------------------------------------------+
//| EXIT LOGIC                                                        |
//+------------------------------------------------------------------+
void CheckExits(int idx, string symbol, double gap, string momentum, double deltaMid)
{
   string mt4Symbol = symbol + SymbolSuffix;
   datetime now = TimeGMT();
   int hour = TimeHour(now);
   int dow  = TimeDayOfWeek(now); // 0=Sun, 5=Fri

   // Friday 7PM UTC = 3PM EST = weekend close
   bool isFridayClose = (dow == 5 && hour >= 19);

   for(int j = OrdersTotal() - 1; j >= 0; j--)
   {
      if(!OrderSelect(j, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderSymbol() != mt4Symbol) continue;

      int magic = OrderMagicNumber();
      if(magic != MagicBB && magic != MagicINTRA) continue;

      string exitReason = "";

      // ---- INTRA EXIT: 10AM UAE = 6AM UTC ----
      if(magic == MagicINTRA)
      {
         // Hard close if we're past 6AM UTC and before 22:00 UTC (next entry window)
         if(hour >= 6 && hour < 22)
            exitReason = "INTRA_10AM_CLOSE";
      }

      // ---- BB EXIT ----
      if(magic == MagicBB)
      {
         // Bias flip: gap dropped below 5
         if(MathAbs(gap) < 5)
            exitReason = "BIAS_FLIP";

         // Momentum loss: gap dropped 2+ from peak
         double dropFromPeak = PeakGap[idx] - MathAbs(gap);
         if(dropFromPeak >= BBExitDrop && exitReason == "")
            exitReason = "MOMENTUM_LOSS";
      }

      // ---- BOTH: Weekend close ----
      if(isFridayClose && exitReason == "")
         exitReason = "WEEKEND_CLOSE";

      // Execute close
      if(exitReason != "")
      {
         if(!PrepareSymbol(mt4Symbol)) continue;

         double closePrice;
         if(OrderType() == OP_BUY)
            closePrice = NormalizeTradePrice(mt4Symbol, MarketInfo(mt4Symbol, MODE_BID));
         else
            closePrice = NormalizeTradePrice(mt4Symbol, MarketInfo(mt4Symbol, MODE_ASK));

         bool closed = OrderClose(OrderTicket(), OrderLots(), closePrice, SlippagePoints(mt4Symbol), clrYellow);

         if(closed)
         {
            double pips = 0;
            if(OrderType() == OP_BUY)
               pips = (closePrice - OrderOpenPrice()) / PipSize(mt4Symbol);
            else
               pips = (OrderOpenPrice() - closePrice) / PipSize(mt4Symbol);

            Print("[PandaEA] EXIT ", (magic == MagicBB ? "BB" : "INTRA"), ": ",
                  symbol, " | ", exitReason, " | ", DoubleToStr(pips, 1), " pips | ticket=", OrderTicket());

            // Reset peak after close — fresh tracking for next trade
            PeakGap[idx] = 0;
         }
         else
            Print("[PandaEA] CLOSE FAILED: ", symbol, " err=", GetLastError());
      }
   }
}

//+------------------------------------------------------------------+
//| CONFIDENCE SCORER (mirrors engine compute_signal_confidence)      |
//+------------------------------------------------------------------+
int ComputeConfidence(double gap, string plZone, string boxH1, string boxH4,
                      string momentum, int bD1, int bH4, int bH1, int qD1, int qH4, int qH1)
{
   int pts = 0;
   double ag = MathAbs(gap);

   // Gap magnitude: 0-30 pts
   if(ag >= 15)      pts += 30;
   else if(ag >= 12) pts += 25;
   else if(ag >= 10) pts += 22;
   else if(ag >= 9)  pts += 20;
   else if(ag >= 7)  pts += 15;
   else if(ag >= 5)  pts += 10;

   // TBG zone confirmation: 0-20 pts
   string direction = (gap >= 5) ? "BUY" : (gap <= -5) ? "SELL" : "WAIT";
   if((direction == "BUY" && plZone == "ABOVE") || (direction == "SELL" && plZone == "BELOW"))
      pts += 20;

   // Box structure alignment: 0-20 pts
   if(direction == "BUY")
   {
      if(boxH1 == "UPTREND")   pts += 10;
      if(boxH4 == "UPTREND")   pts += 10;
   }
   else if(direction == "SELL")
   {
      if(boxH1 == "DOWNTREND") pts += 10;
      if(boxH4 == "DOWNTREND") pts += 10;
   }

   // Momentum quality: 0-10 pts
   if(momentum == "STRONG")            pts += 10;
   else if(momentum == "BUILDING")     pts += 8;
   else if(momentum == "SPARK")        pts += 6;
   else if(momentum == "CONSOLIDATING" || momentum == "STABLE") pts += 3;

   if(pts > 100) pts = 100;
   return pts;
}

//+------------------------------------------------------------------+
//| HELPER: Neutral matchup check                                     |
//+------------------------------------------------------------------+
bool IsNeutralMatchup(int bD1, int bH4, int bH1, int qD1, int qH4, int qH1)
{
   // Check if strongest base and quote scores are both < 4 (NEUTRAL range)
   int baseMax = MathMax(MathMax(MathAbs(bD1), MathAbs(bH4)), MathAbs(bH1));
   int quoteMax = MathMax(MathMax(MathAbs(qD1), MathAbs(qH4)), MathAbs(qH1));
   return (baseMax < 4 && quoteMax < 4);
}

//+------------------------------------------------------------------+
//| HELPER: Momentum allowed?                                         |
//+------------------------------------------------------------------+
bool IsMomentumAllowed(string mom)
{
   if(mom == "STRONG"        && AllowSTRONG)        return true;
   if(mom == "BUILDING"      && AllowBUILDING)      return true;
   if(mom == "SPARK"         && AllowSPARK)         return true;
   if(mom == "CONSOLIDATING" && AllowCONSOLIDATING) return true;
   if(mom == "STABLE"        && AllowSTABLE)        return true;
   if(mom == "COOLING"       && AllowCOOLING)       return true;
   if(mom == "FADING"        && AllowFADING)        return true;
   if(mom == "REVERSING"     && AllowREVERSING)     return true;
   if(mom == "NEUTRAL")      return true; // Always allow NEUTRAL (no momentum data yet)
   return false;
}

//+------------------------------------------------------------------+
//| HELPER: Count trades for a symbol + magic                         |
//+------------------------------------------------------------------+
int CountTrades(string symbol, int magic)
{
   string mt4Symbol = symbol + SymbolSuffix;
   int count = 0;
   for(int i = 0; i < OrdersTotal(); i++)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderSymbol() == mt4Symbol && OrderMagicNumber() == magic)
         count++;
   }
   return count;
}

int CountAllTrades()
{
   int count = 0;
   for(int i = 0; i < OrdersTotal(); i++)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      int m = OrderMagicNumber();
      if(m == MagicBB || m == MagicINTRA)
         count++;
   }
   return count;
}

//+------------------------------------------------------------------+
//| HELPER: Pip size for a symbol                                     |
//+------------------------------------------------------------------+
double PipSize(string sym)
{
   if(StringFind(sym, "JPY") >= 0) return 0.01;
   return 0.0001;
}

bool PrepareSymbol(string sym)
{
   if(!SymbolSelect(sym, true))
   {
      Print("[PandaEA] Symbol not available: ", sym, " err=", GetLastError());
      return false;
   }

   RefreshRates();
   double bid = MarketInfo(sym, MODE_BID);
   double ask = MarketInfo(sym, MODE_ASK);
   if(bid <= 0 || ask <= 0)
   {
      Print("[PandaEA] No broker price for ", sym, " bid=", bid, " ask=", ask);
      return false;
   }

   return true;
}

double NormalizeTradePrice(string sym, double price)
{
   if(price <= 0) return 0;
   int digits = (int)MarketInfo(sym, MODE_DIGITS);
   return NormalizeDouble(price, digits);
}

int SlippagePoints(string sym)
{
   int digits = (int)MarketInfo(sym, MODE_DIGITS);
   int multiplier = (digits == 3 || digits == 5) ? 10 : 1;
   return Slippage * multiplier;
}

double NormalizeLots(string sym, double lots)
{
   double minLot  = MarketInfo(sym, MODE_MINLOT);
   double maxLot  = MarketInfo(sym, MODE_MAXLOT);
   double lotStep = MarketInfo(sym, MODE_LOTSTEP);

   if(minLot <= 0) minLot = 0.01;
   if(maxLot <= 0) maxLot = lots;
   if(lotStep <= 0) lotStep = minLot;

   lots = MathFloor(lots / lotStep) * lotStep;
   if(lots < minLot) lots = minLot;
   if(lots > maxLot) lots = maxLot;

   return NormalizeDouble(lots, 2);
}

//+------------------------------------------------------------------+
//| HELPER: Calculate lot size                                        |
//+------------------------------------------------------------------+
double CalculateLots(string symbol)
{
   string mt4Symbol = symbol + SymbolSuffix;
   if(!UseRiskPercent) return NormalizeLots(mt4Symbol, LotSize);

   double balance = AccountBalance();
   double riskAmount = balance * RiskPercent / 100.0;

   // If no SL, use a default 50 pip risk estimate
   double slPips = (SafetySL_Pips > 0) ? SafetySL_Pips : 50;
   double tickSize = MarketInfo(mt4Symbol, MODE_TICKSIZE);
   double tickValue = MarketInfo(mt4Symbol, MODE_TICKVALUE);
   if(tickSize <= 0 || tickValue <= 0) return NormalizeLots(mt4Symbol, LotSize);

   double pipValue = tickValue / tickSize * PipSize(mt4Symbol);

   if(pipValue <= 0) return NormalizeLots(mt4Symbol, LotSize); // Fallback

   double lots = riskAmount / (slPips * pipValue);

   return NormalizeLots(mt4Symbol, lots);
}

//+------------------------------------------------------------------+
//| JSON PARSING HELPERS (lightweight, no external libs)              |
//+------------------------------------------------------------------+
bool ExtractPairObject(string json, string symbol, string &obj)
{
   int idx = StringFind(json, "\"" + symbol + "\"", 0);
   if(idx < 0) return false;

   int objStart = idx;
   while(objStart > 0 && StringGetCharacter(json, objStart) != '{') objStart--;
   if(StringGetCharacter(json, objStart) != '{') return false;

   int objEnd = objStart;
   int braceDepth = 0;
   bool inString = false;
   int len = StringLen(json);

   for(int j = objStart; j < len; j++)
   {
      ushort c = StringGetCharacter(json, j);
      ushort prev = (j > 0) ? StringGetCharacter(json, j - 1) : 0;

      if(c == '"' && prev != '\\') inString = !inString;
      if(inString) continue;

      if(c == '{') braceDepth++;
      if(c == '}')
      {
         braceDepth--;
         if(braceDepth == 0)
         {
            objEnd = j;
            obj = StringSubstr(json, objStart, objEnd - objStart + 1);
            return (JsonString(obj, "symbol") == symbol);
         }
      }
   }

   return false;
}

string JsonString(string json, string key)
{
   string search = "\"" + key + "\"";
   int idx = StringFind(json, search, 0);
   if(idx < 0) return "";

   int colon = idx + StringLen(search);
   while(colon < StringLen(json) && StringGetCharacter(json, colon) == ' ') colon++;
   if(colon >= StringLen(json) || StringGetCharacter(json, colon) != ':') return "";

   int valStart = colon + 1;

   // Skip whitespace
   while(valStart < StringLen(json))
   {
      ushort ws = StringGetCharacter(json, valStart);
      if(ws != ' ' && ws != '\r' && ws != '\n' && ws != '\t') break;
      valStart++;
   }

   // Check for null
   if(StringSubstr(json, valStart, 4) == "null") return "";

   // Check for quoted string
   if(StringGetCharacter(json, valStart) == '"')
   {
      valStart++;
      int valEnd = StringFind(json, "\"", valStart);
      if(valEnd < 0) return "";
      return StringSubstr(json, valStart, valEnd - valStart);
   }

   // Unquoted value (number/bool) — return as string
   int valEnd = valStart;
   while(valEnd < StringLen(json))
   {
      ushort c = StringGetCharacter(json, valEnd);
      if(c == ',' || c == '}' || c == ']') break;
      valEnd++;
   }
   return StringSubstr(json, valStart, valEnd - valStart);
}

double JsonDouble(string json, string key)
{
   string val = JsonString(json, key);
   if(val == "" || val == "null") return 0;
   return StringToDouble(val);
}

bool JsonBool(string json, string key)
{
   string val = JsonString(json, key);
   return (val == "true");
}

//+------------------------------------------------------------------+
//| ON-CHART DASHBOARD                                                |
//+------------------------------------------------------------------+
void DrawDashboard()
{
   int x = 10, y = 30;
   int lineH = 16;

   // Header
   CreateLabel(DashLabel + "hdr", x, y, "PANDA ENGINE EA v1.0", clrGold, 10);
   y += lineH + 4;

   // Status
   string status = "OFFLINE";
   color statusClr = clrRed;
   if(LastPoll > 0 && TimeCurrent() - LastPoll < PollSeconds * 3)
   {
      status = "LIVE";
      statusClr = clrLime;
   }
   CreateLabel(DashLabel + "status", x, y,
      "Status: " + status + "  |  Trades: " + IntegerToString(CountAllTrades()) + "/" + IntegerToString(MaxTradesTotal)
      + "  |  BB=" + (EnableBB ? "ON" : "OFF") + " INTRA=" + (EnableINTRA ? "ON" : "OFF"),
      statusClr, 8);
   y += lineH + 2;

   string lastPollStr = (LastPoll > 0) ? TimeToStr(LastPoll, TIME_MINUTES) : "never";
   CreateLabel(DashLabel + "poll", x, y, "Last poll: " + lastPollStr, clrSilver, 8);
   y += lineH + 6;

   // Pair list — only show active (gap >= 5)
   CreateLabel(DashLabel + "colhdr", x, y,
      "PAIR       GAP  BIAS     MOM          CONF  TBG      BOX", clrDarkGray, 8);
   y += lineH;

   int shown = 0;
   for(int i = 0; i < TotalPairs && shown < 12; i++)
   {
      if(MathAbs(PrevGap[i]) < 3 && LastBias[i] != "BUY" && LastBias[i] != "SELL") continue;

      string gapStr  = DoubleToStr(PrevGap[i], 0);
      string confStr = IntegerToString(LastConfidence[i]);

      // Pad for alignment
      string line = StringFormat("%-10s %+3s  %-8s %-12s %3s   %-8s %s/%s",
                                  EnginePairs[i], gapStr, LastBias[i], LastMomentum[i],
                                  confStr, LastPLZone[i], LastBoxH1[i], LastBoxH4[i]);

      color lineClr = clrGray;
      if(LastBias[i] == "BUY")  lineClr = clrLime;
      if(LastBias[i] == "SELL") lineClr = clrTomato;
      if(MathAbs(PrevGap[i]) >= 9) lineClr = (LastBias[i] == "BUY") ? clrAqua : clrOrangeRed;

      // Highlight if we have a trade
      if(CountTrades(EnginePairs[i], MagicBB) > 0 || CountTrades(EnginePairs[i], MagicINTRA) > 0)
         lineClr = clrGold;

      CreateLabel(DashLabel + "p" + IntegerToString(i), x, y, line, lineClr, 8);
      y += lineH;
      shown++;
   }
}

void CreateLabel(string name, int x, int y, string text, color clr, int fontSize)
{
   if(ObjectFind(0, name) < 0)
   {
      ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetString(0, name, OBJPROP_FONT, "Consolas");
   }
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, fontSize);
}

//+------------------------------------------------------------------+
//| TICK HANDLER (not used for logic, just keeps chart alive)         |
//+------------------------------------------------------------------+
void OnTick()
{
   // All logic runs on timer, not tick
   // But we use tick to refresh dashboard display
   if(ShowDashboard) DrawDashboard();
}
//+------------------------------------------------------------------+
