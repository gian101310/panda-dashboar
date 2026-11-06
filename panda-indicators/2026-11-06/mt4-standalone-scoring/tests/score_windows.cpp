#include <ctime>
#include <cassert>
#include <iostream>
using datetime=long;
struct MqlDateTime {int year,mon,day,hour,min,sec;};
void TimeToStruct(datetime v,MqlDateTime &d){auto t=*gmtime(&v);d={t.tm_year+1900,t.tm_mon+1,t.tm_mday,t.tm_hour,t.tm_min,t.tm_sec};}
datetime StructToTime(MqlDateTime d){std::tm t={};t.tm_year=d.year-1900;t.tm_mon=d.mon-1;t.tm_mday=d.day;t.tm_hour=d.hour;t.tm_min=d.min;t.tm_sec=d.sec;return timegm(&t);}
int TimeDayOfWeek(datetime v){return gmtime(&v)->tm_wday;}
#include "../PandaScoreWindows.mqh"
datetime at(int y,int m,int d){return StructToTime({y,m,d,0,0,0});}
int main(){datetime start,end;auto monday=at(2026,11,9);
 BoxWindow(monday,2,false,start,end);assert(start==at(2026,11,4));assert(end==at(2026,11,6));
 BoxWindow(monday,2,true,start,end);assert(start==at(2026,11,5));assert(end==at(2026,11,9));
 BoxWindow(monday,1,false,start,end);assert(start==at(2026,10,19));assert(end==at(2026,11,2));
 BoxWindow(monday,1,true,start,end);assert(start==at(2026,10,26));assert(end==at(2026,11,9));
 BoxWindow(monday,0,false,start,end);assert(start==at(2026,8,1));assert(end==at(2026,10,1));
 BoxWindow(monday,0,true,start,end);assert(start==at(2026,9,1));assert(end==at(2026,11,1));
 BoxWindow(at(2026,11,8),2,false,start,end);assert(start==at(2026,11,3));assert(end==at(2026,11,5));
 BoxWindow(at(2027,1,2),0,false,start,end);assert(start==at(2026,10,1));assert(end==at(2026,12,1));
 std::cout<<"Box window checks passed (main, ADV, weekends, year rollover)\n";
}
