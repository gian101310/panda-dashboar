using System;

namespace PandaPlanning
{
    public struct ScoreWindow
    {
        public DateTime Start;
        public DateTime End;
        public ScoreWindow(DateTime start,DateTime end){Start=start;End=end;}
    }

    public static class ScoreWindows
    {
        private static DateTime TradingDayBack(DateTime date,int count)
        {
            while(count>0)
            {
                date=date.AddDays(-1);
                if(date.DayOfWeek!=DayOfWeek.Saturday&&date.DayOfWeek!=DayOfWeek.Sunday)count--;
            }
            return date;
        }

        public static ScoreWindow Short(DateTime now)
        {
            var day=now.Date;
            while(day.DayOfWeek==DayOfWeek.Saturday||day.DayOfWeek==DayOfWeek.Sunday)day=day.AddDays(-1);
            var end=TradingDayBack(day,1);
            return new ScoreWindow(TradingDayBack(end,2),end);
        }

        public static ScoreWindow Weekly(DateTime now)
        {
            var monday=now.Date.AddDays(-(((int)now.DayOfWeek+6)%7));
            var end=monday.AddDays(-7);
            return new ScoreWindow(end.AddDays(-14),end);
        }

        public static ScoreWindow Monthly(DateTime now)
        {
            var month=new DateTime(now.Year,now.Month,1);
            var end=month.AddMonths(-1);
            return new ScoreWindow(end.AddMonths(-2),end);
        }
    }
}
