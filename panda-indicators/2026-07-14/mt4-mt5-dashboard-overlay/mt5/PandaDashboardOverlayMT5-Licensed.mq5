#property indicator_chart_window
#property indicator_plots 0

#include "PandaDashboardOverlayMT5.Core.mqh"

input PANDA_PANEL_CORNER PanelCorner = PANEL_BOTTOM_LEFT; // Panel position

PandaOverlayMT5 Overlay;

int OnInit()
{
   EventSetTimer(1);
   return Overlay.Initialize("LICENSED", "x-panda-account-number", (string)AccountInfoInteger(ACCOUNT_LOGIN), PanelCorner) ? INIT_SUCCEEDED : INIT_FAILED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   Overlay.Shutdown();
}

void OnTimer()
{
   Overlay.OnTimer();
}

void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
{
   Overlay.OnChartEvent(id, lparam, dparam, sparam);
}

int OnCalculate(const int rates_total, const int prev_calculated, const datetime &time[],
                const double &open[], const double &high[], const double &low[], const double &close[],
                const long &tick_volume[], const long &volume[], const int &spread[])
{
   return Overlay.OnCalculate(rates_total, prev_calculated);
}
