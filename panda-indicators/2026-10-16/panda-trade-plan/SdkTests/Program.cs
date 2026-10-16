using System;
using System.Reflection;
using cAlgo.API;
using PandaPlanning;

public class FixedSizeDrawing : DispatchProxy
{
    public ChartRiskRewardType Current=new ChartRiskRewardFixedSizeType(1000);
    public int Writes;
    protected override object Invoke(MethodInfo method,object[] args)
    {
        if(method.Name=="get_Type")return Current;
        if(method.Name=="set_Type"){Current=(ChartRiskRewardType)args[0];Writes++;return null;}
        if(method.Name=="set_VolumeInUnits")throw new InvalidOperationException("Can't set volume when type is FixedSize.");
        throw new NotSupportedException(method.Name);
    }
}
static class Program
{
    static void Main()
    {
        var drawing=DispatchProxy.Create<ChartRiskReward,FixedSizeDrawing>();
        var fake=(FixedSizeDrawing)(object)drawing;
        RiskRewardPreview.SetFixedVolume(drawing,1000);
        RiskRewardPreview.SetFixedVolume(drawing,2000);
        if(((ChartRiskRewardFixedSizeType)fake.Current).VolumeInUnits!=2000)throw new Exception("Lot change did not update fixed-size type");
        if(fake.Writes!=1)throw new Exception("Unchanged volume should not rewrite the drawing");
        Console.WriteLine("PASS: fixed-size SDK regression; no forbidden volume setter, no redundant updates");
    }
}
