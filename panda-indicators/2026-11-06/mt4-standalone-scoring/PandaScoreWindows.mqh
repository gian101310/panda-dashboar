#ifndef PANDA_SCORE_WINDOWS
#define PANDA_SCORE_WINDOWS
datetime DayStart(datetime value){MqlDateTime d;TimeToStruct(value,d);d.hour=0;d.min=0;d.sec=0;return StructToTime(d);}
datetime BackTradingDays(datetime value,int count){while(count>0){value-=86400;int dow=TimeDayOfWeek(value);if(dow!=0 && dow!=6)count--;}return value;}
datetime MonthStart(datetime value,int shift){MqlDateTime d;TimeToStruct(value,d);d.mon+=shift;while(d.mon<1){d.mon+=12;d.year--;}while(d.mon>12){d.mon-=12;d.year++;}d.day=1;d.hour=0;d.min=0;d.sec=0;return StructToTime(d);}
void BoxWindow(datetime now,int kind,bool advance,datetime &start,datetime &end){
 int offset=advance?0:1;
 if(kind==0){end=MonthStart(now,-offset);start=MonthStart(end,-2);return;}
 datetime day=DayStart(now);
 if(kind==1){int dow=TimeDayOfWeek(day);datetime monday=day-((dow+6)%7)*86400;end=monday-offset*7*86400;start=end-14*86400;return;}
 while(TimeDayOfWeek(day)==0 || TimeDayOfWeek(day)==6)day-=86400;
 end=BackTradingDays(day,offset);start=BackTradingDays(end,2);
}
#endif
