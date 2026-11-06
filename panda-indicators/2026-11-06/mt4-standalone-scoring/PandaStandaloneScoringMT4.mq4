#property strict
#property version "1.00"
#property indicator_chart_window
#property indicator_buffers 0
#property description "Independent 21-pair Panda box scoring. No EA, files, API or external indicator."
#include "PandaScoreMath.mqh"
#include "PandaScoreWindows.mqh"
#include "PandaRawScorePanel.mqh"
input int RefreshSeconds=5;
input int BrokerUtcOffsetHours=3; // Used only to check quote age; boxes use broker timestamps.
input int MaximumQuoteAgeSeconds=300;
input bool ShowBoxes=true;
input int PanelX=16;
input int PanelY=24;
string objectPrefix;
string currencies[7]={"AUD","CAD","EUR","GBP","JPY","NZD","USD"};
string pairs[21]={"AUDCAD","AUDJPY","AUDNZD","AUDUSD","CADJPY","EURAUD","EURCAD","EURGBP","EURJPY","EURNZD","EURUSD","GBPAUD","GBPCAD","GBPJPY","GBPNZD","GBPUSD","NZDCAD","NZDJPY","NZDUSD","USDCAD","USDJPY"};
string brokerSymbols[21];
int positive[7][3],negative[7][3],advPositive[7][3],advNegative[7][3];
double boxHigh[21][6],boxLow[21][6];
datetime windowStart[6],windowEnd[6],cachedDay=0;
bool boxesReady=false;
string dataStatus="LOADING BROKER HISTORY";

int CurrencyIndex(string value){for(int i=0;i<7;i++)if(currencies[i]==value)return i;return -1;}
string ResolveSymbol(string pair){
 if(SymbolSelect(pair,true))return pair;
 string found="";
 for(int i=0;i<SymbolsTotal(false);i++){string candidate=SymbolName(i,false);if(RawPair(candidate)!=pair)continue;if(found!="")return "";found=candidate;}
 if(found!="" && SymbolSelect(found,true))return found;return "";
}
bool Bounds(string symbol,datetime start,datetime end,double &low,double &high){
 int count=iBars(symbol,PERIOD_H1);if(count<2 || iTime(symbol,PERIOD_H1,count-1)>start)return false;
 low=DBL_MAX;high=-DBL_MAX;bool found=false;
 for(int i=0;i<count;i++){datetime time=iTime(symbol,PERIOD_H1,i);if(time>=end)continue;if(time<start)break;double hi=iHigh(symbol,PERIOD_H1,i),lo=iLow(symbol,PERIOD_H1,i);if(hi<=0 || lo<=0)return false;high=MathMax(high,hi);low=MathMin(low,lo);found=true;}
 return found && high>=low;
}
bool BuildBoxes(){
 datetime now=TimeCurrent(),day=DayStart(now);
 if(boxesReady && cachedDay==day)return true;
 for(int w=0;w<6;w++)BoxWindow(now,w%3,w>=3,windowStart[w],windowEnd[w]);
 for(int p=0;p<21;p++){
 if(brokerSymbols[p]=="")brokerSymbols[p]=ResolveSymbol(pairs[p]);
 if(brokerSymbols[p]==""){dataStatus="MISSING / AMBIGUOUS SYMBOL: "+pairs[p];return false;}
 for(int w=0;w<6;w++)if(!Bounds(brokerSymbols[p],windowStart[w],windowEnd[w],boxLow[p][w],boxHigh[p][w])){dataStatus="LOAD H1 HISTORY: "+pairs[p]+" (3+ months)";return false;}
 }
 cachedDay=day;boxesReady=true;return true;
}
void ResetVotes(){ArrayInitialize(positive,0);ArrayInitialize(negative,0);ArrayInitialize(advPositive,0);ArrayInitialize(advNegative,0);}
void AddVote(int currency,int tf,int vote,bool advance){if(advance){if(vote>0)advPositive[currency][tf]++;if(vote<0)advNegative[currency][tf]--;}else{if(vote>0)positive[currency][tf]++;if(vote<0)negative[currency][tf]--;}}
bool ComputeScores(){
 ResetVotes();if(!IsConnected()){dataStatus="BROKER DISCONNECTED";return false;}if(!BuildBoxes())return false;
 datetime brokerNow=TimeGMT()+BrokerUtcOffsetHours*3600;
 for(int p=0;p<21;p++){
 double bid=MarketInfo(brokerSymbols[p],MODE_BID);datetime tick=(datetime)MarketInfo(brokerSymbols[p],MODE_TIME);long age=(long)brokerNow-(long)tick;
 if(bid<=0 || tick<=0 || age< -60 || age>MaximumQuoteAgeSeconds){dataStatus="STALE QUOTE: "+pairs[p]+" / CHECK UTC OFFSET";return false;}
 int base=CurrencyIndex(StringSubstr(pairs[p],0,3)),quote=CurrencyIndex(StringSubstr(pairs[p],3,3));
 for(int w=0;w<6;w++){int vote=PandaVote(bid,boxLow[p][w],boxHigh[p][w]);AddVote(base,w%3,vote,w>=3);AddVote(quote,w%3,-vote,w>=3);}
 }
 dataStatus="LOCAL BROKER DATA | ALL 21 PAIRS";return true;
}
string Cell(int pos,int neg){if(pos>0 && neg<0)return RawSigned(pos)+"/"+RawSigned(neg);return pos>0?RawSigned(pos):RawSigned(neg);}
string CurrencyLine(int c,bool advance){string line=currencies[c]+"  ";string labels[3]={"D1:"," H4:"," H1:"};for(int t=0;t<3;t++)line+=labels[t]+(advance?Cell(advPositive[c][t],advNegative[c][t]):Cell(positive[c][t],negative[c][t]));return line;}
int Strongest(int c){return PandaStrongest(positive[c][0],negative[c][0],positive[c][1],negative[c][1],positive[c][2],negative[c][2]);}
bool Conflict(int c){return PandaConflict(positive[c][0],negative[c][0],positive[c][1],negative[c][1],positive[c][2],negative[c][2]);}
void DrawBoxes(int pairIndex){if(!ShowBoxes)return;color colors[3]={clrDodgerBlue,clrMediumSeaGreen,clrOrange};string names[3]={"D1 / LONG","H4 / MEDIUM","H1 / SHORT"};for(int w=0;w<3;w++){
 string id=objectPrefix+"Box"+IntegerToString(w);ObjectCreate(0,id,OBJ_RECTANGLE,0,windowStart[w],boxHigh[pairIndex][w],windowEnd[w],boxLow[pairIndex][w]);ObjectSetInteger(0,id,OBJPROP_COLOR,colors[w]);ObjectSetInteger(0,id,OBJPROP_BACK,true);ObjectSetInteger(0,id,OBJPROP_FILL,false);ObjectSetInteger(0,id,OBJPROP_SELECTABLE,false);ObjectSetString(0,id,OBJPROP_TOOLTIP,names[w]);}}
string AtrText(){double point=MarketInfo(Symbol(),MODE_POINT);if(point<=0 || iBars(Symbol(),PERIOD_H1)<16 || iBars(Symbol(),PERIOD_D1)<16)return "ATR: -- (history loading)";return "ATR H1/D1: "+IntegerToString((int)MathRound(iATR(Symbol(),PERIOD_H1,14,1)/point))+" : "+IntegerToString((int)MathRound(iATR(Symbol(),PERIOD_D1,14,1)/point))+" points";}
void Render(){
 RawRemove(objectPrefix);string pair=RawPair(Symbol());RawLabel(objectPrefix,0,"PANDA STANDALONE | "+pair,clrSkyBlue,PanelX,PanelY,12);RawLabel(objectPrefix,12,RawSpread(),clrSilver,PanelX,PanelY);
 if(pair=="" || !ComputeScores()){if(pair=="")dataStatus="UNSUPPORTED CHART PAIR";RawLabel(objectPrefix,2,"SCORES: --",clrSilver,PanelX,PanelY);RawLabel(objectPrefix,4,dataStatus,clrGold,PanelX,PanelY,9);ChartRedraw();return;}
 int base=CurrencyIndex(StringSubstr(pair,0,3)),quote=CurrencyIndex(StringSubstr(pair,3,3));
 PandaDecision d=PandaDecide(Strongest(base),Strongest(quote),Conflict(base)||Conflict(quote));
 string bias=d.invalid?"HARD_INVALID":d.bias>0?"BUY":d.bias<0?"SELL":"INVALID";color clr=d.bias>0?clrSpringGreen:d.bias<0?clrTomato:clrGold;
 string execution=d.execution==2?"MARKET":d.execution==1?"PULLBACK":"NONE";string confidence=d.confidence==3?"HIGH":d.confidence==2?"MEDIUM":d.confidence==1?"LOW":"INVALID";
 RawLabel(objectPrefix,2,CurrencyLine(base,false),clrWhiteSmoke,PanelX,PanelY);RawLabel(objectPrefix,3,CurrencyLine(quote,false),clrWhiteSmoke,PanelX,PanelY);
 RawLabel(objectPrefix,4,"BASE: "+RawSigned(Strongest(base))+"  QUOTE: "+RawSigned(Strongest(quote)),clrSilver,PanelX,PanelY);
 RawLabel(objectPrefix,5,"GAP: "+RawSigned(d.gap)+" | "+bias,clr,PanelX,PanelY,12);RawLabel(objectPrefix,6,execution+" | "+confidence,clrSilver,PanelX,PanelY);
 RawLabel(objectPrefix,8,"ADV FORECAST",clrSkyBlue,PanelX,PanelY);RawLabel(objectPrefix,9,CurrencyLine(base,true),clrWhiteSmoke,PanelX,PanelY);RawLabel(objectPrefix,10,CurrencyLine(quote,true),clrWhiteSmoke,PanelX,PanelY);
 RawLabel(objectPrefix,11,AtrText(),clrSilver,PanelX,PanelY);RawLabel(objectPrefix,14,dataStatus,clrSilver,PanelX,PanelY,8);
 for(int p=0;p<21;p++)if(pairs[p]==pair){DrawBoxes(p);break;}ChartRedraw();
}
int OnInit(){if(BrokerUtcOffsetHours< -12 || BrokerUtcOffsetHours>14 || MaximumQuoteAgeSeconds<30 || MaximumQuoteAgeSeconds>3600)return INIT_PARAMETERS_INCORRECT;objectPrefix="PandaStandalone_"+IntegerToString(ChartID())+"_"+IntegerToString((int)GetTickCount())+"_";EventSetTimer(MathMax(2,RefreshSeconds));Render();return INIT_SUCCEEDED;}
void OnTimer(){Render();}
void OnDeinit(const int reason){EventKillTimer();RawRemove(objectPrefix);}
int OnCalculate(const int rates_total,const int prev_calculated,const datetime &time[],const double &open[],const double &high[],const double &low[],const double &close[],const long &tick_volume[],const long &volume[],const int &spread[]){return rates_total;}
