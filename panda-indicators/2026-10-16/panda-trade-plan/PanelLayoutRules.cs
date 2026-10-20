namespace PandaPlanning
{
    public static class PanelLayoutRules
    {
        public static bool UseDashboardRoot(bool minimized,bool dashboardView)
        {
            return minimized||dashboardView;
        }
        public static double DashboardWidth(bool minimized)
        {
            return minimized?210:260;
        }
        public static bool ShowDashboardBody(bool minimized)
        {
            return !minimized;
        }
        public static bool ShowDashboardCompact(bool minimized)
        {
            return minimized;
        }
        public static bool ShowDashboardSwitch(bool minimized)
        {
            return !minimized;
        }
    }
}
