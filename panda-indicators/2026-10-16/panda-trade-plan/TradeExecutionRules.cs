using System;

namespace PandaPlanning
{
    public enum ExecutionKind { Limit, Stop, Market }
    public sealed class OrderTicket
    {
        public ExecutionKind Kind;
        public string Side;
        public double Entry,Stop,Target,VolumeUnits,StopPips,TargetPips;
    }
    public static class ExecutionRules
    {
        public static OrderTicket Prepare(Plan plan,ExecutionKind kind,double bid,double ask,double pip,double minimum,
            double lots,double lotUnits,double minUnits,double maxUnits,double step,bool ready,string bias,bool hardInvalid,out string reason)
        {
            reason="Refresh a valid plan with the selected order type first";
            if(plan!=null&&plan.Draft){reason="Manual Stop draft: drag valid levels or click Apply edited prices to confirm";return null;}
            if(plan==null||plan.Invalid||!string.IsNullOrEmpty(plan.SubmissionId)||!Enum.IsDefined(typeof(ExecutionKind),kind)||plan.Kind!=kind||!ready||hardInvalid||plan.Side!=bias)return null;
            reason="Invalid live quote";
            if(!Rules.Finite(bid)||!Rules.Finite(ask)||bid<=0||ask<bid||!Rules.Finite(pip)||pip<=0)return null;
            reason="Lot size must match the broker minimum, maximum and step";
            double units=lots*lotUnits;
            if(!Rules.Finite(units)||units<=0||units<minUnits-.000001||units>maxUnits+.000001||step<=0||
                Math.Abs(units/step-Math.Round(units/step))>.000001)return null;
            bool buy=plan.Side=="BUY";double quote=buy?ask:bid,entry=kind==ExecutionKind.Market?quote:plan.Entry;
            reason="Entry is on the wrong side of the live price for this order type";
            if(kind==ExecutionKind.Limit&&(buy?entry>=quote:entry<=quote)||kind==ExecutionKind.Stop&&(buy?entry<=quote:entry>=quote))return null;
            reason="Check SL/TP direction and minimum TP1 distance";
            if(!Rules.ValidGeometry(plan.Side,entry,plan.Stop,plan.Target)||!Rules.MeetsTargetMinimum(entry,plan.Target,pip,minimum))return null;
            reason="Ready";
            return new OrderTicket {Kind=kind,Side=plan.Side,Entry=entry,Stop=plan.Stop,Target=plan.Target,VolumeUnits=units,
                StopPips=Math.Abs(entry-plan.Stop)/pip,TargetPips=Math.Abs(entry-plan.Target)/pip};
        }
        public static bool BrokerDistancesValid(OrderTicket ticket,double minStop,double minTarget,bool percentage,double pip,out string reason)
        {
            reason="SL/TP closer than the broker minimum";
            if(ticket==null)return false;
            double factor=percentage?ticket.Entry/100:pip;
            bool valid=Math.Abs(ticket.Entry-ticket.Stop)+1e-10>=minStop*factor&&Math.Abs(ticket.Entry-ticket.Target)+1e-10>=minTarget*factor;
            if(valid)reason="Ready";return valid;
        }
    }
    public sealed class SubmissionGate
    {
        bool busy;DateTime last=DateTime.MinValue;
        public bool Enter(DateTime now){if(busy||now-last<TimeSpan.FromSeconds(2))return false;busy=true;last=now;return true;}
        public void Complete(){busy=false;}
    }
}
