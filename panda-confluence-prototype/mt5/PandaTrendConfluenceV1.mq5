#property strict
#property version "1.00"
#property indicator_chart_window
#property indicator_plots 0
#property description "Read-only Panda Trend Confluence v1 indicator"

input int PanelX=16;
input int PanelY=38;
input int AtrPeriod=10;
input double SuperTrendMultiplier=3.0;
input int AdxPeriod=14;
input int SwingLength=3;
input int M15EventExpiryBars=3;
input double LevelProximityPips=15;
input double LevelTouchPips=2;
input double OverextensionPips=30;

const string PREFIX="PTC_V1_";
const color BUY_COLOR=C'0,255,159';
const color SELL_COLOR=C'255,77,109';
const color WARN_COLOR=C'255,209,102';
const color MUTED_COLOR=C'150,165,184';
int h1Adx=INVALID_HANDLE,m15Adx=INVALID_HANDLE;
string feedStatus="CONNECTING",pandaBias="WAIT",pandaZone="UNKNOWN",boxH1="UNKNOWN";
double pandaGap=0;
bool hardInvalid=true,pandaLinesValid=false;
datetime feedUpdated=0;

struct TrendState { bool ready; int direction; double strength; double adx; double line; double atr; };
struct StructureState { int direction; string event; int age; };

string FeedFile() { return "PandaTrendConfluenceV1_"+IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN))+".txt"; }
string SymbolPair()
{
   string name=_Symbol;
   StringToUpper(name);
   string pairs[]={"AUDCAD","AUDJPY","AUDNZD","AUDUSD","CADJPY","CHFJPY","EURAUD","EURCAD","EURGBP","EURJPY","EURNZD","EURUSD","GBPAUD","GBPCAD","GBPJPY","GBPNZD","GBPUSD","NZDCAD","NZDJPY","NZDUSD","USDCAD","USDCHF","USDJPY"};
   string found="";
   for(int i=0;i<ArraySize(pairs);i++) if(StringFind(name,pairs[i])>=0) { if(found!="") return ""; found=pairs[i]; }
   return found;
}
string JsonValue(const string object,const string key)
{
   int at=StringFind(object,"\""+key+"\"");
   if(at<0) return "";
   at=StringFind(object,":",at);
   if(at<0) return "";
   at++;
   while(at<StringLen(object) && StringGetCharacter(object,at)==' ') at++;
   if(StringGetCharacter(object,at)=='\"')
   {
      int end=StringFind(object,"\"",at+1);
      return end<0 ? "" : StringSubstr(object,at+1,end-at-1);
   }
   int end=at;
   while(end<StringLen(object) && StringGetCharacter(object,end)!=',' && StringGetCharacter(object,end)!='}') end++;
   return StringSubstr(object,at,end-at);
}
void ReadFeed()
{
   feedStatus="CONNECTING";
   hardInvalid=true;
   int file=FileOpen(FeedFile(),FILE_READ|FILE_TXT|FILE_COMMON|FILE_ANSI|FILE_SHARE_READ|FILE_SHARE_WRITE,0,CP_UTF8);
   if(file==INVALID_HANDLE) { feedStatus="FEED EA REQUIRED"; return; }
   string account=FileReadString(file),timestamp=FileReadString(file),status=FileReadString(file),body=FileReadString(file);
   FileClose(file);
   if(account!=IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN))) { feedStatus="ACCOUNT MISMATCH"; return; }
   if(TimeGMT()-(datetime)StringToInteger(timestamp)>150) { feedStatus="FEED STALE"; return; }
   if(status!="LIVE") { feedStatus=status; return; }
   string pair=SymbolPair();
   if(pair=="") { feedStatus="UNSUPPORTED PAIR"; return; }
   int at=StringFind(body,"\"symbol\":\""+pair+"\"");
   if(at<0) { feedStatus="PAIR MISSING"; return; }
   int start=at;
   while(start>0 && StringGetCharacter(body,start)!='{') start--;
   int end=StringFind(body,"}",at);
   if(end<0) { feedStatus="INVALID FEED"; return; }
   string row=StringSubstr(body,start,end-start+1);
   string updated=JsonValue(row,"updated_at");
   if(StringLen(updated)<19) { feedStatus="DATA STALE"; return; }
   updated=StringSubstr(updated,0,19);
   StringReplace(updated,"T"," ");
   feedUpdated=StringToTime(updated);
   if(feedUpdated<=0 || MathAbs(TimeGMT()-feedUpdated)>600) { feedStatus="DATA STALE"; return; }
   pandaBias=JsonValue(row,"bias");
   pandaGap=StringToDouble(JsonValue(row,"gap"));
   pandaZone=JsonValue(row,"pl_zone");
   pandaLinesValid=JsonValue(row,"pl_g1_valid")=="true";
   boxH1=JsonValue(row,"box_h1_trend");
   hardInvalid=JsonValue(row,"hard_invalid")=="true";
   feedStatus="LIVE";
}
double TrueRange(const MqlRates &bars[],const int i)
{
   return MathMax(bars[i].high-bars[i].low,MathMax(MathAbs(bars[i].high-bars[i-1].close),MathAbs(bars[i].low-bars[i-1].close)));
}
TrendState Trend(const ENUM_TIMEFRAMES tf,const int adxHandle)
{
   TrendState t; t.ready=false; t.direction=0; t.strength=0; t.adx=0; t.line=0; t.atr=0;
   MqlRates bars[];
   int count=CopyRates(_Symbol,tf,0,250,bars),last=count-2;
   if(count<MathMax(AtrPeriod+15,AdxPeriod*2+3)) return t;
   double atr=0,upper=0,lower=0,line=0;
   int direction=1,consecutive=0;
   for(int i=1;i<=AtrPeriod;i++) atr+=TrueRange(bars,i);
   atr/=AtrPeriod;
   for(int i=AtrPeriod;i<=last;i++)
   {
      if(i>AtrPeriod) atr=(atr*(AtrPeriod-1)+TrueRange(bars,i))/AtrPeriod;
      double mid=(bars[i].high+bars[i].low)/2;
      double basicUpper=mid+SuperTrendMultiplier*atr,basicLower=mid-SuperTrendMultiplier*atr;
      if(i==AtrPeriod || basicUpper<upper || bars[i-1].close>upper) upper=basicUpper;
      if(i==AtrPeriod || basicLower>lower || bars[i-1].close<lower) lower=basicLower;
      int next=direction;
      if(direction<0 && bars[i].close>upper) next=1;
      else if(direction>0 && bars[i].close<lower) next=-1;
      consecutive=next==direction ? consecutive+1 : 1;
      direction=next;
      line=direction>0 ? lower : upper;
   }
   double value[];
   if(CopyBuffer(adxHandle,0,1,1,value)<1) return t;
   double distance=atr<=0 ? 0 : MathMin(30,MathAbs(bars[last].close-line)/atr*15);
   double continuity=MathMin(40,MathLog(consecutive+1)/MathLog(1.5)*10);
   double old=bars[last-10].close;
   double move=old<=0 ? 0 : (direction>0 ? bars[last].close-old : old-bars[last].close)/old;
   t.ready=true; t.direction=direction; t.strength=MathMin(100,MathMax(0,distance+continuity+MathMin(30,MathMax(0,move*5000))));
   t.adx=value[0]; t.line=line; t.atr=atr;
   return t;
}
StructureState Structure(const ENUM_TIMEFRAMES tf)
{
   StructureState s; s.direction=0; s.event="NONE"; s.age=999;
   MqlRates bars[];
   int count=CopyRates(_Symbol,tf,0,450,bars),last=count-2;
   if(count<SwingLength*3+10) return s;
   double high=0,low=0; bool highBroken=false,lowBroken=false;
   for(int i=SwingLength*2;i<=last;i++)
   {
      int center=i-SwingLength; bool pivotHigh=true,pivotLow=true;
      for(int j=center-SwingLength;j<=center+SwingLength;j++)
      {
         if(j==center) continue;
         if(bars[j].high>=bars[center].high) pivotHigh=false;
         if(bars[j].low<=bars[center].low) pivotLow=false;
      }
      if(pivotHigh) { high=bars[center].high; highBroken=false; }
      if(pivotLow) { low=bars[center].low; lowBroken=false; }
      if(high>0 && !highBroken && bars[i].close>high)
      {
         s.event=s.direction<0 ? "CHOCH UP" : "BOS UP"; s.direction=1; s.age=last-i; highBroken=true;
      }
      if(low>0 && !lowBroken && bars[i].close<low)
      {
         s.event=s.direction>0 ? "CHOCH DOWN" : "BOS DOWN"; s.direction=-1; s.age=last-i; lowBroken=true;
      }
   }
   return s;
}
double DirectionalLevel(const int side,string &label)
{
   double price=SymbolInfoDouble(_Symbol,SYMBOL_BID),best=0,bestDistance=DBL_MAX;
   ENUM_TIMEFRAMES frames[]={PERIOD_D1,PERIOD_W1,PERIOD_MN1};
   string names[]={"PREV DAY","PREV WEEK","PREV MONTH"};
   for(int i=0;i<3;i++)
   {
      double value=side>0 ? iLow(_Symbol,frames[i],1) : iHigh(_Symbol,frames[i],1);
      if(value<=0 || (side>0 && value>price) || (side<0 && value<price)) continue;
      double distance=MathAbs(price-value);
      if(distance<bestDistance) { best=value; bestDistance=distance; label=names[i]; }
   }
   return best;
}
bool OpposingLevelNear(const int side,const double price,const double pip)
{
   ENUM_TIMEFRAMES frames[]={PERIOD_D1,PERIOD_W1,PERIOD_MN1};
   for(int i=0;i<3;i++)
   {
      double level=side>0 ? iHigh(_Symbol,frames[i],1) : iLow(_Symbol,frames[i],1);
      if(level>0 && (side>0 ? level>price : level<price) && MathAbs(level-price)/pip<=LevelProximityPips) return true;
   }
   return false;
}
void Label(const int row,const string caption,const color tint)
{
   string name=PREFIX+IntegerToString(row);
   if(ObjectFind(0,name)<0) ObjectCreate(0,name,OBJ_LABEL,0,0,0);
   ObjectSetInteger(0,name,OBJPROP_CORNER,CORNER_LEFT_UPPER);
   ObjectSetInteger(0,name,OBJPROP_XDISTANCE,PanelX+12);
   ObjectSetInteger(0,name,OBJPROP_YDISTANCE,PanelY+10+row*19);
   ObjectSetInteger(0,name,OBJPROP_COLOR,tint);
   ObjectSetInteger(0,name,OBJPROP_FONTSIZE,row==0 ? 10 : 9);
   ObjectSetString(0,name,OBJPROP_FONT,"Consolas");
   ObjectSetString(0,name,OBJPROP_TEXT,caption);
}
void Render()
{
   ReadFeed();
   if(ObjectFind(0,PREFIX+"BG")<0) ObjectCreate(0,PREFIX+"BG",OBJ_RECTANGLE_LABEL,0,0,0);
   ObjectSetInteger(0,PREFIX+"BG",OBJPROP_CORNER,CORNER_LEFT_UPPER);
   ObjectSetInteger(0,PREFIX+"BG",OBJPROP_XDISTANCE,PanelX);
   ObjectSetInteger(0,PREFIX+"BG",OBJPROP_YDISTANCE,PanelY);
   ObjectSetInteger(0,PREFIX+"BG",OBJPROP_XSIZE,390);
   ObjectSetInteger(0,PREFIX+"BG",OBJPROP_YSIZE,203);
   ObjectSetInteger(0,PREFIX+"BG",OBJPROP_BGCOLOR,C'14,21,37');
   ObjectSetInteger(0,PREFIX+"BG",OBJPROP_BORDER_COLOR,C'32,51,76');
   ObjectSetInteger(0,PREFIX+"BG",OBJPROP_BACK,false);
   Label(0,"PANDA TREND CONFLUENCE v1  |  MT5",C'0,180,255');
   if(feedStatus!="LIVE")
   {
      Label(1,"FEED  "+feedStatus,WARN_COLOR);
      for(int i=2;i<10;i++) Label(i,"",MUTED_COLOR);
      ChartRedraw(); return;
   }
   int side=pandaBias=="BUY" ? 1 : pandaBias=="SELL" ? -1 : 0;
   int gap=(int)MathRound(MathAbs(pandaGap));
   string execution=gap>=9 ? "MARKET" : gap>=5 ? "PULLBACK" : "NONE";
   bool lines=side!=0 && pandaLinesValid && (side>0 ? pandaZone=="ABOVE" : pandaZone=="BELOW");
   TrendState h1=Trend(PERIOD_H1,h1Adx),m15=Trend(PERIOD_M15,m15Adx);
   StructureState hs=Structure(PERIOD_H1),ms=Structure(PERIOD_M15);
   color sideColor=side>0 ? BUY_COLOR : side<0 ? SELL_COLOR : MUTED_COLOR;
   Label(1,"PANDA  "+pandaBias+"  GAP "+IntegerToString(gap)+"  "+execution,sideColor);
   Label(2,"LINES  "+(lines ? "CONFIRMED" : "UNCONFIRMED"),lines ? sideColor : WARN_COLOR);
   Label(3,"H1     "+(h1.ready ? (h1.direction>0 ? "UP " : "DOWN ")+DoubleToString(h1.strength,0)+"%  ADX "+DoubleToString(h1.adx,0) : "LOADING"),h1.ready && h1.direction==side ? sideColor : WARN_COLOR);
   Label(4,"H1 STRUCTURE  "+hs.event,hs.direction==side ? sideColor : WARN_COLOR);
   Label(5,"M15    "+(m15.ready ? (m15.direction>0 ? "UP " : "DOWN ")+DoubleToString(m15.strength,0)+"%" : "LOADING")+"  "+ms.event,m15.ready && m15.direction==side ? sideColor : WARN_COLOR);
   string levelLabel=""; double level=DirectionalLevel(side,levelLabel);
   double pip=SymbolInfoDouble(_Symbol,SYMBOL_POINT);
   int digits=(int)SymbolInfoInteger(_Symbol,SYMBOL_DIGITS);
   if(digits==3 || digits==5) pip*=10;
   string levelText=level>0 ? levelLabel+" "+DoubleToString(level,digits) : "UNAVAILABLE";
   Label(6,"PULLBACK LEVEL  "+levelText,MUTED_COLOR);
   string decision="WAIT",detail="";
   if(hardInvalid || side==0 || execution=="NONE") detail="PANDA BIAS INVALID";
   else if(!lines) detail="PANDA LINES UNCONFIRMED";
   else if(!h1.ready || !m15.ready) detail="TREND DATA LOADING";
   else if(execution=="MARKET")
   {
      if(h1.direction!=side || h1.strength<65) detail="H1 TREND";
      else if(h1.adx<25) detail="H1 ADX";
      else if(hs.direction!=side) detail="H1 STRUCTURE";
      else if(m15.direction!=side || m15.strength<50) detail="M15 MOMENTUM";
      else if(ms.age<=M15EventExpiryBars && ms.direction==-side) detail="M15 REVERSAL";
      else
      {
         double price=SymbolInfoDouble(_Symbol,SYMBOL_BID);
         if(MathAbs(price-h1.line)/pip>OverextensionPips) detail="OVEREXTENDED";
         else if(OpposingLevelNear(side,price,pip)) detail="NEAR OPPOSING LEVEL";
         else decision=pandaBias+" MARKET CONTEXT";
      }
   }
   else
   {
      if(boxH1=="RANGING" || h1.adx<15) detail="RANGING H1";
      else if(hs.direction==-side) detail="H1 STRUCTURE AGAINST";
      else if(level<=0) detail="LEVEL UNAVAILABLE";
      else
      {
         MqlRates bar[];
         if(CopyRates(_Symbol,PERIOD_H1,1,1,bar)<1) detail="H1 CANDLE LOADING";
         else
         {
            bool touched=bar[0].low<=level+LevelTouchPips*pip && bar[0].high>=level-LevelTouchPips*pip;
            bool rejected=touched && (side>0 ? bar[0].close>level && bar[0].close>bar[0].open : bar[0].close<level && bar[0].close<bar[0].open);
            double distance=MathAbs(SymbolInfoDouble(_Symbol,SYMBOL_BID)-level)/pip;
            bool bos=ms.age<=M15EventExpiryBars && ms.event==(side>0 ? "BOS UP" : "BOS DOWN");
            if(!touched) detail=distance<=LevelProximityPips ? "APPROACHING LEVEL" : "PULLBACK ACTIVE";
            else if(!rejected) detail="WAIT H1 REJECTION";
            else if(!bos) detail="WAIT M15 BOS";
            else decision=pandaBias+" PULLBACK READY";
         }
      }
   }
   Label(7,"DECISION  "+decision,decision=="WAIT" ? WARN_COLOR : sideColor);
   Label(8,"CHECK  "+(detail=="" ? "CONFIRMED" : detail),detail=="" ? sideColor : WARN_COLOR);
   Label(9,"READ ONLY  |  H1 % IS TREND SCORE, NOT ODDS",MUTED_COLOR);
   ChartRedraw();
}
int OnInit()
{
   h1Adx=iADX(_Symbol,PERIOD_H1,AdxPeriod);
   m15Adx=iADX(_Symbol,PERIOD_M15,AdxPeriod);
   if(h1Adx==INVALID_HANDLE || m15Adx==INVALID_HANDLE) return INIT_FAILED;
   EventSetTimer(2); Render(); return INIT_SUCCEEDED;
}
void OnTimer() { Render(); }
void OnDeinit(const int reason)
{
   EventKillTimer();
   if(h1Adx!=INVALID_HANDLE) IndicatorRelease(h1Adx);
   if(m15Adx!=INVALID_HANDLE) IndicatorRelease(m15Adx);
   ObjectsDeleteAll(0,PREFIX);
}
int OnCalculate(const int rates_total,const int prev_calculated,const datetime &time[],const double &open[],const double &high[],const double &low[],const double &close[],const long &tick_volume[],const long &volume[],const int &spread[])
{
   return rates_total;
}
