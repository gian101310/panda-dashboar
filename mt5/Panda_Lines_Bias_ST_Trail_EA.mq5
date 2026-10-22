//+------------------------------------------------------------------+
//| Panda Lines + valid Panda bias, SuperTrend stop and trailing      |
//| Requires Panda Lines v4.1 MT5.ex5 in MQL5\Indicators             |
//| Requires current panda_score_<PAIR>.txt in Terminal\Common\Files |
//+------------------------------------------------------------------+
#property copyright "Panda Engine"
#property version   "1.14"
#property strict
#property tester_indicator "Panda Lines v4.1 MT5.ex5"

#include <Trade/Trade.mqh>

input int      InpSTPeriod       = 10;
input double   InpSTMultiplier   = 3.0;
input bool     InpSTUseATR       = true;
input bool     InpSTShowSignals  = false; // Keep the debugging chart to Panda Lines only
input double   InpLots          = 0.01;
input double   InpStopOffsetPips = 30.0;
input double   InpEntryBufferPips = 10.0; // Require this clearance beyond both Panda Lines
input bool     InpBreakEvenAtRisk = true;  // Move SL to entry after gain reaches initial risk
input double   InpTrailStartPips = 50.0;   // Start ST trailing only above this unrealized gain
input double   InpPipSize       = 0.0;    // 0 = forex digits rule; set explicitly for gold/indices
input int      InpMaxBiasAgeMin = 20;
input int      InpConfirmMinGapMin = 4;  // Distinct engine updates must be about one cycle apart
input int      InpConfirmMaxGapMin = 8;
input double   InpBasketPips    = 200.0;  // Sum of open pips across this EA's positions
input double   InpBasketUSD     = 20.0;   // Sum of open profit, USD account required
input ulong    InpMagic         = 990143;
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
bool ReadAlignment(const MqlTick &tick,int &direction,double &stLine)
{
   direction=0; stLine=0.0;
   double stBull,stBear,bbBull[1],bbBear[1];
   if(!ReadST(1,stBull,stBear) ||
      CopyBuffer(g_st,2,1,1,bbBull)!=1 ||
      CopyBuffer(g_st,3,1,1,bbBear)!=1) return false;
   double close1=iClose(_Symbol,_Period,1);
   if(close1<=0.0) return false;
   double buffer=InpEntryBufferPips*PipSize();
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
   Comment("Panda MC | Engine bias: ",status);
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

void TrailPosition(const ulong ticket,const int dir,const double oldSL,const double tp,
                   const double openPrice,const MqlTick &tick)
{
   double gainPips=(dir==1 ? tick.bid-openPrice : openPrice-tick.ask)/PipSize();
   if(InpBreakEvenAtRisk && oldSL<=0.0) return;
   // Before trailing, initial SL is untouched; its distance from the filled
   // entry is 1R. Move to exact entry once unrealized gain reaches 1R.
   if(InpBreakEvenAtRisk && oldSL>0.0 &&
      ((dir==1 && oldSL<openPrice) || (dir==-1 && oldSL>openPrice)))
   {
      double initialRiskPips=MathAbs(openPrice-oldSL)/PipSize();
      if(gainPips<initialRiskPips) return;
      double breakEven=NormalizeDouble(openPrice,_Digits);
      if(!StopAllowed(dir,breakEven,tick,true)) return;
      bool moved=trade.PositionModify(ticket,breakEven,tp);
      if(!moved || trade.ResultRetcode()!=TRADE_RETCODE_DONE)
         PrintFormat("Panda break-even failed ticket=%I64u retcode=%u %s",ticket,
                     trade.ResultRetcode(),trade.ResultRetcodeDescription());
      return; // Read the confirmed SL on a later tick before trailing.
   }
   if(gainPips<=InpTrailStartPips) return;
   double bull,bear;
   if(!ReadST(1,bull,bear)) return;
   if(LineSet(bull)==LineSet(bear)) return;
   double line=(dir==1) ? bull : bear;
   if(!LineSet(line)) return;
   double candidate=NormalizeDouble(line-dir*InpStopOffsetPips*PipSize(),_Digits);
   if(!StopAllowed(dir,candidate,tick,true)) return;
   if(oldSL>0.0 && ((dir==1 && candidate<=oldSL+_Point/2.0) ||
                     (dir==-1 && candidate>=oldSL-_Point/2.0))) return;
   bool sent=trade.PositionModify(ticket,candidate,tp);
   if(!sent || trade.ResultRetcode()!=TRADE_RETCODE_DONE)
      PrintFormat("Panda trail failed ticket=%I64u retcode=%u %s",ticket,
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
      TrailPosition(ticket,dir,PositionGetDouble(POSITION_SL),
                    PositionGetDouble(POSITION_TP),PositionGetDouble(POSITION_PRICE_OPEN),tick);
   }
}

int OnInit()
{
   if(InpLots<=0.0 || InpStopOffsetPips<=0.0 || InpEntryBufferPips<0.0 || InpTrailStartPips<0.0 ||
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
   PrintFormat("Panda MC EA loaded on %s %s; waiting for two Panda Engine bias writes.",
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
   if(!EntrySessionOpen()) return;
   int signal;
   double line;
   if(!ReadAlignment(tick,signal,line) || signal==0) return;
   int bias;
   if(!ConfirmedBias(bias) || bias!=signal) return;
   if(AnySymbolPosition()) return;
   double sl=NormalizeDouble(line-signal*InpStopOffsetPips*PipSize(),_Digits);
   if(!StopAllowed(signal,sl,tick,false))
   {
      Print("Panda signal skipped: SuperTrend stop is on the wrong side or too close.");
      return;
   }
   bool sent=(signal==1) ? trade.Buy(InpLots,_Symbol,0.0,sl,0.0,"Panda MC")
                         : trade.Sell(InpLots,_Symbol,0.0,sl,0.0,"Panda MC");
   uint rc=trade.ResultRetcode();
   if(!sent || (rc!=TRADE_RETCODE_DONE && rc!=TRADE_RETCODE_DONE_PARTIAL))
      PrintFormat("Panda entry failed retcode=%u %s",rc,trade.ResultRetcodeDescription());
}
