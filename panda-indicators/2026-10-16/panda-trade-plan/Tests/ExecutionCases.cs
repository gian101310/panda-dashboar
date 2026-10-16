using System;
using PandaPlanning;

static class ExecutionCases
{
    static int checks;
    static void Check(bool value,string name){if(!value)throw new Exception(name);checks++;}
    static Plan Limit(){return new Plan {Side="BUY",Kind=ExecutionKind.Limit,Entry=1.1,Stop=1.0975,Target=1.105};}
    static OrderTicket Ticket(Plan plan,ExecutionKind kind,double lots,out string reason,double ask=1.102)
    {return ExecutionRules.Prepare(plan,kind,ask-.0002,ask,.0001,50,lots,100000,1000,1000000,1000,true,"BUY",false,out reason);}
    public static int Run()
    {
        string reason;var p=Limit();var ticket=Ticket(p,ExecutionKind.Limit,.01,out reason);
        Check(ticket!=null&&ticket.VolumeUnits==1000,"0.01 lots converts to 1000 broker units");
        Check(Math.Abs(ticket.StopPips-25)<.000001&&Math.Abs(ticket.TargetPips-50)<.000001,"pending distances from planned entry");
        Check(ticket.Stop==p.Stop&&ticket.Target==p.Target,"pending retains absolute SL/TP prices");
        Check(Ticket(p,ExecutionKind.Limit,.001,out reason)==null,"below broker minimum blocked");
        Check(Ticket(p,ExecutionKind.Limit,20,out reason)==null,"above broker maximum blocked");
        Check(Ticket(p,ExecutionKind.Limit,.015,out reason)==null,"off-step lot size is not silently changed");
        Check(Ticket(p,ExecutionKind.Limit,double.NaN,out reason)==null,"NaN lots blocked");
        Check(Ticket(p,ExecutionKind.Stop,.01,out reason)==null,"order kind mismatch blocked");
        p.Invalid=true;Check(Ticket(p,ExecutionKind.Limit,.01,out reason)==null,"invalid retained plan cannot execute");p.Invalid=false;
        Check(ExecutionRules.Prepare(p,ExecutionKind.Limit,1.1018,1.102,.0001,50,.01,100000,1000,1000000,1000,true,"SELL",false,out reason)==null,"changed scoring direction blocks execution");
        Check(ExecutionRules.Prepare(p,ExecutionKind.Limit,1.1018,1.102,.0001,50,.01,100000,1000,1000000,1000,false,"BUY",false,out reason)==null,"missing scoring context blocks execution");
        p.Kind=ExecutionKind.Stop;Check(Ticket(p,ExecutionKind.Stop,.01,out reason)==null,"buy stop must exceed ask");
        p=Limit();Check(Ticket(p,ExecutionKind.Limit,.01,out reason,1.099)==null,"buy limit cannot exceed ask");
        p=Limit();p.Kind=ExecutionKind.Market;p.Target=1.11;
        ticket=Ticket(p,ExecutionKind.Market,.01,out reason);
        Check(ticket!=null&&ticket.Entry==1.102,"market uses fresh ask rather than old entry");
        Check(Math.Abs(ticket.TargetPips-80)<.000001,"market TP distance computed from fresh quote");
        Check(Ticket(p,ExecutionKind.Market,.01,out reason,1.106)==null,"market target below minimum from fresh quote blocked");
        Check(!ExecutionRules.BrokerDistancesValid(ticket,.5,0,true,.0001,out reason),"broker percent minimum converted to price distance");
        Check(ExecutionRules.BrokerDistancesValid(ticket,10,10,false,.0001,out reason),"broker pip distance validation");
        var levels=new[]{new Level("PDL",1.1),new Level("PDH",1.104),new Level("PWH",1.111)};
        var stop=Rules.Build("BUY",7,false,"ABOVE",true,1.102,.0001,5,levels,PlanMode.ScoringBias,out reason,settings:new PlanSettings {Kind=ExecutionKind.Stop});
        Check(stop!=null&&stop.Entry==1.104&&stop.Target==1.111,"stop plan uses nearest forward breakout reference");
        var market=Rules.Build("BUY",7,false,"ABOVE",true,1.102,.0001,5,levels,PlanMode.ScoringBias,out reason,settings:new PlanSettings {Kind=ExecutionKind.Market});
        Check(market!=null&&market.Entry==1.102&&market.Target==1.111,"market plan uses live quote and eligible target");
        var sell=Rules.Build("SELL",-7,false,"BELOW",true,1.102,.0001,5,new[]{new Level("PDL",1.1),new Level("PWL",1.09)},PlanMode.ScoringBias,out reason,settings:new PlanSettings {Kind=ExecutionKind.Stop});
        Check(sell!=null&&sell.Entry==1.1&&sell.Target==1.09,"SELL stop uses reference below market");
        p=Limit();p.SubmissionId="already-sent";
        Check(Ticket(p,ExecutionKind.Limit,.01,out reason)==null,"saved submitted plan blocks duplicate after reload");
        p=Limit();p.Kind=(ExecutionKind)99;
        Check(Ticket(p,(ExecutionKind)99,.01,out reason)==null,"unknown order kind rejected");
        var shortPlan=new Plan {Side="SELL",Kind=ExecutionKind.Limit,Entry=1.11,Stop=1.1125,Target=1.105};
        Func<ExecutionKind,double,OrderTicket> sellTicket=(kind,bid)=>ExecutionRules.Prepare(shortPlan,kind,bid,bid+.0002,.0001,50,.01,100000,1000,1000000,1000,true,"SELL",false,out reason);
        Check(sellTicket(ExecutionKind.Limit,1.108)!=null,"sell limit above bid accepted");
        Check(sellTicket(ExecutionKind.Limit,1.111)==null,"sell limit below bid rejected");
        shortPlan.Kind=ExecutionKind.Stop;
        Check(sellTicket(ExecutionKind.Stop,1.111)!=null,"sell stop below bid accepted");
        Check(sellTicket(ExecutionKind.Stop,1.108)==null,"sell stop above bid rejected");
        shortPlan.Kind=ExecutionKind.Market;
        Check(sellTicket(ExecutionKind.Market,1.111).Entry==1.111,"sell market uses bid");
        Check(sellTicket(ExecutionKind.Market,1.109)==null,"sell market enforces fresh minimum TP");
        var draft=Rules.StopDraft("BUY",1.102,.0001,5,new PlanSettings());
        Check(draft!=null&&draft.Kind==ExecutionKind.Stop&&draft.Draft,"missing breakout references get explicitly marked Stop draft");
        Check(draft.Entry>1.102&&Rules.MeetsTargetMinimum(draft.Entry,draft.Target,.0001),"BUY draft visible above ask with 50-pip TP");
        Check(Ticket(draft,ExecutionKind.Stop,.01,out reason)==null,"unconfirmed Stop draft cannot submit");
        Check(Rules.ApplyDrawingPrices(draft,1.103,1.104,1.11,.00001,.0001,50),"drag accepts temporarily invalid geometry");
        Check(draft.Entry==1.103&&draft.Stop==1.104&&draft.Target==1.11&&draft.Manual&&draft.Draft,"invalid drag updates panel data without confirming draft");
        Check(!Rules.ShouldAutoPlan(draft,true,false,true),"manual Stop drag survives automatic refresh");
        Check(Rules.ApplyDrawingPrices(draft,1.103,1.1,1.11,.00001,.0001,50)&&!draft.Draft,"valid drag confirms draft");
        Check(Ticket(draft,ExecutionKind.Stop,.01,out reason)!=null,"confirmed valid Stop draft prepares order");
        Check(!Rules.ApplyDrawingPrices(draft,double.NaN,1.1,1.11,.00001,.0001,50)&&draft.Entry==1.103,"nonfinite native values rejected");
        var shortDraft=Rules.StopDraft("SELL",1.102,.0001,5,new PlanSettings {MinimumTargetPips=100});
        Check(shortDraft.Entry<1.102&&Rules.MeetsTargetMinimum(shortDraft.Entry,shortDraft.Target,.0001,100),"SELL Stop draft below bid respects configured TP");
        Check(Rules.ApplyDrawingPrices(shortDraft,1.101,1.104,1.1,.00001,.0001,100)&&shortDraft.Draft,"below-minimum drag remains draft");
        var gate=new SubmissionGate();var now=DateTime.UtcNow;
        Check(gate.Enter(now),"explicit submission enters gate");Check(!gate.Enter(now.AddSeconds(5)),"inflight duplicate blocked");
        gate.Complete();Check(!gate.Enter(now.AddSeconds(1)),"rapid repeated click blocked");Check(gate.Enter(now.AddSeconds(3)),"later deliberate submission allowed");gate.Complete();
        return checks;
    }
}
