namespace PandaPlanning
{
    public static class PanelLayoutRules
    {
        public static bool UseDashboardRoot(bool minimized,bool dashboardView)
        {
            return minimized||dashboardView;
        }
    }
}
