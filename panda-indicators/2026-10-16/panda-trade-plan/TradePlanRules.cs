using System;
using System.Collections.Generic;
using System.Linq;

namespace PandaPlanning
{
    public enum PlanMode { ScoringBias, PandaLinesConfirmed }
    public enum PlanExpiry { NextDubaiDay, After24Hours, ManualOnly }
    public enum BiasChange { MarkInvalid, DeletePlan }
    public enum EntryReference { PreviousLevelsAndBoxes, PreviousPeriodLevels, PandaBoxes }
    public sealed class PlanSettings
    {
        public ExecutionKind Kind;
        public double MinimumTargetPips=50, MaxTargetPips, MaxEntryPips;
        public double StopUnder100=2, StopUnder200=3, StopUnder300=4, StopFrom300=5;
    }
    public sealed class Level
    {
        public string Name; public double Price;
        public Level(string name,double price) { Name=name; Price=price; }
    }
    public sealed class Plan
    {
        public string Side, EntryLabel, TargetLabel, Reference, InvalidReason, Settings, SubmissionId;
        public PlanMode Mode;
        public ExecutionKind Kind;
        public int RuleVersion;
        public double Entry, Stop, Target, ClearTarget;
        public double? Target2, Target3;
        public DateTime CreatedUtc;
        public DateTime AnchorStart, AnchorEnd;
        public bool Manual, Invalid, Draft;
    }
    public static class Rules
    {
        public static int DominantVote(int positive,int negative)
        {return positive>=-negative?positive:negative;}
        public static int Dominant(int positive,int negative)
        {return positive == -negative ? 0 : positive > -negative ? positive : negative;}
        public static int CurrencyScore(IEnumerable<int> positives,IEnumerable<int> negatives,out bool conflict)
        {
            var raw=positives.Concat(negatives).ToArray();
            conflict=raw.Any(v=>v>=4)&&raw.Any(v=>v<=-4);
            if(conflict)return 0;
            return Dominant(raw.Where(v=>v>0).DefaultIfEmpty(0).Max(),raw.Where(v=>v<0).DefaultIfEmpty(0).Min());
        }
        public static string InvalidationReason(string baseCurrency,string quoteCurrency,bool baseConflict,bool quoteConflict,int baseScore,int quoteScore)
        {
            if(baseConflict||quoteConflict)return (baseConflict?baseCurrency:"")+(baseConflict&&quoteConflict?" / ":"")+
                (quoteConflict?quoteCurrency:"")+": opposing extremes (+4 or higher and -4 or lower)";
            return Math.Abs(baseScore)<4&&Math.Abs(quoteScore)<4?baseCurrency+" / "+quoteCurrency+": both currencies neutral (no extreme >=4)":"";
        }
        public static Plan Build(string side,double gap,bool hardInvalid,string zone,bool linesValid,
            double price,double pip,int digits,IEnumerable<Level> levels,PlanMode mode,out string reason,IEnumerable<Level> entryReferences=null,PlanSettings settings=null)
        {
            reason="No valid pullback setup";
            if(hardInvalid || (side!="BUY" && side!="SELL") || Math.Abs(gap)<5 || (side=="BUY"?gap<5:gap> -5))return null;
            bool buy=side=="BUY";
            if(mode==PlanMode.PandaLinesConfirmed && (!linesValid||zone!=(buy?"ABOVE":"BELOW")))
            {reason="Panda Lines not confirmed";return null;}
            if(!Finite(price)||!Finite(pip)||pip<=0)return null;
            settings=settings??new PlanSettings();
            double minimum=Math.Max(50,settings.MinimumTargetPips);
            var all=levels.Where(EligibleReference).ToArray();
            var refs=(entryReferences??all).Where(EligibleReference);
            var entries=refs.Where(l=>(settings.Kind==ExecutionKind.Stop?(buy?l.Price>price:l.Price<price):(buy?l.Price<price:l.Price>price)) &&
                (settings.MaxEntryPips<=0||Math.Abs(l.Price-price)/pip<=settings.MaxEntryPips+0.000001)).OrderBy(l=>Math.Abs(l.Price-price));
            if(settings.Kind==ExecutionKind.Market)entries=new[]{new Level("Live market",price)}.OrderBy(l=>0);
            var targets=all;
            foreach(var entry in entries)
            {
                var clear=targets.Where(t=>(buy?t.Price>entry.Price:t.Price<entry.Price) && Math.Abs(t.Price-entry.Price)/pip>=minimum-0.000001 &&
                    (settings.MaxTargetPips<=0||Math.Abs(t.Price-entry.Price)/pip<=settings.MaxTargetPips+0.000001))
                    .OrderBy(t=>Math.Abs(t.Price-entry.Price)).ToArray();
                if(clear.Length==0)continue;
                var target=clear.First();
                double entryPrice=Math.Round(entry.Price,digits),tp=Math.Round(target.Price,digits);
                double distance=Math.Abs(tp-entryPrice);
                double targetPips=Math.Round(distance/pip,6);
                double divisor=targetPips>=300?settings.StopFrom300:targetPips>=200?settings.StopUnder300:targetPips>=100?settings.StopUnder200:settings.StopUnder100;
                if(!Finite(divisor)||divisor<=0)continue;
                double stop=Math.Round(entryPrice+(buy?-1:1)*distance/divisor,digits);
                if(!ValidGeometry(side,entryPrice,stop,tp)||!MeetsTargetMinimum(entryPrice,tp,pip,minimum))continue;
                var result=new Plan {Side=side,Mode=mode,RuleVersion=5,Kind=settings.Kind,EntryLabel=entry.Name,TargetLabel=target.Name,
                    Entry=entryPrice,Stop=stop,Target=tp,ClearTarget=clear.Last().Price};
                double risk=Math.Abs(result.Entry-result.Stop),baseR=Math.Abs(result.Target-result.Entry)/risk,sign=buy?1:-1;
                double t2=Math.Round(result.Entry+sign*risk*(baseR+1),digits),t3=Math.Round(result.Entry+sign*risk*(baseR+2),digits);
                if(buy?t2<=result.ClearTarget:t2>=result.ClearTarget)result.Target2=t2;
                if(buy?t3<=result.ClearTarget:t3>=result.ClearTarget)result.Target3=t3;
                reason="Ready";return result;
            }
            reason="No eligible reference within entry/TP limits (TP1 minimum "+minimum.ToString("0.#",System.Globalization.CultureInfo.InvariantCulture)+" pips)";return null;
        }
        // A workspace for manual placement, never a reference-based suggestion.
        // Execution remains blocked until a valid drag or Apply confirms it.
        public static Plan StopDraft(string side,double quote,double pip,int digits,PlanSettings settings)
        {
            if((side!="BUY"&&side!="SELL")||!Finite(quote)||quote<=0||!Finite(pip)||pip<=0)return null;
            double sign=side=="BUY"?1:-1,minimum=Math.Max(50,settings.MinimumTargetPips);
            double entry=Math.Round(quote+sign*Math.Max(2*pip,2*Math.Pow(10,-digits)),digits);
            double target=Math.Round(entry+sign*minimum*pip,digits);
            double divisor=minimum>=300?settings.StopFrom300:minimum>=200?settings.StopUnder300:minimum>=100?settings.StopUnder200:settings.StopUnder100;
            if(!Finite(divisor)||divisor<=0)return null;
            double stop=Math.Round(entry-sign*minimum*pip/divisor,digits);
            if(!ValidGeometry(side,entry,stop,target))return null;
            return new Plan {Side=side,Kind=ExecutionKind.Stop,RuleVersion=5,Draft=true,
                Entry=entry,Stop=stop,Target=target,EntryLabel="MANUAL STOP DRAFT",TargetLabel="Manual TP1"};
        }
        public static bool ApplyDrawingPrices(Plan plan,double entry,double stop,double target,double tick,double pip,double minimum)
        {
            if(plan==null||!Finite(entry)||!Finite(stop)||!Finite(target)||entry<=0||stop<=0||target<=0)return false;
            if(Math.Abs(entry-plan.Entry)<=tick/2&&Math.Abs(stop-plan.Stop)<=tick/2&&Math.Abs(target-plan.Target)<=tick/2)return false;
            plan.Entry=entry;plan.Stop=stop;plan.Target=target;plan.Manual=true;
            if(ValidGeometry(plan.Side,entry,stop,target)&&MeetsTargetMinimum(entry,target,pip,minimum))
            {plan.Draft=false;if(plan.EntryLabel=="MANUAL STOP DRAFT")plan.EntryLabel="Manual stop entry";}
            return true;
        }
        public static double HandlePrice(double y1,double y2,double rendered)
        {return Math.Abs(y2-rendered)>Math.Abs(y1-rendered)?y2:y1;}
        public static bool ApplyDrawingHandle(Plan plan,string key,double observed,double rendered,double tick,double pip,double minimum)
        {
            // Compare to the last rendered value, not the already edited plan:
            // unchanged companion objects must not undo a native RR drag.
            if(plan==null||!Finite(observed)||Math.Abs(observed-rendered)<=tick/2)return false;
            if(key=="entry"&&plan.Kind==ExecutionKind.Market)return false;
            if(key!="entry"&&key!="sl"&&key!="tp1")return false;
            return ApplyDrawingPrices(plan,key=="entry"?observed:plan.Entry,key=="sl"?observed:plan.Stop,
                key=="tp1"?observed:plan.Target,tick,pip,minimum);
        }
        public static bool EligibleReference(Level level)
        {return level!=null&&Finite(level.Price)&&level.Price>0 &&
            !string.Equals(level.Name,"PYH",StringComparison.OrdinalIgnoreCase)&&!string.Equals(level.Name,"PYL",StringComparison.OrdinalIgnoreCase);}
        public static bool ShouldAutoPlan(Plan plan,bool enabled,bool paused,bool ready)
        {return enabled&&!paused&&ready&&(plan==null||(!plan.Manual&&!plan.Invalid));}
        public static bool Finite(double x) {return !double.IsNaN(x)&&!double.IsInfinity(x);}
        public static bool ValidGeometry(string side,double entry,double stop,double target)
        {
            return Finite(entry)&&Finite(stop)&&Finite(target)&&entry>0&&stop>0&&target>0 &&
                (side=="BUY"?stop<entry&&target>entry:side=="SELL"&&stop>entry&&target<entry);
        }
        public static bool BiasInvalid(string planned,string current,bool hardInvalid) {return hardInvalid || planned!=current;}
        public static bool MeetsTargetMinimum(double entry,double target,double pip,double minimum=50)
        {return Finite(entry)&&Finite(target)&&Finite(pip)&&pip>0&&Math.Abs(target-entry)/pip>=Math.Max(50,minimum)-0.000001;}
        public static bool ValidGuides(string side,double target,double? target2,double? target3)
        {
            if(target2.HasValue && (!Finite(target2.Value)||(side=="BUY"?target2.Value<=target:target2.Value>=target)))return false;
            return !target3.HasValue || (target2.HasValue&&Finite(target3.Value)&&(side=="BUY"?target3.Value>target2.Value:target3.Value<target2.Value));
        }
        public static bool Expired(DateTime created,DateTime now,PlanExpiry mode)
        {
            return mode==PlanExpiry.NextDubaiDay ? created.AddHours(4).Date!=now.AddHours(4).Date :
                mode==PlanExpiry.After24Hours && now-created>=TimeSpan.FromHours(24);
        }
    }
}
