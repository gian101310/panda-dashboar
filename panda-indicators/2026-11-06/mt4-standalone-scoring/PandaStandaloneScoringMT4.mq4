#property strict
#property version "1.10"
#property indicator_chart_window
#property indicator_buffers 0
#property description "Independent 21-pair Panda box scoring. No EA, files, API or external indicator."
#include "PandaScoreMath.mqh"
#include "PandaScoreWindows.mqh"
#include "PandaRawScorePanel.mqh"
input int RefreshSeconds=5;
input int PanelX=16;
input int PanelY=24;
string objectPrefix;
int panelLeft=16,panelTop=24;
bool panelDragging=false,scrollBeforeDrag=true,mouseMoveBefore=false,leftPreviouslyDown=false;
int dragOffsetX=0,dragOffsetY=0;
const int PANEL_WIDTH=440;
const int PANEL_HEIGHT=166;
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
 for(int p=0;p<21;p++){
 double bid=MarketInfo(brokerSymbols[p],MODE_BID);
 if(bid<=0){dataStatus="WAITING FOR PRICE: "+pairs[p];return false;}
 int base=CurrencyIndex(StringSubstr(pairs[p],0,3)),quote=CurrencyIndex(StringSubstr(pairs[p],3,3));
 for(int w=0;w<6;w++){int vote=PandaVote(bid,boxLow[p][w],boxHigh[p][w]);AddVote(base,w%3,vote,w>=3);AddVote(quote,w%3,-vote,w>=3);}
 }
 dataStatus="LOCAL BROKER DATA | ALL 21 PAIRS";return true;
}
string Cell(int pos,int neg){if(pos>0 && neg<0)return RawSigned(pos)+"/"+RawSigned(neg);return pos>0?RawSigned(pos):RawSigned(neg);}
string CurrencyLine(int c,bool advance){string line=currencies[c]+"  ";string labels[3]={"D1:"," H4:"," H1:"};for(int t=0;t<3;t++)line+=labels[t]+(advance?Cell(advPositive[c][t],advNegative[c][t]):Cell(positive[c][t],negative[c][t]));return line;}
int Strongest(int c){return PandaStrongest(positive[c][0],negative[c][0],positive[c][1],negative[c][1],positive[c][2],negative[c][2]);}
bool Conflict(int c){return PandaConflict(positive[c][0],negative[c][0],positive[c][1],negative[c][1],positive[c][2],negative[c][2]);}
void MovePanel(){
 for(int row=0;row<8;row++){
 string name=objectPrefix+IntegerToString(row);
 if(ObjectFind(0,name)<0)continue;
 ObjectSetInteger(0,name,OBJPROP_XDISTANCE,panelLeft);
 ObjectSetInteger(0,name,OBJPROP_YDISTANCE,panelTop+row*19);
 }
 ChartRedraw();
}
void Render(){
 for(int row=0;row<8;row++)RawLabel(objectPrefix,row,"",clrSilver,panelLeft,panelTop);
 string pair=RawPair(Symbol());
 RawLabel(objectPrefix,0,"PANDA RAW | "+pair+"              [drag]",clrSkyBlue,panelLeft,panelTop,11);
 if(pair=="" || !ComputeScores()){
 if(pair=="")dataStatus="UNSUPPORTED CHART PAIR";
 RawLabel(objectPrefix,2,dataStatus,clrGold,panelLeft,panelTop,9);
 ChartRedraw();return;
 }
 int base=CurrencyIndex(StringSubstr(pair,0,3)),quote=CurrencyIndex(StringSubstr(pair,3,3));
 PandaDecision decision=PandaDecide(Strongest(base),Strongest(quote),Conflict(base)||Conflict(quote));
 string bias=decision.invalid?"HARD_INVALID":decision.bias>0?"BUY":decision.bias<0?"SELL":"WAIT";
 color direction=decision.bias>0?clrSpringGreen:decision.bias<0?clrTomato:clrGold;
 RawLabel(objectPrefix,1,"CURRENT SCORE",clrSkyBlue,panelLeft,panelTop);
 RawLabel(objectPrefix,2,CurrencyLine(base,false),clrWhiteSmoke,panelLeft,panelTop);
 RawLabel(objectPrefix,3,CurrencyLine(quote,false),clrWhiteSmoke,panelLeft,panelTop);
 RawLabel(objectPrefix,5,"ADV FORECAST",clrSkyBlue,panelLeft,panelTop);
 RawLabel(objectPrefix,6,CurrencyLine(base,true),clrWhiteSmoke,panelLeft,panelTop);
 RawLabel(objectPrefix,7,CurrencyLine(quote,true),clrWhiteSmoke,panelLeft,panelTop);
 RawLabel(objectPrefix,4,"BIAS: "+bias,direction,panelLeft,panelTop,11);
 ChartRedraw();
}
void OnChartEvent(const int id,const long &lparam,const double &dparam,const string &sparam){
 if(id!=CHARTEVENT_MOUSE_MOVE)return;
 int mouseX=(int)lparam,mouseY=(int)dparam;
 bool pressed=((int)StringToInteger(sparam)&1)!=0;
 bool newPress=pressed && !leftPreviouslyDown;leftPreviouslyDown=pressed;
 if(!pressed){
 if(panelDragging){panelDragging=false;ChartSetInteger(0,CHART_MOUSE_SCROLL,scrollBeforeDrag);}
 return;
 }
 if(!panelDragging){
 if(!newPress)return;
 if(mouseX<panelLeft-8 || mouseX>panelLeft-8+PANEL_WIDTH || mouseY<panelTop-5 || mouseY>panelTop+18)return;
 panelDragging=true;dragOffsetX=mouseX-panelLeft;dragOffsetY=mouseY-panelTop;
 scrollBeforeDrag=(bool)ChartGetInteger(0,CHART_MOUSE_SCROLL);
 ChartSetInteger(0,CHART_MOUSE_SCROLL,false);
 }
 int width=(int)ChartGetInteger(0,CHART_WIDTH_IN_PIXELS),height=(int)ChartGetInteger(0,CHART_HEIGHT_IN_PIXELS);
 panelLeft=MathMax(8,MathMin(mouseX-dragOffsetX,MathMax(8,width-PANEL_WIDTH+8)));
 panelTop=MathMax(5,MathMin(mouseY-dragOffsetY,MathMax(5,height-PANEL_HEIGHT+5)));
 MovePanel();
}
int OnInit(){
 panelLeft=MathMax(8,PanelX);panelTop=MathMax(5,PanelY);
 objectPrefix="PandaStandalone_"+IntegerToString(ChartID())+"_"+IntegerToString((int)GetTickCount())+"_";
 mouseMoveBefore=(bool)ChartGetInteger(0,CHART_EVENT_MOUSE_MOVE);
 ChartSetInteger(0,CHART_EVENT_MOUSE_MOVE,true);
 EventSetTimer(MathMax(2,RefreshSeconds));Render();return INIT_SUCCEEDED;
}
void OnTimer(){Render();}
void OnDeinit(const int reason){
 EventKillTimer();
 if(panelDragging)ChartSetInteger(0,CHART_MOUSE_SCROLL,scrollBeforeDrag);
 ChartSetInteger(0,CHART_EVENT_MOUSE_MOVE,mouseMoveBefore);
 RawRemove(objectPrefix);
}
int OnCalculate(const int rates_total,const int prev_calculated,const datetime &time[],const double &open[],const double &high[],const double &low[],const double &close[],const long &tick_volume[],const long &volume[],const int &spread[]){return rates_total;}
