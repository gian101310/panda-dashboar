namespace PandaPlanning
{
    public static class PanelLayoutRules
    {
        public static double Width(double tradePlanWidth,double dashboardWidth,bool minimized,bool dashboardView)
        {
            return minimized||dashboardView?dashboardWidth:tradePlanWidth;
        }
    }
}
