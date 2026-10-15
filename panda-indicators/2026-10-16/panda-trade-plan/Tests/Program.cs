using System;
using PandaPlanning;
class Program
{
    static int checks;
    static void Check(bool condition,string name){if(!condition)throw new Exception(name);checks++;}
    static void Near(double actual,double expected,string name){Check(Math.Abs(actual-expected)<0.000001,name);}
    static Plan Buy(double target,out string reason){return Rules.Build("BUY",7,false,"ABOVE",true,1.102,.0001,5,new[]{new Level("PDL",1.1),new Level("PDH",target)},PlanMode.ScoringBias,out reason);}
    static void Main()
    {
        string reason;
        var p50=Buy(1.105,out reason);Check(p50!=null,"50 pip plan");Near(p50.Entry,1.1,"entry prior low");Near(p50.Target,1.105,"TP1 reference");Near(p50.Stop,1.0975,"50 pip TP SL divided by 2");
        Near(Buy(1.1099,out reason).Stop,1.09505,"99 pip TP divided by 2");
        Near(Buy(1.11,out reason).Stop,1.09667,"100 pip TP divided by 3");
        Near(Buy(1.1199,out reason).Stop,1.09337,"199 pip TP divided by 3");
        Near(Buy(1.12,out reason).Stop,1.095,"200 pip TP divided by 4");
        Near(Buy(1.125,out reason).Stop,1.09375,"250 pip TP divided by 4");
        Near(Buy(1.13,out reason).Stop,1.094,"300 pip TP existing divide by 5");
        Check(Buy(1.10499,out reason)==null,"49.9 pip target rejected");
        var sell=Rules.Build("SELL",-8,false,"BELOW",true,1.275,.0001,5,new[]{new Level("PDH",1.28),new Level("PDL",1.26)},PlanMode.ScoringBias,out reason);
        Check(sell!=null,"SELL plan");Near(sell.Stop,1.285,"SELL 200 pip target SL 50 pip");
        var levels=new[]{new Level("PDL",1.1),new Level("PWH",1.12)};
        Check(Rules.Build("BUY",4,false,"ABOVE",true,1.102,.0001,5,levels,PlanMode.ScoringBias,out reason)==null,"small gap rejected");
        Check(Rules.Build("BUY",7,true,"ABOVE",true,1.102,.0001,5,levels,PlanMode.ScoringBias,out reason)==null,"hard invalid rejected");
        Check(Rules.Build("SELL",7,false,"ABOVE",true,1.102,.0001,5,levels,PlanMode.ScoringBias,out reason)==null,"bias gap mismatch rejected");
        Check(Rules.Build("BUY",7,false,"BETWEEN",false,1.102,.0001,5,levels,PlanMode.ScoringBias,out reason)!=null,"scoring mode does not require Panda Lines");
        Check(Rules.Build("BUY",7,false,"BETWEEN",false,1.102,.0001,5,levels,PlanMode.PandaLinesConfirmed,out reason)==null,"optional confirmed mode checks Panda Lines");
        var combined=Rules.Build("BUY",7,false,"ABOVE",true,1.102,.0001,5,levels,PlanMode.ScoringBias,out reason,new[]{new Level("PDL",1.1),new Level("H1 Box Low",1.101)});
        Near(combined.Entry,1.101,"nearest period or box entry");Check(combined.EntryLabel=="H1 Box Low","reference name preserved");
        var jpy=Rules.Build("BUY",7,false,"ABOVE",true,160.5,.01,3,new[]{new Level("PDL",160),new Level("PDH",161)},PlanMode.ScoringBias,out reason);
        Near(jpy.Stop,159.667,"JPY 100 pip target divided by 3");
        Check(Rules.MeetsTargetMinimum(160,160.5,.01),"JPY target minimum");Check(!Rules.MeetsTargetMinimum(1.1,1.10499,.0001),"minimum precision");
        Check(Rules.ValidGeometry("BUY",1.1,1.09,1.12),"BUY geometry");Check(!Rules.ValidGeometry("BUY",1.1,1.101,1.12),"invalid stop");
        Check(Rules.ValidGuides("BUY",1.12,1.13,1.14),"ordered targets");Check(!Rules.ValidGuides("BUY",1.12,1.11,1.14),"bad target");Check(!Rules.ValidGuides("SELL",1.12,null,1.10),"TP3 needs TP2");
        var now=new DateTime(2026,10,16,19,59,0,DateTimeKind.Utc);
        Check(!Rules.Expired(now,now.AddSeconds(30),PlanExpiry.NextDubaiDay),"same Dubai day");Check(Rules.Expired(now,now.AddMinutes(2),PlanExpiry.NextDubaiDay),"Dubai midnight");
        Check(!Rules.Expired(now,now.AddHours(23),PlanExpiry.After24Hours),"23 hours");Check(Rules.Expired(now,now.AddHours(24),PlanExpiry.After24Hours),"24 hours");Check(!Rules.Expired(now,now.AddDays(4),PlanExpiry.ManualOnly),"manual retention");
        Check(Rules.BiasInvalid("BUY","SELL",false),"opposite bias");Check(Rules.BiasInvalid("BUY","WAIT",false),"WAIT invalid");Check(!Rules.BiasInvalid("BUY","BUY",false),"same bias");
        Console.WriteLine("PASS: "+checks+" trade-plan assertions");
    }
}
