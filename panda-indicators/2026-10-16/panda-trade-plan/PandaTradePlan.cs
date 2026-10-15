using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using cAlgo.API;
using PandaPlanning;

namespace cAlgo
{
    // Personal visual planner. No account/trading API, credentials or network.
    [Indicator(IsOverlay=true, TimeZone=TimeZones.UTC, AccessRights=AccessRights.None)]
    public partial class PandaTradePlan : Indicator
    {
        [Parameter("Pullback rules",DefaultValue=PlanMode.ScoringBias)]
        public PlanMode Mode {get;set;}
        [Parameter("Entry reference",DefaultValue=EntryReference.PreviousLevelsAndBoxes)]
        public EntryReference Reference {get;set;}
        [Parameter("Clear old plan",DefaultValue=PlanExpiry.ManualOnly)]
        public PlanExpiry Expiry {get;set;}
        [Parameter("On bias change",DefaultValue=BiasChange.MarkInvalid)]
        public BiasChange BiasAction {get;set;}
        [Parameter("Show optional TP2/TP3 guides",DefaultValue=true)]
        public bool ShowGuides {get;set;}
        [Parameter("Show risk/reward shading",DefaultValue=true)]
        public bool ShowShading {get;set;}
        [Parameter("Drawing width (bars)",DefaultValue=12,MinValue=4,MaxValue=50)]
        public int DrawingWidth {get;set;}
        [Parameter("Create plan on attach",DefaultValue=false)]
        public bool CreateOnAttach {get;set;}

        // Transparent price outputs expose the current plan in cTrader's data
        // window / indicator API without adding a second set of visible lines.
        [Output("Planned Entry",LineColor="#00000000",IsLastValueVisibleInTitle=false,IsColorCustomizable=false)]
        public IndicatorDataSeries PlannedEntry {get;set;}
        [Output("Planned SL",LineColor="#00000000",IsLastValueVisibleInTitle=false,IsColorCustomizable=false)]
        public IndicatorDataSeries PlannedStop {get;set;}
        [Output("Planned TP1",LineColor="#00000000",IsLastValueVisibleInTitle=false,IsColorCustomizable=false)]
        public IndicatorDataSeries PlannedTarget {get;set;}
        [Output("Optional TP2",LineColor="#00000000",IsLastValueVisibleInTitle=false,IsColorCustomizable=false)]
        public IndicatorDataSeries PlannedTarget2 {get;set;}
        [Output("Optional TP3",LineColor="#00000000",IsLastValueVisibleInTitle=false,IsColorCustomizable=false)]
        public IndicatorDataSeries PlannedTarget3 {get;set;}

        private static readonly Color Blue=Color.FromHex("#00b4ff"),Green=Color.FromHex("#00ff9f"),Red=Color.FromHex("#ff4d6d"),Grey=Color.FromHex("#9aa4b2");
        private string _prefix;
        private readonly Dictionary<string,TextBox> _fields=new Dictionary<string,TextBox>();
        private readonly JsonSerializerOptions _json=new JsonSerializerOptions {IncludeFields=true};
        private ChartDraggable _panel;
        private StackPanel _panelRoot,_panelBody;
        private TextBlock _compact;
        private bool _minimized;
        private TextBlock _status,_context,_metrics,_note;
        private Button _hide;
        private Plan _plan;
        private bool _hidden,_rendering,_autoPending,_refreshReference;
        private string _message="Choose BUY LIMIT or SELL LIMIT";
        private string StoreKey {get{return "PandaTradePlan v1 "+SymbolName;}}

        protected override void Initialize()
        {
            Guid storedId;
            var storedPrefix=LocalStorage.GetString("Drawing prefix",LocalStorageScope.Instance);
            if(!Guid.TryParseExact(storedPrefix,"N",out storedId))storedId=Guid.NewGuid();
            _prefix="PandaTradePlan_"+storedId.ToString("N")+"_";
            LocalStorage.SetString("Drawing prefix",storedId.ToString("N"),LocalStorageScope.Instance);
            LocalStorage.Flush(LocalStorageScope.Instance);
            // Interactive cTrader objects can survive algorithm reloads. Reuse
            // this instance's namespace and remove only its old drawings.
            RemoveDrawings();
            InitializeContext();
            BuildPanel();
            Chart.ObjectsUpdated+=OnObjectsUpdated;
            Timer.TimerTick+=Tick;
            Timer.Start(1);
            _autoPending=CreateOnAttach;
            try
            {
                var raw=LocalStorage.GetString(StoreKey,LocalStorageScope.Instance);
                if(!string.IsNullOrWhiteSpace(raw))_plan=JsonSerializer.Deserialize<Plan>(raw,_json);
                if(_plan!=null && Rules.Expired(_plan.CreatedUtc,DateTime.UtcNow,Expiry))_plan=null;
                if(_plan!=null)
                {
                    _autoPending=false;_message="Saved plan restored";
                    _refreshReference=!_plan.Manual && (_plan.RuleVersion!=2 || _plan.Reference!=Reference.ToString() || !Rules.MeetsTargetMinimum(_plan.Entry,_plan.Target,Symbol.PipSize));
                    Render();
                }
            }
            catch {_plan=null;}
            Tick();
        }
        public override void Calculate(int index)
        {
            if(index==Bars.Count-1)PublishPlan();
            else {PlannedEntry[index]=double.NaN;PlannedStop[index]=double.NaN;PlannedTarget[index]=double.NaN;PlannedTarget2[index]=double.NaN;PlannedTarget3[index]=double.NaN;}
        }
        private void PublishPlan()
        {
            int index=Bars.Count-1;if(index<0)return;
            PlannedEntry[index]=_plan==null?double.NaN:_plan.Entry;
            PlannedStop[index]=_plan==null?double.NaN:_plan.Stop;
            PlannedTarget[index]=_plan==null?double.NaN:_plan.Target;
            PlannedTarget2[index]=_plan==null?double.NaN:(_plan.Target2??double.NaN);
            PlannedTarget3[index]=_plan==null?double.NaN:(_plan.Target3??double.NaN);
        }
        private void Tick()
        {
            RefreshContext();
            // Also reconcile shared-chart edits made by another chart tool.
            // Some cTrader/plugin edits do not raise ObjectsUpdated here.
            if(_plan!=null&&!_hidden)ReadLineEdits(Chart.Objects);
            if(_plan!=null && Rules.Expired(_plan.CreatedUtc,DateTime.UtcNow,Expiry))
            {
                ClearPlan();_message="Old plan cleared (expiry)";
            }
            if(_plan!=null && _scoreReady && Rules.BiasInvalid(_plan.Side,_pandaBias,_hardInvalid))
            {
                if(BiasAction==BiasChange.DeletePlan){ClearPlan();_message="Plan cleared: bias changed";}
                else if(!_plan.Invalid){_plan.Invalid=true;_plan.InvalidReason="bias changed";_message="INVALID: bias changed - reset to recheck";Save();Render();}
            }
            if(_autoPending && _scoreReady){_autoPending=false;CreatePlan(_pandaBias);}
            if(_refreshReference && _scoreReady && _plan!=null){_refreshReference=false;CreatePlan(_plan.Side);}
            UpdateStatus();
        }
        private IEnumerable<Level> PreviousLevels()
        {
            if(_dailyLevels.Count>1){yield return new Level("PDH",_dailyLevels.HighPrices.Last(1));yield return new Level("PDL",_dailyLevels.LowPrices.Last(1));}
            if(_weeklyLevels.Count>1){yield return new Level("PWH",_weeklyLevels.HighPrices.Last(1));yield return new Level("PWL",_weeklyLevels.LowPrices.Last(1));}
            if(_monthlyLevels.Count>1){yield return new Level("PMH",_monthlyLevels.HighPrices.Last(1));yield return new Level("PML",_monthlyLevels.LowPrices.Last(1));}
            int year=Server.TimeInUtc.Year-1;
            var indices=Enumerable.Range(0,_monthlyLevels.Count).Where(i=>_monthlyLevels.OpenTimes[i].Year==year).ToArray();
            if(indices.Length==12)
            {
                yield return new Level("PYH",indices.Max(i=>_monthlyLevels.HighPrices[i]));
                yield return new Level("PYL",indices.Min(i=>_monthlyLevels.LowPrices[i]));
            }
        }
        private void CreatePlan(string side)
        {
            if(!_scoreReady){_message="Waiting for all 21 pair histories";UpdateStatus();return;}
            if(side!=_pandaBias || (side!="BUY"&&side!="SELL")){_message="No "+side+" setup: bias is "+_pandaBias;UpdateStatus();return;}
            int closed=_contextBars.Count-2;
            if(closed<21){_message="Waiting for confirmed H1 context";UpdateStatus();return;}
            string zone=PandaLineStatusAt(closed);
            bool valid=zone==(side=="BUY"?"ABOVE":"BELOW");
            var previous=PreviousLevels().ToArray();
            var boxes=new[]{new Level("H1 Box High",_activeSlot.ShortHigh),new Level("H1 Box Low",_activeSlot.ShortLow),
                new Level("H4 Box High",_activeSlot.MediumHigh),new Level("H4 Box Low",_activeSlot.MediumLow),
                new Level("D1 Box High",_activeSlot.LongHigh),new Level("D1 Box Low",_activeSlot.LongLow)};
            var refs=Reference==EntryReference.PandaBoxes?boxes:
                Reference==EntryReference.PreviousPeriodLevels?previous:previous.Concat(boxes).ToArray();
            var targetLevels=Reference==EntryReference.PreviousPeriodLevels?previous:previous.Concat(boxes).ToArray();
            string reason;
            var candidate=Rules.Build(side,_pandaGap,_hardInvalid,zone,valid,side=="BUY"?Symbol.Ask:Symbol.Bid,
                Symbol.PipSize,Symbol.Digits,targetLevels,Mode,out reason,refs);
            if(candidate==null)
            {
                _message=reason;
                if(_plan!=null&&_plan.Reference!=Reference.ToString())
                {_plan.Invalid=true;_plan.InvalidReason="entry references changed";Save();Render();}
                UpdateStatus();return;
            }
            candidate.CreatedUtc=DateTime.UtcNow;
            candidate.Reference=Reference.ToString();
            _plan=candidate;_hidden=false;_message="Rule plan - drag levels to adjust";
            Save();FitPlan();UpdateStatus();
        }
        private void BuildPanel()
        {
            _minimized=LocalStorage.GetString("Panel minimized",LocalStorageScope.Instance)=="1";
            _panelRoot=new StackPanel {Orientation=Orientation.Vertical,Width=_minimized?190:286,BackgroundColor=Color.FromArgb(244,16,22,31),Margin=3};
            var header=new Grid(1,2){Margin=2};
            var heading=Text(_minimized?"PANDA PLAN":"PANDA TRADE PLAN",Color.White,12,true);
            header.AddChild(heading,0,0);
            var shrink=Button(_minimized?"+":"-",Grey,25);
            shrink.HorizontalAlignment=HorizontalAlignment.Right;
            shrink.Click+=e=>
            {
                _minimized=!_minimized;_panelBody.IsVisible=!_minimized;_compact.IsVisible=_minimized;
                _panelRoot.Width=_minimized?190:286;shrink.Text=_minimized?"+":"-";
                heading.Text=_minimized?"PANDA PLAN":"PANDA TRADE PLAN";
                LocalStorage.SetString("Panel minimized",_minimized?"1":"0",LocalStorageScope.Instance);LocalStorage.Flush(LocalStorageScope.Instance);
            };
            header.AddChild(shrink,0,1);_panelRoot.AddChild(header);
            _compact=Text(SymbolName+" | PLAN",Blue,10);_compact.IsVisible=_minimized;_panelRoot.AddChild(_compact);
            var panel=new StackPanel {Orientation=Orientation.Vertical,IsVisible=!_minimized};
            _panelBody=panel;_panelRoot.AddChild(panel);
            panel.AddChild(Text("PREVIEW ONLY  |  H1 PULLBACK",Blue,10));
            _context=Text("Loading context...",Grey,11);panel.AddChild(_context);
            var directions=new StackPanel {Orientation=Orientation.Horizontal,Margin=5};
            var buy=Button("BUY LIMIT",Blue,130);buy.Click+=e=>CreatePlan("BUY");
            var sell=Button("SELL LIMIT",Red,130);sell.Click+=e=>CreatePlan("SELL");
            directions.AddChild(buy);directions.AddChild(sell);panel.AddChild(directions);
            foreach(var key in new[]{"Entry","Stop loss","TP1","TP2 guide","TP3 guide"})
            {
                var row=new Grid(1,2){Margin=4};
                row.AddChild(Text(key,key=="Entry"?Blue:key=="Stop loss"?Red:Green,12),0,0);
                var field=new TextBox {Text="-",Width=134,Height=26,BackgroundColor=Color.FromHex("#1b2430"),ForegroundColor=Color.White,Margin=2};
                _fields[key]=field;row.AddChild(field,0,1);panel.AddChild(row);
            }
            var apply=Button("Apply edited prices",Grey,268);apply.Click+=e=>ApplyEdits();panel.AddChild(apply);
            _metrics=Text("SL - pips  |  TP1 - R",Color.White,12,true);panel.AddChild(_metrics);
            _status=Text("",Blue,11);panel.AddChild(_status);
            _note=Text("",Grey,10);panel.AddChild(_note);
            var actions=new StackPanel {Orientation=Orientation.Horizontal,Margin=5};
            var reset=Button("Reset to rules",Grey,130);reset.Click+=e=>CreatePlan(_plan==null?_pandaBias:_plan.Side);
            _hide=Button("Hide plan",Grey,130);_hide.Click+=e=>{_hidden=!_hidden;if(_hidden)RemoveDrawings();else Render();UpdateStatus();};
            actions.AddChild(reset);actions.AddChild(_hide);panel.AddChild(actions);
            var clear=Button("Clear plan",Grey,268);clear.Click+=e=>{ClearPlan();_message="Plan cleared";UpdateStatus();};panel.AddChild(clear);
            var fit=Button("Fit plan",Grey,268);fit.Click+=e=>FitPlan();panel.AddChild(fit);
            panel.AddChild(Text("Drag lines or edit prices. No orders placed.",Grey,10));
            _panel=Chart.Draggables.Add();_panel.ShowGrip=true;_panel.Child=_panelRoot;
            double x,y;
            _panel.X=double.TryParse(LocalStorage.GetString("Panel X",LocalStorageScope.Instance),NumberStyles.Float,CultureInfo.InvariantCulture,out x)?Math.Max(0,Math.Min(x,Chart.Width-190)):Math.Max(0,Chart.Width-310);
            _panel.Y=double.TryParse(LocalStorage.GetString("Panel Y",LocalStorageScope.Instance),NumberStyles.Float,CultureInfo.InvariantCulture,out y)?Math.Max(0,Math.Min(y,Chart.Height-60)):20;
            _panel.LocationChanged+=e=>
            {
                LocalStorage.SetString("Panel X",e.Draggable.X.ToString(CultureInfo.InvariantCulture),LocalStorageScope.Instance);
                LocalStorage.SetString("Panel Y",e.Draggable.Y.ToString(CultureInfo.InvariantCulture),LocalStorageScope.Instance);
                LocalStorage.Flush(LocalStorageScope.Instance);
            };
        }
        private TextBlock Text(string value,Color color,double size,bool bold=false)
        {
            return new TextBlock {Text=value,ForegroundColor=color,FontSize=size,FontWeight=bold?FontWeight.Bold:FontWeight.Normal,Margin=6,TextWrapping=TextWrapping.Wrap};
        }
        private Button Button(string value,Color color,int width)
        {
            return new Button {Text=value,Width=width,Height=29,Margin=2,ForegroundColor=color,BackgroundColor=Color.FromHex("#202c3a")};
        }
        private string Price(double price) {return price.ToString("F"+Symbol.Digits,CultureInfo.InvariantCulture);}
        private double Field(string key) {double n;return double.TryParse(_fields[key].Text,NumberStyles.Float,CultureInfo.InvariantCulture,out n)?Math.Round(n,Symbol.Digits):double.NaN;}
        private void ApplyEdits()
        {
            if(_plan==null){_message="Create a valid rule plan first";UpdateStatus();return;}
            double entry=Field("Entry"),stop=Field("Stop loss"),target=Field("TP1");
            if(!Rules.ValidGeometry(_plan.Side,entry,stop,target)){_message="Invalid prices: check SL/entry/TP direction";UpdateStatus();return;}
            if(!Rules.MeetsTargetMinimum(entry,target,Symbol.PipSize)){_message="TP1 must be at least 50 pips from entry";UpdateStatus();return;}
            double t2=Field("TP2 guide"),t3=Field("TP3 guide");
            if((Rules.Finite(t2)&&(_plan.Side=="BUY"?t2<=target:t2>=target)) ||
               (Rules.Finite(t3)&&(!Rules.Finite(t2)||(_plan.Side=="BUY"?t3<=t2:t3>=t2))))
            {_message="Optional targets must follow TP1 in order";UpdateStatus();return;}
            _plan.Entry=entry;_plan.Stop=stop;_plan.Target=target;
            _plan.Target2=Rules.Finite(t2)?t2:(double?)null;_plan.Target3=Rules.Finite(t3)?t3:(double?)null;
            _plan.Manual=true;_message="Manual edits fixed - reset to recalculate";Save();Render();UpdateStatus();
        }
        private void OnObjectsUpdated(ChartObjectsUpdatedEventArgs args)
        {
            ReadLineEdits(args.ChartObjects);
        }
        private void ReadLineEdits(IEnumerable<ChartObject> objects)
        {
            if(_rendering||_plan==null)return;
            bool changed=false;
            foreach(var obj in objects.ToArray())
            {
                if(!obj.Name.StartsWith(_prefix,StringComparison.Ordinal))continue;
                var rr=obj as ChartRiskReward;
                if(rr!=null&&obj.Name==_prefix+"rr")
                {
                    double entry=Math.Round(rr.EntryPrice,Symbol.Digits),stop=Math.Round(rr.StopLossPrice,Symbol.Digits),target=Math.Round(rr.TakeProfitPrice,Symbol.Digits);
                    if(Rules.ValidGeometry(_plan.Side,entry,stop,target) &&
                       (Math.Abs(entry-_plan.Entry)>Symbol.TickSize/2 || Math.Abs(stop-_plan.Stop)>Symbol.TickSize/2 || Math.Abs(target-_plan.Target)>Symbol.TickSize/2 || rr.Time1!=_plan.AnchorStart || rr.Time2!=_plan.AnchorEnd))
                    {
                        _plan.Entry=entry;_plan.Stop=stop;_plan.Target=target;
                        _plan.AnchorStart=rr.Time1;_plan.AnchorEnd=rr.Time2;changed=true;
                    }
                    continue;
                }
                var line=obj as ChartTrendLine;
                if(line==null)continue;
                string key=line.Name.Substring(_prefix.Length);
                if(key!="tp2"&&key!="tp3")continue;
                double previous=key=="tp2"?(_plan.Target2??double.NaN):(_plan.Target3??double.NaN);
                double y=Math.Round(line.Y1,Symbol.Digits);
                if(!Rules.Finite(y)||y<=0||Math.Abs(y-previous)<Symbol.TickSize/2)continue;
                if(key=="tp2")_plan.Target2=y;else _plan.Target3=y;
                changed=true;
            }
            if(changed){_plan.Manual=true;_message="Manual edits fixed - reset to recalculate";Save();Render();UpdateStatus();}
        }
        private void Render()
        {
            if(_plan==null||_hidden)return;
            _rendering=true;
            try
            {
                if(_plan.AnchorStart==DateTime.MinValue || _plan.AnchorEnd<=_plan.AnchorStart)
                {
                    int last=Bars.Count-1;
                    var step=last>0?Bars.OpenTimes[last]-Bars.OpenTimes[last-1]:TimeSpan.FromMinutes(5);
                    if(step<=TimeSpan.Zero||step>TimeSpan.FromDays(1))step=TimeSpan.FromMinutes(5);
                    _plan.AnchorStart=Bars.OpenTimes[Math.Max(0,last-Math.Max(1,DrawingWidth-4))];
                    _plan.AnchorEnd=Bars.OpenTimes[last]+TimeSpan.FromTicks(step.Ticks*4);Save();
                }
                // A real native cTrader risk/reward object provides its own
                // entry/SL/TP handles, short bounded edges, and price labels.
                var rr=Chart.FindObject(_prefix+"rr") as ChartRiskReward;
                if(rr==null)rr=Chart.DrawRiskReward(_prefix+"rr",_plan.AnchorStart,_plan.AnchorEnd,_plan.Entry,
                    OrderType.Limit,_plan.Side=="BUY"?TradeType.Buy:TradeType.Sell,new ChartRiskRewardFixedSizeType(Symbol.VolumeInUnitsMin));
                rr.IsFixedRatio=false;
                if(Math.Abs(rr.EntryPrice-_plan.Entry)>Symbol.TickSize/2)rr.EntryPrice=_plan.Entry;
                rr.StopLossPrice=_plan.Stop;rr.TakeProfitPrice=_plan.Target;
                rr.Time1=_plan.AnchorStart;rr.Time2=_plan.AnchorEnd;
                rr.RiskColor=_plan.Invalid?Color.FromHex("#ffaa44"):Color.FromArgb(ShowShading?180:35,255,77,109);
                rr.RewardColor=_plan.Invalid?Color.FromHex("#ffaa44"):Color.FromArgb(ShowShading?180:25,0,255,159);
                rr.IsInteractive=true;rr.IsLocked=false;rr.Comment="Panda Trade Plan preview; "+_plan.EntryLabel;
                if(ShowGuides&&_plan.Target2.HasValue)DrawLevel("tp2",_plan.Target2.Value,"TP2",Green);else RemoveLevel("tp2");
                if(ShowGuides&&_plan.Target3.HasValue)DrawLevel("tp3",_plan.Target3.Value,"TP3",Green);else RemoveLevel("tp3");
                var label=Chart.DrawText(_prefix+"source",(_plan.Invalid?"INVALID | ":"")+_plan.EntryLabel,_plan.AnchorStart,_plan.Entry,_plan.Invalid?Red:Blue);
                label.FontSize=11;label.IsBold=true;label.IsInteractive=false;
                _fields["Entry"].Text=Price(_plan.Entry);_fields["Stop loss"].Text=Price(_plan.Stop);_fields["TP1"].Text=Price(_plan.Target);
                _fields["TP2 guide"].Text=_plan.Target2.HasValue?Price(_plan.Target2.Value):"-";
                _fields["TP3 guide"].Text=_plan.Target3.HasValue?Price(_plan.Target3.Value):"-";
            }
            finally {_rendering=false;}
        }
        private void DrawLevel(string key,double price,string label,Color color)
        {
            var line=Chart.FindObject(_prefix+key) as ChartTrendLine;
            if(line==null)line=Chart.DrawTrendLine(_prefix+key,_plan.AnchorStart,price,_plan.AnchorEnd,price,color,2,LineStyle.Lines);
            else {line.Y1=price;line.Y2=price;line.Time1=_plan.AnchorStart;line.Time2=_plan.AnchorEnd;}
            line.ExtendToInfinity=false;line.Color=_plan.Invalid?Color.FromHex("#ffaa44"):color;line.IsInteractive=true;line.IsLocked=false;
            var text=Chart.DrawText(_prefix+key+"Label",label+" "+Price(price),_plan.AnchorEnd,price,line.Color);
            text.FontSize=11;text.IsBold=true;text.IsInteractive=false;
        }
        private void RemoveLevel(string key){Chart.RemoveObject(_prefix+key);Chart.RemoveObject(_prefix+key+"Label");}
        private void FitPlan()
        {
            if(_plan==null)return;
            _hidden=false;_plan.AnchorStart=DateTime.MinValue;_plan.AnchorEnd=DateTime.MinValue;
            Render();
            var prices=new List<double>{_plan.Entry,_plan.Stop,_plan.Target,Symbol.Bid,Symbol.Ask};
            if(ShowGuides&&_plan.Target2.HasValue)prices.Add(_plan.Target2.Value);
            if(ShowGuides&&_plan.Target3.HasValue)prices.Add(_plan.Target3.Value);
            double low=prices.Min(),high=prices.Max(),pad=Math.Max(10*Symbol.PipSize,(high-low)*.1);
            Chart.SetYRange(low-pad,high+pad);UpdateStatus();
        }
        private void RemoveDrawings()
        {
            if(string.IsNullOrEmpty(_prefix))return;
            foreach(var obj in Chart.Objects.Where(o=>o.Name.StartsWith(_prefix,StringComparison.Ordinal)).ToArray())Chart.RemoveObject(obj.Name);
            foreach(var suffix in new[]{"entry","sl","tp1","tp2","tp3","entryLabel","slLabel","tp1Label","tp2Label","tp3Label","risk","reward","source","rr"})Chart.RemoveObject(_prefix+suffix);
        }
        private void ClearPlan(){RemoveDrawings();_plan=null;_hidden=false;_refreshReference=false;Save();foreach(var field in _fields.Values)field.Text="-";}
        private void Save()
        {
            LocalStorage.SetString(StoreKey,_plan==null?"":JsonSerializer.Serialize(_plan,_json),LocalStorageScope.Instance);
            LocalStorage.Flush(LocalStorageScope.Instance);
        }
        private void UpdateStatus()
        {
            PublishPlan();
            _compact.Text=SymbolName+" | "+(_plan==null?_pandaBias:_plan.Invalid?"INVALID":_plan.Side+" PLAN");
            _context.Text=SymbolName+" | Bias "+_pandaBias+" | Gap "+_pandaGap+" | "+_readyPairs+"/21";
            _hide.Text=_hidden?"Show plan":"Hide plan";
            _status.ForegroundColor=_plan!=null&&_plan.Invalid?Red:Blue;
            _status.Text=_plan!=null&&_plan.Invalid?"INVALID - "+(_plan.InvalidReason??"bias changed")+"; reset to recheck":_message;
            if(_plan==null){_metrics.Text="SL - pips | TP1 - R";_note.Text="Rules: "+Mode+"\nReference: "+Reference+"\nExpiry: "+Expiry;return;}
            double risk=Math.Abs(_plan.Entry-_plan.Stop),rr=risk>0?Math.Abs(_plan.Target-_plan.Entry)/risk:0;
            if(_plan.RuleVersion!=2){_status.Text="Older plan: Reset to apply TP/SL tiers";_status.ForegroundColor=Red;}
            bool geometry=Rules.ValidGeometry(_plan.Side,_plan.Entry,_plan.Stop,_plan.Target);
            if(!geometry){_status.Text="INVALID geometry - edit SL/entry/TP";_status.ForegroundColor=Red;}
            else if(!Rules.MeetsTargetMinimum(_plan.Entry,_plan.Target,Symbol.PipSize))
            {_status.Text="TP1 below 50-pip minimum - adjust target";_status.ForegroundColor=Red;}
            else if(!Rules.ValidGuides(_plan.Side,_plan.Target,_plan.Target2,_plan.Target3))
            {_status.Text="INVALID guides - targets must follow TP1";_status.ForegroundColor=Red;}
            _metrics.Text="SL "+(risk/Symbol.PipSize).ToString("0.0",CultureInfo.InvariantCulture)+"p | TP1 "+(Math.Abs(_plan.Target-_plan.Entry)/Symbol.PipSize).ToString("0.0",CultureInfo.InvariantCulture)+"p | "+rr.ToString("0.00",CultureInfo.InvariantCulture)+"R";
            bool limitSide=_plan.Side=="BUY"?_plan.Entry<Symbol.Ask:_plan.Entry>Symbol.Bid;
            _note.Text=(_plan.Manual?"MANUAL: levels stay fixed":"Entry: "+_plan.EntryLabel+" | "+_plan.Mode)+
                "\n"+(!limitSide?"Entry crossed: no longer a limit placement\n":"")+
                (!_scoreReady?"Context unavailable; recheck before use\n":"")+"Expiry: "+Expiry+" | TP2/3 optional guides";
        }
        protected override void OnDestroy()
        {
            Timer.Stop();Timer.TimerTick-=Tick;Chart.ObjectsUpdated-=OnObjectsUpdated;
            RemoveDrawings();if(_panel!=null)Chart.Draggables.Remove(_panel);
        }
    }
}
