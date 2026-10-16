using System;
using cAlgo.API;

namespace PandaPlanning
{
    public static class RiskRewardPreview
    {
        public static void SetFixedVolume(ChartRiskReward drawing,double units)
        {
            // FixedSize prohibits the generic VolumeInUnits setter at runtime.
            // Its immutable size is changed by replacing the type descriptor.
            var current=drawing.Type as ChartRiskRewardFixedSizeType;
            if(current==null||Math.Abs(current.VolumeInUnits-units)>.000001)
                drawing.Type=new ChartRiskRewardFixedSizeType(units);
        }
    }
}
