//+------------------------------------------------------------------+
//|                                   AllChartsTimeframeRefresher_v2 |
//|             Forces MT4 charts to reload using H1/H4/D1 timeframes |
//+------------------------------------------------------------------+
#property strict
#property version   "2.00"
#property description "Refreshes all open MT4 charts by switching to H1/H4/D1, waiting, then switching back."
#property description "Attach this EA to one unused controller chart."

input int  RefreshSeconds             = 3600;
input int  RestoreDelaySeconds        = 3;
input bool RefreshControllerChart     = false;
input bool RefreshOnlySameSymbol      = false;
input bool ShowControllerChartComment = true;

long   g_chartIds[];
string g_symbols[];
int    g_originalPeriods[];
bool   g_waitingToRestore = false;

int OnInit()
{
   EventSetTimer(1);
   ShowStatus("waiting");
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   EventKillTimer();

   if(ShowControllerChartComment)
      Comment("");
}

void OnTimer()
{
   static datetime nextRefreshTime = 0;
   static datetime restoreTime = 0;

   datetime now = TimeCurrent();

   if(nextRefreshTime == 0)
      nextRefreshTime = now + MathMax(1, RefreshSeconds);

   if(g_waitingToRestore)
   {
      if(now >= restoreTime)
      {
         RestoreOriginalTimeframes();
         g_waitingToRestore = false;
         nextRefreshTime = now + MathMax(1, RefreshSeconds);
         ShowStatus("restored");
      }

      return;
   }

   if(now >= nextRefreshTime)
   {
      SwitchChartsToRefreshTimeframes();
      restoreTime = now + MathMax(1, RestoreDelaySeconds);
      g_waitingToRestore = true;
      ShowStatus("refreshing");
   }
}

void SwitchChartsToRefreshTimeframes()
{
   ArrayResize(g_chartIds, 0);
   ArrayResize(g_symbols, 0);
   ArrayResize(g_originalPeriods, 0);

   long controllerChartId = ChartID();
   string controllerSymbol = Symbol();
   long chartId = ChartFirst();

   while(chartId >= 0)
   {
      if(ShouldRefreshChart(chartId, controllerChartId, controllerSymbol))
         StoreAndSwitchChart(chartId);

      chartId = ChartNext(chartId);
   }
}

bool ShouldRefreshChart(const long chartId, const long controllerChartId, const string controllerSymbol)
{
   if(!RefreshControllerChart && chartId == controllerChartId)
      return(false);

   if(RefreshOnlySameSymbol && ChartSymbol(chartId) != controllerSymbol)
      return(false);

   if(ChartSymbol(chartId) == "" || ChartPeriod(chartId) <= 0)
      return(false);

   return(true);
}

void StoreAndSwitchChart(const long chartId)
{
   string symbol = ChartSymbol(chartId);
   int originalPeriod = ChartPeriod(chartId);
   int refreshPeriod = RefreshPeriodFor(originalPeriod);

   int index = ArraySize(g_chartIds);
   ArrayResize(g_chartIds, index + 1);
   ArrayResize(g_symbols, index + 1);
   ArrayResize(g_originalPeriods, index + 1);

   g_chartIds[index] = chartId;
   g_symbols[index] = symbol;
   g_originalPeriods[index] = originalPeriod;

   ChartSetSymbolPeriod(chartId, symbol, refreshPeriod);
   ChartRedraw(chartId);
}

void RestoreOriginalTimeframes()
{
   for(int i = 0; i < ArraySize(g_chartIds); i++)
   {
      if(g_chartIds[i] < 0 || g_symbols[i] == "" || g_originalPeriods[i] <= 0)
         continue;

      ChartSetSymbolPeriod(g_chartIds[i], g_symbols[i], g_originalPeriods[i]);
      ChartRedraw(g_chartIds[i]);
   }
}

int RefreshPeriodFor(const int originalPeriod)
{
   if(originalPeriod == PERIOD_H1)
      return(PERIOD_H4);

   if(originalPeriod == PERIOD_H4)
      return(PERIOD_D1);

   return(PERIOD_H1);
}

string PeriodText(const int period)
{
   switch(period)
   {
      case PERIOD_M1:  return("M1");
      case PERIOD_M5:  return("M5");
      case PERIOD_M15: return("M15");
      case PERIOD_M30: return("M30");
      case PERIOD_H1:  return("H1");
      case PERIOD_H4:  return("H4");
      case PERIOD_D1:  return("D1");
      case PERIOD_W1:  return("W1");
      case PERIOD_MN1: return("MN1");
   }

   return(IntegerToString(period));
}

void ShowStatus(const string state)
{
   if(!ShowControllerChartComment)
      return;

   Comment("AllChartsTimeframeRefresher v2\n",
           "State: ", state, "\n",
           "Refresh every: ", RefreshSeconds, " seconds\n",
           "Restore delay: ", RestoreDelaySeconds, " seconds\n",
           "Controller chart included: ", BoolText(RefreshControllerChart), "\n",
           "Only same symbol: ", BoolText(RefreshOnlySameSymbol));
}

string BoolText(const bool value)
{
   if(value)
      return("true");

   return("false");
}
//+------------------------------------------------------------------+
