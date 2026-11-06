#ifndef PANDA_RAW_PANEL
#define PANDA_RAW_PANEL
string RawPair(string symbol) {
 StringToUpper(symbol);string supported[]={"AUDCAD","AUDJPY","AUDNZD","AUDUSD","CADJPY","EURAUD","EURCAD","EURGBP","EURJPY","EURNZD","EURUSD","GBPAUD","GBPCAD","GBPJPY","GBPNZD","GBPUSD","NZDCAD","NZDJPY","NZDUSD","USDCAD","USDJPY"};
 string found="";for(int i=0;i<ArraySize(supported);i++)if(StringFind(symbol,supported[i])>=0){if(found!="")return "";found=supported[i];}return found;
}
string RawSigned(int value){return value>0?"+"+IntegerToString(value):IntegerToString(value);}
void RawLabel(string prefix,int line,string text,color clr,int x,int y,int size=10) {
 string id=prefix+IntegerToString(line);if(ObjectFind(0,id)<0)ObjectCreate(0,id,OBJ_LABEL,0,0,0);
 ObjectSetInteger(0,id,OBJPROP_CORNER,CORNER_RIGHT_UPPER);ObjectSetInteger(0,id,OBJPROP_ANCHOR,ANCHOR_RIGHT_UPPER);
 ObjectSetInteger(0,id,OBJPROP_XDISTANCE,x);ObjectSetInteger(0,id,OBJPROP_YDISTANCE,y+line*19);
 ObjectSetInteger(0,id,OBJPROP_COLOR,clr);ObjectSetInteger(0,id,OBJPROP_FONTSIZE,size);ObjectSetString(0,id,OBJPROP_FONT,"Consolas");
 ObjectSetInteger(0,id,OBJPROP_SELECTABLE,false);ObjectSetInteger(0,id,OBJPROP_HIDDEN,true);ObjectSetString(0,id,OBJPROP_TEXT,text);
}
void RawRemove(string prefix){for(int i=ObjectsTotal(0,-1,-1)-1;i>=0;i--){string name=ObjectName(0,i);if(StringFind(name,prefix)==0)ObjectDelete(0,name);}}
string RawSpread(){double p=MarketInfo(Symbol(),MODE_POINT),pip=p*((Digits==3 || Digits==5)?10:1);if(p<=0)return "SPREAD: --";double spread=MathMax(0,Ask-Bid);return "SPREAD: "+DoubleToString(spread/pip,1)+" pips ("+DoubleToString(spread/p,0)+" points)";}
#endif
