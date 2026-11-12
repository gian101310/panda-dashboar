// Refresh WagBox charts in the same D1 -> H4 -> H1 order used manually.
// One chart is processed at a time so indicators are not reloaded together.
#property strict
#property version "1.00"
#property description "Staggered D1/H4/H1 refresh for charts with WagBox. Attach to one controller chart."

input int RefreshEveryMinutes = 60;
input int FirstRefreshDelaySeconds = 60;
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
   g_nextCycle = TimeLocal() + MathMax(1, FirstRefreshDelaySeconds);
   Print("Panda WagBox staggered refresher ready; interval=", RefreshEveryMinutes,
         " minutes, first run in ", FirstRefreshDelaySeconds, " seconds");
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   // Do not leave a chart on D1 or H4 if the controller is removed mid-cycle.
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
         g_nextCycle = now + MathMax(1, RefreshEveryMinutes) * 60;
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

   g_nextCycle = now + MathMax(1, RefreshEveryMinutes) * 60;
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
   if(g_step == 3 && g_originalPeriod != PERIOD_H1)
      nextPeriod = g_originalPeriod;

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
         " and restored period ", g_originalPeriod);
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
      g_nextCycle = now + MathMax(1, RefreshEveryMinutes) * 60;
      g_nextAction = g_nextCycle;
      Print("Panda WagBox refresher: cycle complete");
   }
   else
      g_nextAction = now + MathMax(5, BetweenChartsSeconds);
}
