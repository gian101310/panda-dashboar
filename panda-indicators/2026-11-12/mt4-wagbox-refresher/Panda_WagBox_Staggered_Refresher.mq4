// Refresh WagBox charts in the same D1 -> H4 -> H1 order used manually.
// One chart is processed at a time so indicators are not reloaded together.
#property strict
#property version "1.02"
#property description "Staggered D1/H4/H1 refresh for charts with WagBox. Attach to one controller chart."

input int StartMinute = 30; // Dubai PC clock minute, before the :01 snapshot
input int StepDelaySeconds = 4;
input int BetweenChartsSeconds = 15;

long g_charts[];
int g_chartIndex = 0;
long g_activeChart = -1;
string g_activeSymbol = "";
int g_originalPeriod = 0;
int g_step = 0;
int g_expectedPeriod = 0;
datetime g_stepIssuedAt = 0;
datetime g_nextAction = 0;
datetime g_nextCycle = 0;

int OnInit()
{
   EventSetTimer(1);
   g_nextCycle = NextHourlyRun(TimeLocal());
   Print("Panda WagBox staggered refresher ready; next pass at ",
         TimeToString(g_nextCycle, TIME_DATE|TIME_MINUTES));
   return(INIT_SUCCEEDED);
}

datetime NextHourlyRun(const datetime now)
{
   MqlDateTime clock;
   TimeToStruct(now, clock);
   clock.min = MathMax(0, MathMin(59, StartMinute));
   clock.sec = 0;
   datetime scheduled = StructToTime(clock);
   if(scheduled <= now)
      scheduled += 3600;
   return(scheduled);
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   // Do not strand a chart mid-sequence if the controller is removed.
   if(g_activeChart >= 0 && g_originalPeriod > 0 &&
      ChartSymbol(g_activeChart) == g_activeSymbol &&
      ChartPeriod(g_activeChart) != g_originalPeriod)
      ChartSetSymbolPeriod(g_activeChart, g_activeSymbol,
                           (ENUM_TIMEFRAMES)g_originalPeriod);
}

void OnTimer()
{
   datetime now = TimeLocal();
   if(now < g_nextAction)
      return;

   if(g_activeChart >= 0)
   {
      AdvanceChart(now);
      return;
   }

   if(g_chartIndex >= ArraySize(g_charts))
   {
      if(now < g_nextCycle)
         return;
      CollectWagBoxCharts();
      g_chartIndex = 0;
      Print("Panda WagBox refresher: starting ", ArraySize(g_charts), " charts");
      if(ArraySize(g_charts) == 0)
      {
         g_nextCycle = NextHourlyRun(now);
         g_nextAction = g_nextCycle;
         return;
      }
   }

   StartNextChart(now);
}

void CollectWagBoxCharts()
{
   ArrayResize(g_charts, 0);
   long controller = ChartID();
   long chart = ChartFirst();
   int inspected = 0;
   while(chart >= 0 && inspected < 100)
   {
      if(chart != controller && HasWagBox(chart))
      {
         int size = ArraySize(g_charts);
         ArrayResize(g_charts, size + 1);
         g_charts[size] = chart;
      }
      chart = ChartNext(chart);
      inspected++;
   }
}

bool HasWagBox(const long chart)
{
   int count = ChartIndicatorsTotal(chart, 0);
   for(int i = 0; i < count; i++)
      if(StringFind(ChartIndicatorName(chart, 0, i), "WagBox") >= 0)
         return(true);
   return(false);
}

void StartNextChart(const datetime now)
{
   while(g_chartIndex < ArraySize(g_charts))
   {
      long chart = g_charts[g_chartIndex++];
      string symbol = ChartSymbol(chart);
      int period = ChartPeriod(chart);
      if(symbol == "" || period <= 0 || !HasWagBox(chart))
         continue;

      g_activeChart = chart;
      g_activeSymbol = symbol;
      g_originalPeriod = period;
      g_step = 0;
      if(!SetPeriod(PERIOD_D1))
      {
         FinishChart(now);
         continue;
      }
      g_step = 1;
      g_expectedPeriod = PERIOD_D1;
      g_stepIssuedAt = now;
      g_nextAction = now + MathMax(2, StepDelaySeconds);
      return;
   }

   g_nextCycle = NextHourlyRun(now);
   g_nextAction = g_nextCycle;
   Print("Panda WagBox refresher: cycle complete");
}

void AdvanceChart(const datetime now)
{
   if(ChartSymbol(g_activeChart) != g_activeSymbol)
   {
      FinishChart(now);
      return;
   }

   if(ChartPeriod(g_activeChart) != g_expectedPeriod)
   {
      if(now - g_stepIssuedAt < 30)
      {
         g_nextAction = now + 1;
         return;
      }
      Print("Panda WagBox refresher: timed out waiting for ",
            g_activeSymbol, " period ", g_expectedPeriod);
      SetPeriod(g_originalPeriod);
      FinishChart(now);
      return;
   }

   int nextPeriod = 0;
   if(g_step == 1) nextPeriod = PERIOD_H4;
   if(g_step == 2) nextPeriod = PERIOD_H1;

   if(nextPeriod > 0)
   {
      if(!SetPeriod(nextPeriod))
      {
         // A failed queued change must not strand the chart on another period.
         if(ChartPeriod(g_activeChart) != g_originalPeriod)
            SetPeriod(g_originalPeriod);
         FinishChart(now);
         return;
      }
      g_step++;
      g_expectedPeriod = nextPeriod;
      g_stepIssuedAt = now;
      g_nextAction = now + MathMax(2, StepDelaySeconds);
      return;
   }

   Print("Panda WagBox refresher: refreshed ", g_activeSymbol,
         " and finished on H1");
   FinishChart(now);
}

bool SetPeriod(const int period)
{
   ResetLastError();
   if(ChartSetSymbolPeriod(g_activeChart, g_activeSymbol,
                           (ENUM_TIMEFRAMES)period))
      return(true);
   Print("Panda WagBox refresher: chart command failed for ",
         g_activeSymbol, ", error ", GetLastError());
   return(false);
}

void FinishChart(const datetime now)
{
   g_activeChart = -1;
   g_activeSymbol = "";
   g_originalPeriod = 0;
   g_step = 0;
   g_expectedPeriod = 0;
   if(g_chartIndex >= ArraySize(g_charts))
   {
      g_nextCycle = NextHourlyRun(now);
      g_nextAction = g_nextCycle;
      Print("Panda WagBox refresher: cycle complete");
   }
   else
      g_nextAction = now + MathMax(5, BetweenChartsSeconds);
}
