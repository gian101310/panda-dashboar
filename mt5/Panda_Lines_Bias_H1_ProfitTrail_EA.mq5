//+------------------------------------------------------------------+
//| Panda Lines + valid Panda bias, H1 profit protection              |
//| Requires Panda Lines v4.1 MT5.ex5 in MQL5\Indicators             |
//| Requires current panda_score_<PAIR>.txt in Terminal\Common\Files |
//+------------------------------------------------------------------+
#property copyright "Panda Engine"
#property version   "1.21"
#property strict
#property tester_indicator "Panda Lines v4.1 MT5.ex5"

#include <Trade/Trade.mqh>

input int      InpSTPeriod       = 10;
input double   InpSTMultiplier   = 3.0;
input bool     InpSTUseATR       = true;
input bool     InpSTShowSignals  = false; // Keep the debugging chart to Panda Lines only
input double   InpLots          = 0.01;
input double   InpEntryBufferPips = 10.0; // Initial entry; reentry uses no fixed buffer
input double   InpCostCushionPips = 2.0;  // Extra cushion beyond estimated round-trip costs
input int      InpSwingStrength  = 2;     // Closed H1 bars on each side of a swing
input int      InpSwingLookback  = 40;    // Closed H1 bars to search
input double   InpSwingBufferPips = 2.0;  // Space beyond the latest confirmed H1 swing
input double   InpPipSize       = 0.0;    // 0 = forex digits rule; set explicitly for gold/indices
input int      InpMaxBiasAgeMin = 20;
input int      InpConfirmMinGapMin = 4;  // Distinct engine updates must be about one cycle apart
input int      InpConfirmMaxGapMin = 8;
input double   InpBasketPips    = 200.0;  // Sum of open pips across this EA's positions
input double   InpBasketUSD     = 20.0;   // Sum of open profit, USD account required
input ulong    InpMagic         = 990144;  // Separate from the original EA
input int      InpDeviationPts  = 30;

CTrade trade;
int g_st = INVALID_HANDLE;
bool g_overlayAdded = false;
int g_candidateBias = 0;
int g_confirmedBias = 0;
datetime g_candidateWrite = 0;
datetime g_lastBiasWrite = 0;

string Trim(string s)
{
   StringTrimLeft(s);
   StringTrimRight(s);
   return s;
}

string CleanSymbol()
{
   string s = _Symbol;
   StringToUpper(s);
   string out = "";
   for(int i=0; i<StringLen(s) && StringLen(out)<6; i++)
   {
      ushort ch = StringGetCharacter(s,i);
      if(ch>=65 && ch<=90) out += ShortToString(ch);
   }
   return out;
}

double PipSize()
{
   if(InpPipSize>0.0) return InpPipSize;
   int digits = (int)SymbolInfoInteger(_Symbol,SYMBOL_DIGITS);
   return _Point * ((digits==3 || digits==5) ? 10.0 : 1.0);
}

double PipSizeForSymbol(const string symbol)
{
   if(symbol==_Symbol) return PipSize();
   double point=SymbolInfoDouble(symbol,SYMBOL_POINT);
   int digits=(int)SymbolInfoInteger(symbol,SYMBOL_DIGITS);
   return point*((digits==3 || digits==5) ? 10.0 : 1.0);
}

int DubaiDay()
{
   MqlDateTime d;
   TimeToStruct(TimeGMT()+4*3600,d);
   return d.year*10000+d.mon*100+d.day;
}

// A new Dubai trading day opens at 02:00. Once that time has passed,
// aligned entries and re-entries remain eligible for the rest of that day.
bool EntrySessionOpen()
{
   MqlDateTime d;
   TimeToStruct(TimeGMT()+4*3600,d);
   return d.hour>=2;
}

string DailyLockName()
{
   return "PandaST.Day."+IntegerToString((long)AccountInfoInteger(ACCOUNT_LOGIN))+"."+
          IntegerToString((long)InpMagic);
}

bool DailyLocked()
{
   string key=DailyLockName();
   return GlobalVariableCheck(key) && (int)GlobalVariableGet(key)==DubaiDay();
}

void CloseEAPositions()
{
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket)) continue;
      if((ulong)PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      string symbol=PositionGetString(POSITION_SYMBOL);
      trade.SetTypeFillingBySymbol(symbol);
      bool sent=trade.PositionClose(ticket,(ulong)InpDeviationPts);
      uint rc=trade.ResultRetcode();
      if(!sent || (rc!=TRADE_RETCODE_DONE && rc!=TRADE_RETCODE_DONE_PARTIAL))
         PrintFormat("Panda daily basket close failed %s ticket=%I64u retcode=%u %s",
                     symbol,ticket,rc,trade.ResultRetcodeDescription());
   }
   trade.SetTypeFillingBySymbol(_Symbol);
}

// Any chart running this EA can trigger the shared basket close.
// The terminal global variable persists the Dubai-day lock across restarts.
bool CheckBasketAndDailyLock()
{
   if(DailyLocked())
   { CloseEAPositions(); return true; }
   double pips=0.0,usd=0.0;
   int count=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket)) continue;
      if((ulong)PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      string symbol=PositionGetString(POSITION_SYMBOL);
      MqlTick quote;
      if(!SymbolInfoTick(symbol,quote)) return true; // pause entries on incomplete basket data
      double pip=PipSizeForSymbol(symbol);
      if(pip<=0.0) return true;
      double entry=PositionGetDouble(POSITION_PRICE_OPEN);
      int dir=PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY ? 1 : -1;
      pips+=(dir==1 ? quote.bid-entry : entry-quote.ask)/pip;
      usd+=PositionGetDouble(POSITION_PROFIT);
      count++;
   }
   if(count==0 || (pips<InpBasketPips && usd<InpBasketUSD)) return false;
   string key=DailyLockName();
   if(GlobalVariableSet(key,(double)DubaiDay())==0)
   {
      Print("Panda basket target met but daily lock could not be saved; entries paused.");
      return true;
   }
   PrintFormat("Panda daily basket reached: %.1f pips, %.2f USD. Closing EA positions.",
               pips,usd);
   CloseEAPositions();
   return true;
}

bool LineSet(const double v)
{
   return MathIsValidNumber(v) && v!=EMPTY_VALUE && v>0.0;
}

bool ReadST(const int shift,double &bull,double &bear)
{
   double b[1],s[1];
   if(CopyBuffer(g_st,0,shift,1,b)!=1 || CopyBuffer(g_st,1,shift,1,s)!=1)
      return false;
   bull=b[0]; bear=s[0];
   return true;
}

// Both published Panda Lines plots must agree and be on the correct side of price.
// Use the last closed bar for indicator confirmation, then check the live quote.
bool ReadAlignment(const MqlTick &tick,const double entryBufferPips,
                   int &direction,double &stLine)
{
   direction=0; stLine=0.0;
   double stBull,stBear,bbBull[1],bbBear[1];
   if(!ReadST(1,stBull,stBear) ||
      CopyBuffer(g_st,2,1,1,bbBull)!=1 ||
      CopyBuffer(g_st,3,1,1,bbBear)!=1) return false;
   double close1=iClose(_Symbol,_Period,1);
   if(close1<=0.0) return false;
   double buffer=entryBufferPips*PipSize();
   // Skip plot joins where both colors appear on the same bar.
   if(LineSet(stBull) && !LineSet(stBear) && LineSet(bbBull[0]) &&
      !LineSet(bbBear[0]) && close1>=stBull+buffer && close1>=bbBull[0]+buffer &&
      tick.bid>=stBull+buffer && tick.bid>=bbBull[0]+buffer)
   { direction=1; stLine=stBull; }
   else if(LineSet(stBear) && !LineSet(stBull) && LineSet(bbBear[0]) &&
           !LineSet(bbBull[0]) && close1<=stBear-buffer && close1<=bbBear[0]-buffer &&
           tick.ask<=stBear-buffer && tick.ask<=bbBear[0]-buffer)
   { direction=-1; stLine=stBear; }
   return true;
}

// Read only engine-produced fields. Missing, stale or inconsistent data blocks entry.
bool ReadValidBias(int &direction,datetime &written)
{
   direction=0; written=0;
   string name="panda_score_"+CleanSymbol()+".txt";
   int h=FileOpen(name,FILE_READ|FILE_TXT|FILE_COMMON|FILE_ANSI|FILE_SHARE_READ|FILE_SHARE_WRITE);
   if(h==INVALID_HANDLE) return false;
   string bias="",invalid="",stamp="";
   int gap=0;
   bool hasGap=false;
   while(!FileIsEnding(h))
   {
      string row=FileReadString(h);
      int sep=StringFind(row,":");
      if(sep<0) continue;
      string key=Trim(StringSubstr(row,0,sep));
      string val=Trim(StringSubstr(row,sep+1));
      if(key=="BIAS") bias=val;
      else if(key=="GAP") { gap=(int)StringToInteger(val); hasGap=true; }
      else if(key=="HARD_INVALID") invalid=val;
      else if(key=="WRITE_TIME") stamp=val;
   }
   FileClose(h);
   if(!hasGap || invalid!="0" || StringLen(stamp)<20) return false;
   // Engine WRITE_TIME is UTC ISO 8601 (YYYY-MM-DDTHH:MM:SSZ).
   if(StringSubstr(stamp,10,1)!="T" || StringSubstr(stamp,19,1)!="Z") return false;
   string parsed=StringSubstr(stamp,0,19);
   StringReplace(parsed,"-",".");
   StringReplace(parsed,"T"," ");
   written=StringToTime(parsed);
   long age=(long)(TimeGMT()-written);
   if(written<=0 || age<0 || age>(long)InpMaxBiasAgeMin*60) return false;
   if(bias=="BUY" && gap>=5) direction=1;
   else if(bias=="SELL" && gap<=-5) direction=-1;
   return direction!=0;
}

void ResetBiasConfirmation()
{
   g_candidateBias=0;
   g_confirmedBias=0;
   g_candidateWrite=0;
   g_lastBiasWrite=0;
}

// Confirm the same engine direction in two distinct, normally spaced writes.
// The 2-second timer observes file updates even when this chart has no ticks.
bool ConfirmedBias(int &direction)
{
   direction=0;
   int latest;
   datetime written;
   if(!ReadValidBias(latest,written))
   { ResetBiasConfirmation(); return false; }
   if(written==g_lastBiasWrite)
   {
      direction=g_confirmedBias;
      return direction==latest && direction!=0;
   }
   long step=(long)(written-g_lastBiasWrite);
   if(g_candidateBias!=latest || g_lastBiasWrite==0 || step<=0 ||
      step>(long)InpConfirmMaxGapMin*60)
   {
      g_candidateBias=latest;
      g_confirmedBias=0;
      g_candidateWrite=written;
      g_lastBiasWrite=written;
      return false;
   }
   g_lastBiasWrite=written;
   long elapsed=(long)(written-g_candidateWrite);
   if(g_confirmedBias==0 && elapsed>=(long)InpConfirmMinGapMin*60)
   {
      g_confirmedBias=latest;
      PrintFormat("Panda bias confirmed by two engine writes: %s at %s",
                  latest==1?"BUY":"SELL",TimeToString(written,TIME_DATE|TIME_SECONDS));
   }
   direction=g_confirmedBias;
   return direction==latest && direction!=0;
}

void ShowBiasOnChart(const bool dailyLocked)
{
   int latest;
   datetime written;
   string status="WAITING FOR VALID ENGINE BIAS";
   if(ReadValidBias(latest,written))
   {
      string side=(latest==1 ? "BUY" : "SELL");
      status=side+(g_confirmedBias==latest ? " (CONFIRMED)" : " (WAITING FOR SECOND WRITE)");
   }
   if(dailyLocked) status+=" | DAILY BASKET LOCK";
   else if(!EntrySessionOpen()) status+=" | ENTRIES WAIT UNTIL 02:00 DUBAI";
   Comment("Panda H1 Profit Trail | Engine bias: ",status);
}

bool AnySymbolPosition()
{
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket>0 && PositionSelectByTicket(ticket) && PositionGetString(POSITION_SYMBOL)==_Symbol)
         return true;
   }
   return false;
}

bool ValidVolume()
{
   double min=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN);
   double max=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MAX);
   double step=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_STEP);
   if(step<=0.0 || InpLots<min || InpLots>max) return false;
   double steps=InpLots/step;
   return MathAbs(steps-MathRound(steps))<1e-7;
}

bool StopAllowed(const int dir,const double sl,const MqlTick &tick,const bool modifying)
{
   long stops=SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL);
   long freeze=modifying ? SymbolInfoInteger(_Symbol,SYMBOL_TRADE_FREEZE_LEVEL) : 0;
   double minDistance=(double)MathMax(stops,freeze)*_Point;
   if(dir==1) return sl>0.0 && sl<tick.bid-minDistance;
   return sl>tick.ask+minDistance;
}

string LastExitKey()
{
   return "PandaH1.Exit."+IntegerToString((long)AccountInfoInteger(ACCOUNT_LOGIN))+"."+
          _Symbol+"."+IntegerToString((long)InpMagic);
}

void RestoreLastExit()
{
   datetime latest=GlobalVariableCheck(LastExitKey()) ?
                   (datetime)GlobalVariableGet(LastExitKey()) : 0;
   datetime now=TimeCurrent();
   if(now<=0 || !HistorySelect(now-90*86400,now)) return;
   for(int i=0;i<HistoryDealsTotal();i++)
   {
      ulong deal=HistoryDealGetTicket(i);
      if(deal==0 || HistoryDealGetString(deal,DEAL_SYMBOL)!=_Symbol ||
         (ulong)HistoryDealGetInteger(deal,DEAL_MAGIC)!=InpMagic) continue;
      ENUM_DEAL_ENTRY entry=(ENUM_DEAL_ENTRY)HistoryDealGetInteger(deal,DEAL_ENTRY);
      if(entry!=DEAL_ENTRY_OUT && entry!=DEAL_ENTRY_OUT_BY) continue;
      datetime closed=(datetime)HistoryDealGetInteger(deal,DEAL_TIME);
      if(closed>latest) latest=closed;
   }
   if(latest>0) GlobalVariableSet(LastExitKey(),(double)latest);
}

string ArmedKey(const ulong positionId)
{
   return "PandaH1.Armed."+IntegerToString((long)AccountInfoInteger(ACCOUNT_LOGIN))+"."+
          _Symbol+"."+IntegerToString((long)InpMagic)+"."+IntegerToString((long)positionId);
}

double ConfirmedH1Swing(const int dir)
{
   if(Bars(_Symbol,PERIOD_H1)<InpSwingLookback+InpSwingStrength+2) return 0.0;
   for(int i=InpSwingStrength+1;i<=InpSwingLookback;i++)
   {
      double pivot=(dir==1) ? iLow(_Symbol,PERIOD_H1,i) : iHigh(_Symbol,PERIOD_H1,i);
      if(pivot<=0.0) continue;
      bool confirmed=true;
      for(int j=1;j<=InpSwingStrength;j++)
      {
         double newer=(dir==1) ? iLow(_Symbol,PERIOD_H1,i-j) : iHigh(_Symbol,PERIOD_H1,i-j);
         double older=(dir==1) ? iLow(_Symbol,PERIOD_H1,i+j) : iHigh(_Symbol,PERIOD_H1,i+j);
         if(newer<=0.0 || older<=0.0 ||
            (dir==1 && (newer<=pivot || older<=pivot)) ||
            (dir==-1 && (newer>=pivot || older>=pivot)))
         { confirmed=false; break; }
      }
      if(confirmed) return pivot;
   }
   return 0.0;
}

double EntryCostUSD(const ulong positionId)
{
   static ulong cachedId=0;
   static double cachedCost=0.0;
   if(cachedId==positionId) return cachedCost;
   if(!HistorySelectByPosition(positionId)) return -1.0;
   double paid=0.0;
   bool foundEntry=false;
   for(int i=0;i<HistoryDealsTotal();i++)
   {
      ulong deal=HistoryDealGetTicket(i);
      if(deal==0 || (ulong)HistoryDealGetInteger(deal,DEAL_MAGIC)!=InpMagic ||
         (ENUM_DEAL_ENTRY)HistoryDealGetInteger(deal,DEAL_ENTRY)!=DEAL_ENTRY_IN) continue;
      foundEntry=true;
      paid+=MathMax(0.0,-HistoryDealGetDouble(deal,DEAL_COMMISSION));
      paid+=MathMax(0.0,-HistoryDealGetDouble(deal,DEAL_FEE));
   }
   if(!foundEntry) return -1.0;
   cachedId=positionId;
   cachedCost=paid;
   return paid;
}

double NetPositiveFloor(const ulong positionId,const int dir,
                        const double openPrice,const double volume)
{
   double onePipUSD=0.0;
   ENUM_ORDER_TYPE side=dir==1 ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   if(!OrderCalcProfit(side,_Symbol,volume,openPrice,openPrice+dir*PipSize(),onePipUSD) ||
      onePipUSD<=0.0) return 0.0;
   double entryCost=EntryCostUSD(positionId);
   if(entryCost<0.0) return 0.0;
   // Estimate exit commission as equal to entry commission; swap is live.
   double costUSD=MathMax(0.0,2.0*entryCost-PositionGetDouble(POSITION_SWAP));
   double floorPips=costUSD/onePipUSD+InpCostCushionPips;
   return NormalizeDouble(openPrice+dir*floorPips*PipSize(),_Digits);
}

void TrailPosition(const ulong ticket,const ulong positionId,const int dir,
                   const double oldSL,const double tp,const double openPrice,
                   const double volume,const MqlTick &tick)
{
   if(oldSL<=0.0) return;
   double executable=dir==1 ? tick.bid : tick.ask;
   double floor=NetPositiveFloor(positionId,dir,openPrice,volume);
   if(floor<=0.0) return;
   bool protectedProfit=dir*(oldSL-openPrice)>_Point/2.0;
   if(!protectedProfit)
   {
      // The original stop defines 1R until a positive stop is confirmed.
      if(dir*(executable-openPrice)<MathAbs(openPrice-oldSL) ||
         !StopAllowed(dir,floor,tick,true)) return;
      bool moved=trade.PositionModify(ticket,floor,tp);
      if(!moved || trade.ResultRetcode()!=TRADE_RETCODE_DONE)
         PrintFormat("Panda H1 positive SL failed ticket=%I64u retcode=%u %s",ticket,
                     trade.ResultRetcode(),trade.ResultRetcodeDescription());
      else GlobalVariableSet(ArmedKey(positionId),(double)TimeCurrent());
      return;
   }
   if(!GlobalVariableCheck(ArmedKey(positionId)))
      GlobalVariableSet(ArmedKey(positionId),(double)TimeCurrent());
   double candidate=dir==1 ? MathMax(oldSL,floor) : MathMin(oldSL,floor);
   double swing=ConfirmedH1Swing(dir);
   if(swing>0.0)
   {
      double swingSL=swing-dir*InpSwingBufferPips*PipSize();
      candidate=dir==1 ? MathMax(candidate,swingSL) : MathMin(candidate,swingSL);
   }
   candidate=NormalizeDouble(candidate,_Digits);
   if(dir*(candidate-floor)<-_Point/2.0 ||
      dir*(candidate-oldSL)<=_Point/2.0 ||
      !StopAllowed(dir,candidate,tick,true)) return;
   bool sent=trade.PositionModify(ticket,candidate,tp);
   if(!sent || trade.ResultRetcode()!=TRADE_RETCODE_DONE)
      PrintFormat("Panda H1 trail failed ticket=%I64u retcode=%u %s",ticket,
                  trade.ResultRetcode(),trade.ResultRetcodeDescription());
}

void ManageTrailing(const MqlTick &tick)
{
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol ||
         (ulong)PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      int dir=PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY ? 1 : -1;
      TrailPosition(ticket,(ulong)PositionGetInteger(POSITION_IDENTIFIER),dir,
                    PositionGetDouble(POSITION_SL),PositionGetDouble(POSITION_TP),
                    PositionGetDouble(POSITION_PRICE_OPEN),PositionGetDouble(POSITION_VOLUME),tick);
   }
}

bool ExitOnClosedH1Lines()
{
   double stBull,stBear,bbBull[1],bbBear[1];
   if(!ReadST(1,stBull,stBear) ||
      CopyBuffer(g_st,2,1,1,bbBull)!=1 || CopyBuffer(g_st,3,1,1,bbBear)!=1) return false;
   double close1=iClose(_Symbol,PERIOD_H1,1);
   if(close1<=0.0) return false;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket) ||
         PositionGetString(POSITION_SYMBOL)!=_Symbol ||
         (ulong)PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      int dir=PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY ? 1 : -1;
      double openPrice=PositionGetDouble(POSITION_PRICE_OPEN);
      if(dir*(PositionGetDouble(POSITION_SL)-openPrice)<=_Point/2.0) continue;
      ulong positionId=(ulong)PositionGetInteger(POSITION_IDENTIFIER);
      string key=ArmedKey(positionId);
      if(!GlobalVariableCheck(key) ||
         iTime(_Symbol,PERIOD_H1,0)<=(datetime)GlobalVariableGet(key)) continue;
      bool stWith=LineSet(dir==1 ? stBull : stBear);
      bool stAgainst=LineSet(dir==1 ? stBear : stBull);
      bool bbWith=LineSet(dir==1 ? bbBull[0] : bbBear[0]);
      bool bbAgainst=LineSet(dir==1 ? bbBear[0] : bbBull[0]);
      if(stWith==stAgainst || bbWith==bbAgainst) continue; // Missing or joined plots.
      bool lostLines=stAgainst || bbAgainst;
      if(!lostLines)
      {
         double boundary=dir==1 ? MathMax(stBull,bbBull[0]) : MathMin(stBear,bbBear[0]);
         lostLines=dir==1 ? close1<=boundary : close1>=boundary;
      }
      if(!lostLines) continue;
      bool sent=trade.PositionClose(ticket,(ulong)InpDeviationPts);
      if(!sent || trade.ResultRetcode()!=TRADE_RETCODE_DONE)
         PrintFormat("Panda H1 line exit failed ticket=%I64u retcode=%u %s",ticket,
                     trade.ResultRetcode(),trade.ResultRetcodeDescription());
      return true; // Do not enter again on the exit tick.
   }
   return false;
}

int OnInit()
{
   if(_Period!=PERIOD_H1)
   {
      Print("Panda H1 Profit Trail EA must be attached to an H1 chart.");
      return INIT_PARAMETERS_INCORRECT;
   }
   if(InpLots<=0.0 || InpEntryBufferPips<0.0 ||
      InpCostCushionPips<=0.0 || InpSwingStrength<1 ||
      InpSwingLookback<=InpSwingStrength+1 || InpSwingBufferPips<=0.0 ||
      InpBasketPips<=0.0 || InpBasketUSD<=0.0 ||
      InpMaxBiasAgeMin<=0 || InpConfirmMinGapMin<=0 ||
      InpConfirmMaxGapMin<InpConfirmMinGapMin ||
      InpPipSize<0.0 || InpMagic==0 || !ValidVolume())
   {
      Print("Invalid EA inputs or lot size unsupported by this symbol.");
      return INIT_PARAMETERS_INCORRECT;
   }
   trade.SetExpertMagicNumber(InpMagic);
   trade.SetDeviationInPoints(InpDeviationPts);
   trade.SetTypeFillingBySymbol(_Symbol);
   RestoreLastExit();
   if(AccountInfoString(ACCOUNT_CURRENCY)!="USD")
   {
      Print("Panda basket $20 target requires an account denominated in USD.");
      return INIT_FAILED;
   }
   // Pass all indicator options through Panel_Show. The indicator then plots only
   // SuperTrend and BB TrendLine: no arrows, boxes, S/R zones, alerts or panel.
   g_st=iCustom(_Symbol,_Period,"Panda Lines v4.1 MT5",
                InpSTPeriod,InpSTMultiplier,InpSTUseATR,InpSTShowSignals,
                21,1.0,true,5,true,
                false,true,true,true,true,0.15,200,
                clrOrange,clrDodgerBlue,clrDarkViolet,clrCrimson,
                false,false,false);
   if(g_st==INVALID_HANDLE)
   {
      PrintFormat("Panda Lines v4.1 MT5 could not load. Error %d",GetLastError());
      return INIT_FAILED;
   }
   // Reuse a Panda Lines overlay already on this chart. The EA's separate
   // iCustom handle still uses clean settings for entry decisions.
   bool chartHasPandaLines=false;
   for(int i=0;i<ChartIndicatorsTotal(0,0);i++)
   {
      if(ChartIndicatorName(0,0,i)=="Panda Lines v4.1 MT5")
      {
         chartHasPandaLines=true;
         break;
      }
   }
   if(!chartHasPandaLines && !ChartIndicatorAdd(0,0,g_st))
   {
      PrintFormat("Panda Lines could not be shown on chart. Error %d",GetLastError());
      IndicatorRelease(g_st);
      g_st=INVALID_HANDLE;
      return INIT_FAILED;
   }
   g_overlayAdded=!chartHasPandaLines;
   EventSetTimer(2);
   ShowBiasOnChart(DailyLocked());
   PrintFormat("Panda H1 Profit Trail EA loaded on %s %s; waiting for two Panda Engine bias writes.",
               _Symbol,EnumToString((ENUM_TIMEFRAMES)_Period));
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   Comment("");
   if(g_overlayAdded) ChartIndicatorDelete(0,0,"Panda Lines v4.1 MT5");
   if(g_st!=INVALID_HANDLE) IndicatorRelease(g_st);
}

void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest &request,const MqlTradeResult &result)
{
   if(trans.type!=TRADE_TRANSACTION_DEAL_ADD || trans.deal==0 ||
      !HistoryDealSelect(trans.deal) || HistoryDealGetString(trans.deal,DEAL_SYMBOL)!=_Symbol ||
      (ulong)HistoryDealGetInteger(trans.deal,DEAL_MAGIC)!=InpMagic) return;
   ENUM_DEAL_ENTRY entry=(ENUM_DEAL_ENTRY)HistoryDealGetInteger(trans.deal,DEAL_ENTRY);
   if(entry!=DEAL_ENTRY_OUT && entry!=DEAL_ENTRY_OUT_BY) return;
   GlobalVariableSet(LastExitKey(),(double)HistoryDealGetInteger(trans.deal,DEAL_TIME));
   ulong positionId=(ulong)HistoryDealGetInteger(trans.deal,DEAL_POSITION_ID);
   string key=ArmedKey(positionId);
   if(GlobalVariableCheck(key)) GlobalVariableDel(key);
}

void OnTimer()
{
   bool locked=CheckBasketAndDailyLock();
   if(!locked)
   {
      int bias;
      ConfirmedBias(bias);
   }
   ShowBiasOnChart(locked);
}

void OnTick()
{
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick)) return;
   if(CheckBasketAndDailyLock()) return;
   ManageTrailing(tick);
   if(ExitOnClosedH1Lines()) return;
   if(!EntrySessionOpen()) return;
   datetime lastExit=GlobalVariableCheck(LastExitKey()) ?
                     (datetime)GlobalVariableGet(LastExitKey()) : 0;
   if(lastExit>0 && iTime(_Symbol,PERIOD_H1,1)<=lastExit) return;
   double entryBuffer=lastExit>0 ? 0.0 : InpEntryBufferPips;
   int signal;
   double line;
   if(!ReadAlignment(tick,entryBuffer,signal,line) || signal==0) return;
   int bias;
   if(!ConfirmedBias(bias) || bias!=signal) return;
   if(AnySymbolPosition()) return;
   double swing=ConfirmedH1Swing(signal);
   if(swing<=0.0)
   {
      Print("Panda signal skipped: no confirmed H1 swing for the initial stop.");
      return;
   }
   double sl=NormalizeDouble(swing-signal*InpSwingBufferPips*PipSize(),_Digits);
   if(!StopAllowed(signal,sl,tick,false))
   {
      Print("Panda signal skipped: swing stop is on the wrong side or too close.");
      return;
   }
   bool sent=(signal==1) ? trade.Buy(InpLots,_Symbol,0.0,sl,0.0,"Panda H1 Profit Trail")
                         : trade.Sell(InpLots,_Symbol,0.0,sl,0.0,"Panda H1 Profit Trail");
   uint rc=trade.ResultRetcode();
   if(!sent || (rc!=TRADE_RETCODE_DONE && rc!=TRADE_RETCODE_DONE_PARTIAL))
      PrintFormat("Panda entry failed retcode=%u %s",rc,trade.ResultRetcodeDescription());
}
