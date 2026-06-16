//+------------------------------------------------------------------+
//|                                      AllChartsTimeframeRefresher |
//|                        Forces MT4 charts to reload by timeframe  |
//+------------------------------------------------------------------+
#property strict
#property version   "1.00"
#property description "Refreshes all open MT4 charts by switching timeframe away and back."
#property description "Attach this EA to one controller chart."

input int  RefreshSeconds              = 10;
input int  SwitchDelayMilliseconds     = 250;
input bool RefreshControllerChart      = false;
input bool RefreshOnlySameSymbol       = false;
input bool ShowControllerChartComment  = true;

bool g_refreshing = false;

int OnInit()
{
   int interval = MathMax(1, RefreshSeconds);
   EventSetTimer(interval);

   if(ShowControllerChartComment)
   {
      Comment("AllChartsTimeframeRefresher running\n",
              "Interval: ", interval, " seconds\n",
              "Refresh controller chart: ", BoolText(RefreshControllerChart), "\n",
              "Refresh only same symbol: ", BoolText(RefreshOnlySameSymbol));
   }

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
   if(g_refreshing)
      return;

   g_refreshing = true;
   RefreshAllCharts();
   g_refreshing = false;
}

void RefreshAllCharts()
{
   long controllerChartId = ChartID();
   string controllerSymbol = Symbol();
   long chartId = ChartFirst();

   while(chartId >= 0)
   {
      if(ShouldRefreshChart(chartId, controllerChartId, controllerSymbol))
         ForceTimeframeRefresh(chartId);

      chartId = ChartNext(chartId);
   }
}

bool ShouldRefreshChart(const long chartId, const long controllerChartId, const string controllerSymbol)
{
   if(!RefreshControllerChart && chartId == controllerChartId)
      return(false);

   if(RefreshOnlySameSymbol && ChartSymbol(chartId) != controllerSymbol)
      return(false);

   int period = ChartPeriod(chartId);
   if(period <= 0)
      return(false);

   return(true);
}

void ForceTimeframeRefresh(const long chartId)
{
   string symbol = ChartSymbol(chartId);
   int originalPeriod = ChartPeriod(chartId);
   int temporaryPeriod = AlternatePeriod(originalPeriod);

   if(symbol == "" || originalPeriod <= 0 || temporaryPeriod <= 0)
      return;

   ChartSetSymbolPeriod(chartId, symbol, temporaryPeriod);
   ChartRedraw(chartId);

   if(SwitchDelayMilliseconds > 0)
      Sleep(SwitchDelayMilliseconds);

   ChartSetSymbolPeriod(chartId, symbol, originalPeriod);
   ChartRedraw(chartId);
}

int AlternatePeriod(const int period)
{
   switch(period)
   {
      case PERIOD_M1:  return(PERIOD_M5);
      case PERIOD_M5:  return(PERIOD_M1);
      case PERIOD_M15: return(PERIOD_M5);
      case PERIOD_M30: return(PERIOD_M15);
      case PERIOD_H1:  return(PERIOD_M30);
      case PERIOD_H4:  return(PERIOD_H1);
      case PERIOD_D1:  return(PERIOD_H4);
      case PERIOD_W1:  return(PERIOD_D1);
      case PERIOD_MN1: return(PERIOD_W1);
   }

   if(period < PERIOD_H1)
      return(PERIOD_M1);

   return(PERIOD_H1);
}

string BoolText(const bool value)
{
   if(value)
      return("true");

   return("false");
}
//+------------------------------------------------------------------+
