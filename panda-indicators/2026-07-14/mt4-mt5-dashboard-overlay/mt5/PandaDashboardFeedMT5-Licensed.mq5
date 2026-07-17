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

void OnTick()
{
}

void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
{
   Overlay.OnChartEvent(id, lparam, dparam, sparam);
}
