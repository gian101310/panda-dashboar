#property strict

#include "PandaDashboardOverlayMT4.Core.mqh"

input string OperatorToken = "";
input PANDA_PANEL_CORNER PanelCorner = PANEL_BOTTOM_LEFT; // Panel position

PandaOverlayMT4 Overlay;

int OnInit()
{
   EventSetTimer(1);
   return Overlay.Initialize("PERSONAL", "x-panda-operator-token", OperatorToken, PanelCorner) ? INIT_SUCCEEDED : INIT_FAILED;
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
