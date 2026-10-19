using System;
using System.Reflection;
using System.Text.Json;
using cAlgo;
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
        var payload=JsonSerializer.Serialize(new {schema_version=1,max_age_seconds=600,pairs=new[]{new {
            symbol="EURAUD",gap=-7.0,bias="SELL",hard_invalid=false,box_h4_trend="RANGING",box_h1_trend="RANGING",
            pl_zone="BELOW",pl_g1_valid=true,base_currency="EUR",base_score_tf="D1:-5",
            quote_currency="AUD",quote_score_tf="D1:+2",updated_at="2026-10-19T19:55:05Z"}}});
        var feed=OverlaySnapshotParser.Parse(payload,DateTime.UtcNow);
        if(feed.Pairs["EURAUD"].Gap!=-7||feed.Pairs["EURAUD"].BaseScoreTf!="D1:-5"||
            feed.Pairs["EURAUD"].QuoteScoreTf!="D1:+2"||!feed.Pairs["EURAUD"].PandaLinesValid)
            throw new Exception("Dashboard feed fields did not parse");
        if(PandaSymbolNormalizer.Normalize("EURAUD.a")!="EURAUD")throw new Exception("Broker suffix did not normalize");
        Console.WriteLine("PASS: fixed-size SDK regression and dashboard feed parsing");
    }
}
