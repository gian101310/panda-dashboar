using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using cAlgo.API;
using PandaPlanning;

namespace cAlgo
{
    // Visual planning plus explicit user-click execution. Automatic refresh never trades.
#if TRADE_PLAN_V13
    [Indicator(IsOverlay=true, TimeZone=TimeZones.UTC, AutoRescale=false, AccessRights=AccessRights.None)]
    public partial class PandaTradePlanV13 : Indicator
#elif TRADE_PLAN_V12
    [Indicator(IsOverlay=true, TimeZone=TimeZones.UTC, AutoRescale=false, AccessRights=AccessRights.None)]
    public partial class PandaTradePlanV12 : Indicator
#else
    [Indicator(IsOverlay=true, TimeZone=TimeZones.UTC, AutoRescale=false, AccessRights=AccessRights.None)]
    public partial class PandaTradePlan : Indicator
#endif
    {
#if !TRADE_PLAN_V13
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
        [Parameter("Automatic planning",Group="Automation",DefaultValue=true)]
        public bool AutoPlan {get;set;}
        [Parameter("Refresh interval (seconds)",Group="Automation",DefaultValue=15,MinValue=5,MaxValue=300)]
        public int RefreshSeconds {get;set;}
        [Parameter("Previous day levels",Group="References (no year)",DefaultValue=true)]
        public bool UseDay {get;set;}
        [Parameter("Previous week levels",Group="References (no year)",DefaultValue=true)]
        public bool UseWeek {get;set;}
        [Parameter("Previous month levels",Group="References (no year)",DefaultValue=true)]
        public bool UseMonth {get;set;}
        [Parameter("H1 Panda Box",Group="References (no year)",DefaultValue=true)]
        public bool UseH1Box {get;set;}
        [Parameter("H4 Panda Box",Group="References (no year)",DefaultValue=true)]
        public bool UseH4Box {get;set;}
        [Parameter("D1 Panda Box",Group="References (no year)",DefaultValue=true)]
        public bool UseD1Box {get;set;}
        [Parameter("Minimum TP1 (pips)",Group="Placement",DefaultValue=50,MinValue=50)]
        public double MinTargetPips {get;set;}
        [Parameter("Max entry distance (pips, 0=off)",Group="Placement",DefaultValue=0,MinValue=0)]
        public double MaxEntryPips {get;set;}
        [Parameter("Max TP distance (pips, 0=off)",Group="Placement",DefaultValue=0,MinValue=0)]
        public double MaxTargetPips {get;set;}
        [Parameter("SL divisor: TP below 100p",Group="Placement",DefaultValue=2,MinValue=1,MaxValue=20)]
        public double StopUnder100 {get;set;}
        [Parameter("SL divisor: TP 100-199p",Group="Placement",DefaultValue=3,MinValue=1,MaxValue=20)]
        public double StopUnder200 {get;set;}
        [Parameter("SL divisor: TP 200-299p",Group="Placement",DefaultValue=4,MinValue=1,MaxValue=20)]
        public double StopUnder300 {get;set;}
        [Parameter("SL divisor: TP 300p+",Group="Placement",DefaultValue=5,MinValue=1,MaxValue=20)]
        public double StopFrom300 {get;set;}
        [Parameter("Risk/reward line thickness",Group="Appearance",DefaultValue=2,MinValue=1,MaxValue=8)]
        public int LineThickness {get;set;}
        [Parameter("TP2/3 guide thickness",Group="Appearance",DefaultValue=2,MinValue=1,MaxValue=8)]
        public int GuideThickness {get;set;}
        [Parameter("Drawing opacity (%)",Group="Appearance",DefaultValue=71,MinValue=0,MaxValue=100)]
        public int DrawingOpacity {get;set;}
        [Parameter("Guide opacity (%)",Group="Appearance",DefaultValue=100,MinValue=0,MaxValue=100)]
        public int GuideOpacity {get;set;}
        [Parameter("Label font size",Group="Appearance",DefaultValue=11,MinValue=8,MaxValue=24)]
        public int LabelFontSize {get;set;}
        [Parameter("Panel scale (%)",Group="Panel",DefaultValue=80,MinValue=60,MaxValue=150)]
        public int PanelScale {get;set;}
        [Parameter("Panel base width",Group="Panel",DefaultValue=280,MinValue=250,MaxValue=600)]
        public int PanelWidth {get;set;}
        [Parameter("Panel background opacity (%)",Group="Panel",DefaultValue=96,MinValue=0,MaxValue=100)]
        public int PanelOpacity {get;set;}
        [Parameter("Panel X (-1=right)",Group="Panel",DefaultValue=-1,MinValue=-1)]
        public int PanelX {get;set;}
        [Parameter("Panel Y",Group="Panel",DefaultValue=20,MinValue=0)]
        public int PanelY {get;set;}
        [Parameter("Remember dragged position",Group="Panel",DefaultValue=true)]
        public bool RememberPosition {get;set;}
        [Parameter("Start collapsed",Group="Panel",DefaultValue=false)]
        public bool StartCollapsed {get;set;}
        [Parameter("Show score diagnostics",Group="Panel",DefaultValue=true)]
        public bool ShowScoreDiagnostics {get;set;}
#endif

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
        [Output("Limit order ready",LineColor="#00000000",IsLastValueVisibleInTitle=false,IsColorCustomizable=false)]
        public IndicatorDataSeries LimitOrderReady {get;set;}
        [Output("Planned volume units",LineColor="#00000000",IsLastValueVisibleInTitle=false,IsColorCustomizable=false)]
        public IndicatorDataSeries PlannedVolumeUnits {get;set;}

        private static readonly Color Blue=Color.FromHex("#00b4ff"),Green=Color.FromHex("#00ff9f"),Red=Color.FromHex("#ff4d6d"),Grey=Color.FromHex("#9aa4b2");
        private string _prefix;
        private readonly Dictionary<string,double> _renderedLevels=new Dictionary<string,double>();
        private readonly Dictionary<string,TextBox> _fields=new Dictionary<string,TextBox>();
        private readonly JsonSerializerOptions _json=new JsonSerializerOptions {IncludeFields=true};
        private ChartDraggable _panel;
        private StackPanel _panelRoot,_panelBody;
#if TRADE_PLAN_V12 || TRADE_PLAN_V13
        private StackPanel _dashboardRoot;
        private Button _tradeShrink,_dashboardShrink;
#endif
        private TextBlock _compact;
        private bool _minimized;
        private TextBlock _status,_context,_metrics,_note;
        private Button _hide,_autoButton;
        private Plan _plan;
        private bool _hidden,_rendering,_autoPaused,_refreshReference;
        private string _lastReadinessReason;
        private DateTime _lastAutoRefresh=DateTime.MinValue;
        private string _message="Waiting for scoring and an eligible pullback";
        private string StoreKey {get{return "PandaTradePlan "+
#if TRADE_PLAN_V13
            "v13 "+Account.Number.ToString(CultureInfo.InvariantCulture)+" "+
#elif TRADE_PLAN_V12
            "v12 "+
#else
            "v1 "+
#endif
            SymbolName;}}
        private double Scale(double value){return value*PanelScale/100.0;}
#if TRADE_PLAN_V12 || TRADE_PLAN_V13
        private void UpdatePanelHost()
        {
            if(_panel==null||_dashboardRoot==null)return;
            var dashboard=PanelLayoutRules.UseDashboardRoot(_minimized,_dashboardView);
            _dashboardRoot.Width=PanelLayoutRules.DashboardWidth(_minimized);
            _dashboardBody.IsVisible=PanelLayoutRules.ShowDashboardBody(_minimized);
            _dashboardCompact.IsVisible=PanelLayoutRules.ShowDashboardCompact(_minimized);
            _panel.Child=dashboard?_dashboardRoot:_panelRoot;
            _dashboardSwitch.IsVisible=PanelLayoutRules.ShowDashboardSwitch(_minimized);
            _tradeShrink.Text=_minimized?"+":"-";
            _dashboardShrink.Text=_minimized?"+":"-";
        }
#endif
        private string SettingsKey {get{return string.Join("|",_orderKind,Mode,Reference,UseDay,UseWeek,UseMonth,UseH1Box,UseH4Box,UseD1Box,
            MinTargetPips,MaxEntryPips,MaxTargetPips,StopUnder100,StopUnder200,StopUnder300,StopFrom300);}}
        private PlanSettings PlacementSettings {get{return new PlanSettings {Kind=_orderKind,MinimumTargetPips=MinTargetPips,MaxEntryPips=MaxEntryPips,MaxTargetPips=MaxTargetPips,
            StopUnder100=StopUnder100,StopUnder200=StopUnder200,StopUnder300=StopUnder300,StopFrom300=StopFrom300};}}

        protected override void Initialize()
        {
            Print("Panda Trade Plan: fixed-size volume revision initializing");
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
            Print("Panda Trade Plan: context initialized");
#if TRADE_PLAN_V12 || TRADE_PLAN_V13
            try {InitializeDashboard();}
            catch(Exception ex){_dashboardStatus="ERROR";Print("Panda dashboard setup failed: "+ex.GetType().Name);}
#endif
            BuildPanel();
            Chart.ObjectsUpdated+=OnObjectsUpdated;
            Timer.TimerTick+=Tick;
            Timer.Start(1);
            _autoPaused=LocalStorage.GetString("Auto paused",LocalStorageScope.Instance)=="1";
            try
            {
                var raw=LocalStorage.GetString(StoreKey,LocalStorageScope.Instance);
                if(!string.IsNullOrWhiteSpace(raw))_plan=JsonSerializer.Deserialize<Plan>(raw,_json);
                if(_plan!=null && Rules.Expired(_plan.CreatedUtc,DateTime.UtcNow,Expiry))_plan=null;
                if(_plan!=null)
                {
                    _message="Saved plan restored";
                    _refreshReference=!_plan.Manual && (_plan.RuleVersion!=5 || _plan.Settings!=SettingsKey || !Rules.MeetsTargetMinimum(_plan.Entry,_plan.Target,Symbol.PipSize));
                    string width=DrawingWidth.ToString(CultureInfo.InvariantCulture);
                    if(LocalStorage.GetString("Drawing width",LocalStorageScope.Instance)!=width){_plan.AnchorStart=DateTime.MinValue;_plan.AnchorEnd=DateTime.MinValue;}
                    Render();
                }
            }
            catch(Exception ex){Print("Panda Trade Plan restore/render failed: "+ex);_plan=null;}
            LocalStorage.SetString("Drawing width",DrawingWidth.ToString(CultureInfo.InvariantCulture),LocalStorageScope.Instance);
            Tick();
            Print("Panda Trade Plan: initialized; panel Entry="+_fields["Entry"].Text+", SL="+_fields["Stop loss"].Text+", TP1="+_fields["TP1"].Text);
        }
        public override void Calculate(int index)
        {
            if(index==Bars.Count-1)PublishPlan();
            else {PlannedEntry[index]=double.NaN;PlannedStop[index]=double.NaN;PlannedTarget[index]=double.NaN;PlannedTarget2[index]=double.NaN;PlannedTarget3[index]=double.NaN;}
        }
        private void PublishPlan()
        {
            int index=Bars.Count-1;if(index<0)return;
#if TRADE_PLAN_V13
            if(!LicenseActive)
            {
                PlannedEntry[index]=double.NaN;PlannedStop[index]=double.NaN;PlannedTarget[index]=double.NaN;
                PlannedTarget2[index]=double.NaN;PlannedTarget3[index]=double.NaN;
                LimitOrderReady[index]=0;PlannedVolumeUnits[index]=double.NaN;
                return;
            }
#endif
            PlannedEntry[index]=_plan==null?double.NaN:_plan.Entry;
            PlannedStop[index]=_plan==null?double.NaN:_plan.Stop;
            PlannedTarget[index]=_plan==null?double.NaN:_plan.Target;
            PlannedTarget2[index]=_plan==null?double.NaN:(_plan.Target2??double.NaN);
            PlannedTarget3[index]=_plan==null?double.NaN:(_plan.Target3??double.NaN);
            string reason=_plan==null?"No plan":"Order type is not Limit";
            var ticket=_plan!=null&&_orderKind==ExecutionKind.Limit?PrepareOrder(out reason,false):null;
            LimitOrderReady[index]=ticket==null?0:1;
            PlannedVolumeUnits[index]=ticket==null?double.NaN:ticket.VolumeUnits;
            if(reason!=_lastReadinessReason){_lastReadinessReason=reason;Print("Panda Trade Plan dry-run readiness: "+reason);}
        }
        private void Tick()
        {
#if TRADE_PLAN_V13
            RefreshDashboard();
            if(!LicenseActive){UpdateStatus();return;}
#endif
            RefreshContext();
#if TRADE_PLAN_V12
            RefreshDashboard();
#endif
            if(_plan!=null&&_plan.Kind==ExecutionKind.Market&&string.IsNullOrEmpty(_plan.SubmissionId))
            {
                double quote=_plan.Side=="BUY"?Symbol.Ask:Symbol.Bid;
                if(Rules.Finite(quote)&&quote>0){_plan.Entry=quote;_fields["Entry"].Text=Price(quote);}
            }
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
                else if(!_plan.Invalid){_plan.Invalid=true;_plan.InvalidReason="bias changed";_message="INVALID: bias changed - plan retained";Save();Render();}
            }
            bool migrate=_refreshReference&&_plan!=null&&!_plan.Manual;
            if((Rules.ShouldAutoPlan(_plan,AutoPlan,_autoPaused,_scoreReady)||(migrate&&AutoPlan&&_scoreReady&&!_autoPaused)) &&
                DateTime.UtcNow-_lastAutoRefresh>=TimeSpan.FromSeconds(RefreshSeconds))
            {_lastAutoRefresh=DateTime.UtcNow;_refreshReference=false;CreatePlan(migrate?_plan.Side:_pandaBias,true);}
            ReconcileAutoLimitOrder();
            UpdateStatus();
        }
        private IEnumerable<Level> PreviousLevels()
        {
            if(UseDay&&_dailyLevels.Count>1){yield return new Level("PDH",_dailyLevels.HighPrices.Last(1));yield return new Level("PDL",_dailyLevels.LowPrices.Last(1));}
            if(UseWeek&&_weeklyLevels.Count>1){yield return new Level("PWH",_weeklyLevels.HighPrices.Last(1));yield return new Level("PWL",_weeklyLevels.LowPrices.Last(1));}
            if(UseMonth&&_monthlyLevels.Count>1){yield return new Level("PMH",_monthlyLevels.HighPrices.Last(1));yield return new Level("PML",_monthlyLevels.LowPrices.Last(1));}
        }
        private void CreatePlan(string side,bool automatic=false)
        {
#if TRADE_PLAN_V13
            if(!LicenseActive){UpdateStatus();return;}
#endif
            if(!_scoreReady){_message="Waiting for all 21 pair histories and quotes";UpdateStatus();return;}
            if(side!=_pandaBias || (side!="BUY"&&side!="SELL")){_message=automatic?"Waiting for valid BUY/SELL scoring bias":"No "+side+" setup: bias is "+_pandaBias;UpdateStatus();return;}
            int closed=_contextBars.Count-2;
            if(closed<21){_message="Waiting for confirmed H1 context";UpdateStatus();return;}
            string zone=PandaLineStatusAt(closed);
            bool valid=zone==(side=="BUY"?"ABOVE":"BELOW");
            var previous=PreviousLevels().ToArray();
            var boxList=new List<Level>();
            if(UseH1Box){boxList.Add(new Level("H1 Box High",_activeSlot.ShortHigh));boxList.Add(new Level("H1 Box Low",_activeSlot.ShortLow));}
            if(UseH4Box){boxList.Add(new Level("H4 Box High",_activeSlot.MediumHigh));boxList.Add(new Level("H4 Box Low",_activeSlot.MediumLow));}
            if(UseD1Box){boxList.Add(new Level("D1 Box High",_activeSlot.LongHigh));boxList.Add(new Level("D1 Box Low",_activeSlot.LongLow));}
            var boxes=boxList.ToArray();
            var refs=Reference==EntryReference.PandaBoxes?boxes:
                Reference==EntryReference.PreviousPeriodLevels?previous:previous.Concat(boxes).ToArray();
            var targetLevels=Reference==EntryReference.PreviousPeriodLevels?previous:previous.Concat(boxes).ToArray();
            string reason;
            var candidate=Rules.Build(side,_pandaGap,_hardInvalid,zone,valid,side=="BUY"?Symbol.Ask:Symbol.Bid,
                Symbol.PipSize,Symbol.Digits,targetLevels,Mode,out reason,refs,PlacementSettings);
            if(candidate==null&&_orderKind==ExecutionKind.Stop)
            {
                candidate=Rules.StopDraft(side,side=="BUY"?Symbol.Ask:Symbol.Bid,Symbol.PipSize,Symbol.Digits,PlacementSettings);
                if(candidate!=null)candidate.Mode=Mode;
            }
            if(candidate==null)
            {
                _message=reason;
                if(_plan!=null&&(_plan.RuleVersion!=5||_plan.Settings!=SettingsKey))
                {_plan.Invalid=true;_plan.InvalidReason="no eligible plan under revised references/settings";_refreshReference=automatic;Save();Render();}
                UpdateStatus();return;
            }
            if(automatic&&_plan!=null&&_plan.RuleVersion==5&&_plan.Settings==SettingsKey&&_plan.Side==candidate.Side&&
                _plan.Entry==candidate.Entry&&_plan.Stop==candidate.Stop&&_plan.Target==candidate.Target&&_plan.Target2==candidate.Target2&&_plan.Target3==candidate.Target3)return;
            var previousPlan=_plan;
            candidate.CreatedUtc=automatic&&previousPlan!=null?previousPlan.CreatedUtc:DateTime.UtcNow;
            candidate.Reference=Reference.ToString();
            candidate.Settings=SettingsKey;
            if(automatic&&previousPlan!=null){candidate.AnchorStart=previousPlan.AnchorStart;candidate.AnchorEnd=previousPlan.AnchorEnd;}
            _plan=candidate;if(!automatic)_hidden=false;_message=candidate.Draft?"MANUAL STOP DRAFT - no eligible rule setup; drag levels or Apply to confirm":"Rule plan - drag levels to adjust";
            if(!automatic){_autoPaused=false;}
            Save();Render();UpdateStatus();
        }
        private void BuildPanel()
        {
            string collapsedConfig=StartCollapsed.ToString();
            bool restoreCollapse=LocalStorage.GetString("Collapse input",LocalStorageScope.Instance)==collapsedConfig;
            _minimized=restoreCollapse?LocalStorage.GetString("Panel minimized",LocalStorageScope.Instance)=="1":StartCollapsed;
            LocalStorage.SetString("Collapse input",collapsedConfig,LocalStorageScope.Instance);
            LocalStorage.SetString("Panel minimized",_minimized?"1":"0",LocalStorageScope.Instance);
            _panelRoot=new StackPanel {Orientation=Orientation.Vertical,Width=(
#if TRADE_PLAN_V12 || TRADE_PLAN_V13
                Scale(PanelWidth)
#else
                Scale(_minimized?190:PanelWidth)
#endif
            ),BackgroundColor=Color.FromArgb((int)Math.Round(255*PanelOpacity/100.0),16,22,31),Margin=Scale(3)};
            var header=new Grid(1,2){Margin=Scale(2)};
            var heading=Text(
#if TRADE_PLAN_V12 || TRADE_PLAN_V13
                TradePlanTitle,
#else
                _minimized?"PANDA PLAN":"PANDA TRADE PLAN",
#endif
                Color.White,12,true);
            header.AddChild(heading,0,0);
            var shrink=Button(_minimized?"+":"-",Grey,25);
#if TRADE_PLAN_V12 || TRADE_PLAN_V13
            _tradeShrink=shrink;
#endif
            shrink.HorizontalAlignment=HorizontalAlignment.Right;
            shrink.Click+=e=>
            {
                _minimized=!_minimized;
#if TRADE_PLAN_V12 || TRADE_PLAN_V13
                UpdatePanelHost();
#else
                _panelBody.IsVisible=!_minimized;
                _compact.IsVisible=_minimized;
                _panelRoot.Width=Scale(_minimized?190:PanelWidth);
                heading.Text=_minimized?"PANDA PLAN":"PANDA TRADE PLAN";
#endif
                shrink.Text=_minimized?"+":"-";
                LocalStorage.SetString("Panel minimized",_minimized?"1":"0",LocalStorageScope.Instance);LocalStorage.Flush(LocalStorageScope.Instance);
            };
            header.AddChild(shrink,0,1);_panelRoot.AddChild(header);
            _compact=Text(SymbolName+" | PLAN",Blue,10);
#if TRADE_PLAN_V12 || TRADE_PLAN_V13
            _compact.IsVisible=false;
#else
            _compact.IsVisible=_minimized;
#endif
            _panelRoot.AddChild(_compact);
#if TRADE_PLAN_V12 || TRADE_PLAN_V13
            AddDashboardSwitch();
#endif
            var panel=new StackPanel {Orientation=Orientation.Vertical
#if !TRADE_PLAN_V12 && !TRADE_PLAN_V13
                ,IsVisible=!_minimized
#endif
            };
            _panelBody=panel;_panelRoot.AddChild(panel);
            panel.AddChild(Text("H1 PLAN | CLICK TO EXECUTE",Blue,10));
#if TRADE_PLAN_V12 || TRADE_PLAN_V13
            _planScoreBias=Text("—",Grey,18,true);panel.AddChild(_planScoreBias);
#endif
            _context=Text("Loading context...",Grey,11);panel.AddChild(_context);
            double full=PanelWidth-18,half=(full-8)/2;
            BuildExecutionPanel(panel,full,half);
#if !TRADE_PLAN_V12 && !TRADE_PLAN_V13
            var directions=new StackPanel {Orientation=Orientation.Horizontal,Margin=Scale(3)};
            var buy=Button("Plan BUY",Blue,half);buy.Click+=e=>CreatePlan("BUY");
            var sell=Button("Plan SELL",Red,half);sell.Click+=e=>CreatePlan("SELL");
            directions.AddChild(buy);directions.AddChild(sell);panel.AddChild(directions);
#endif
            foreach(var key in new[]{"Entry","Stop loss","TP1","TP2 guide","TP3 guide"})
            {
                var row=new Grid(1,2){Margin=Scale(2)};
                row.AddChild(Text(key,key=="Entry"?Blue:key=="Stop loss"?Red:Green,12),0,0);
                var field=new TextBox {Text="-",Width=Scale(half),Height=Scale(26),FontSize=Math.Max(8,Scale(12)),BackgroundColor=Color.FromHex("#1b2430"),ForegroundColor=Color.White,Margin=Scale(2)};
                _fields[key]=field;row.AddChild(field,0,1);panel.AddChild(row);
            }
            _fields["Entry"].IsReadOnly=_orderKind==ExecutionKind.Market;
            var apply=Button("Apply edited prices",Grey,full);apply.Click+=e=>ApplyEdits();panel.AddChild(apply);
            _place=Button("Place order",Green,full);_place.Click+=e=>PlaceOrder();panel.AddChild(_place);
            _metrics=Text("SL - pips  |  TP1 - R",Color.White,12,true);panel.AddChild(_metrics);
            _status=Text("",Blue,11);panel.AddChild(_status);
            _note=Text("",Grey,10);panel.AddChild(_note);
            var actions=new StackPanel {Orientation=Orientation.Horizontal,Margin=Scale(3)};
            var reset=Button("Refresh plan",Grey,half);reset.Click+=e=>CreatePlan(_pandaBias);
            _hide=Button("Hide plan",Grey,half);_hide.Click+=e=>{_hidden=!_hidden;if(_hidden)RemoveDrawings();else Render();UpdateStatus();};
            actions.AddChild(reset);actions.AddChild(_hide);panel.AddChild(actions);
            _autoButton=Button("Auto",Blue,full);_autoButton.Click+=e=>
            {
                if(!AutoPlan){_message="Enable Automatic planning in indicator settings";UpdateStatus();return;}
                _autoPaused=!_autoPaused;_lastAutoRefresh=DateTime.MinValue;_message=_autoPaused?"Automatic refresh paused":"Automatic refresh resumed";Save();Tick();
            };panel.AddChild(_autoButton);
            var clear=Button("Clear plan",Grey,full);clear.Click+=e=>{_autoPaused=true;ClearPlan();_message="Cleared - Auto paused; click Resume auto to start again";UpdateStatus();};panel.AddChild(clear);
            var fit=Button("Fit plan",Grey,full);fit.Click+=e=>FitPlan();panel.AddChild(fit);
            panel.AddChild(Text("Auto only plans. Place order submits SL + TP1.",Grey,10));
            _panel=Chart.Draggables.Add();_panel.ShowGrip=true;
#if TRADE_PLAN_V12 || TRADE_PLAN_V13
            _panel.Child=PanelLayoutRules.UseDashboardRoot(_minimized,_dashboardView)?_dashboardRoot:_panelRoot;
#else
            _panel.Child=_panelRoot;
#endif
            double x,y;
            string positionConfig=PanelX+"|"+PanelY+"|"+RememberPosition;
            bool restorePosition=RememberPosition&&LocalStorage.GetString("Position inputs",LocalStorageScope.Instance)==positionConfig;
            var activePanelWidth=_panel.Child.Width;
            _panel.X=restorePosition&&double.TryParse(LocalStorage.GetString("Panel X",LocalStorageScope.Instance),NumberStyles.Float,CultureInfo.InvariantCulture,out x)?Math.Max(0,Math.Min(x,Chart.Width-activePanelWidth)):PanelX<0?Math.Max(0,Chart.Width-activePanelWidth-20):Math.Max(0,Math.Min(PanelX,Chart.Width-activePanelWidth));
            _panel.Y=restorePosition&&double.TryParse(LocalStorage.GetString("Panel Y",LocalStorageScope.Instance),NumberStyles.Float,CultureInfo.InvariantCulture,out y)?Math.Max(0,Math.Min(y,Chart.Height-60)):Math.Max(0,Math.Min(PanelY,Chart.Height-60));
            LocalStorage.SetString("Position inputs",positionConfig,LocalStorageScope.Instance);
            if(RememberPosition)
            {
                LocalStorage.SetString("Panel X",_panel.X.ToString(CultureInfo.InvariantCulture),LocalStorageScope.Instance);
                LocalStorage.SetString("Panel Y",_panel.Y.ToString(CultureInfo.InvariantCulture),LocalStorageScope.Instance);
            }
            LocalStorage.Flush(LocalStorageScope.Instance);
            _panel.LocationChanged+=e=>
            {
                if(!RememberPosition)return;
                LocalStorage.SetString("Panel X",e.Draggable.X.ToString(CultureInfo.InvariantCulture),LocalStorageScope.Instance);
                LocalStorage.SetString("Panel Y",e.Draggable.Y.ToString(CultureInfo.InvariantCulture),LocalStorageScope.Instance);
                LocalStorage.Flush(LocalStorageScope.Instance);
            };
        }
        private TextBlock Text(string value,Color color,double size,bool bold=false)
        {
            return new TextBlock {Text=value,ForegroundColor=color,FontSize=Math.Max(8,Scale(size)),FontWeight=bold?FontWeight.Bold:FontWeight.Normal,Margin=Scale(3),TextWrapping=TextWrapping.Wrap};
        }
        private Button Button(string value,Color color,double width)
        {
            return new Button {Text=value,Width=Scale(width),Height=Scale(27),FontSize=Math.Max(8,Scale(12)),Margin=Scale(2),ForegroundColor=color,BackgroundColor=Color.FromHex("#202c3a")};
        }
        private string Price(double price) {return price.ToString("F"+Symbol.Digits,CultureInfo.InvariantCulture);}
        private double Field(string key) {double n;return double.TryParse(_fields[key].Text,NumberStyles.Float,CultureInfo.InvariantCulture,out n)?Math.Round(n,Symbol.Digits):double.NaN;}
        private void ApplyEdits()
        {
#if TRADE_PLAN_V13
            if(!LicenseActive){UpdateStatus();return;}
#endif
            if(_plan==null){_message="Create a valid rule plan first";UpdateStatus();return;}
            double entry=_plan.Kind==ExecutionKind.Market?(_plan.Side=="BUY"?Symbol.Ask:Symbol.Bid):Field("Entry"),stop=Field("Stop loss"),target=Field("TP1");
            if(!Rules.ValidGeometry(_plan.Side,entry,stop,target)){_message="Invalid prices: check SL/entry/TP direction";UpdateStatus();return;}
            if(!Rules.MeetsTargetMinimum(entry,target,Symbol.PipSize,MinTargetPips)){_message="TP1 must be at least "+MinTargetPips.ToString("0.#",CultureInfo.InvariantCulture)+" pips from entry";UpdateStatus();return;}
            double t2=Field("TP2 guide"),t3=Field("TP3 guide");
            if((Rules.Finite(t2)&&(_plan.Side=="BUY"?t2<=target:t2>=target)) ||
               (Rules.Finite(t3)&&(!Rules.Finite(t2)||(_plan.Side=="BUY"?t3<=t2:t3>=t2))))
            {_message="Optional targets must follow TP1 in order";UpdateStatus();return;}
            _plan.Entry=entry;_plan.Stop=stop;_plan.Target=target;
            _plan.Target2=Rules.Finite(t2)?t2:(double?)null;_plan.Target3=Rules.Finite(t3)?t3:(double?)null;
            _plan.Manual=true;_plan.Draft=false;if(_plan.EntryLabel=="MANUAL STOP DRAFT")_plan.EntryLabel="Manual stop entry";_message="Manual edits fixed - refresh to recalculate";Save();Render();UpdateStatus();
        }
        private void OnObjectsUpdated(ChartObjectsUpdatedEventArgs args)
        {
            ReadLineEdits(args.ChartObjects);
        }
        private void ReadLineEdits(IEnumerable<ChartObject> objects)
        {
#if TRADE_PLAN_V13
            if(!LicenseActive)return;
#endif
            if(_rendering||_plan==null)return;
            bool changed=false;
            foreach(var obj in objects.OrderBy(o=>o is ChartRiskReward?0:1).ToArray())
            {
                if(!obj.Name.StartsWith(_prefix,StringComparison.Ordinal))continue;
                var rr=obj as ChartRiskReward;
                if(rr!=null&&obj.Name==_prefix+"rr")
                {
                    double entry=_plan.Kind==ExecutionKind.Market?_plan.Entry:Math.Round(rr.EntryPrice,Symbol.Digits),stop=Math.Round(rr.StopLossPrice,Symbol.Digits),target=Math.Round(rr.TakeProfitPrice,Symbol.Digits);
                    if(Rules.ApplyDrawingPrices(_plan,entry,stop,target,Symbol.TickSize,Symbol.PipSize,MinTargetPips))changed=true;
                    if(rr.Time1!=_plan.AnchorStart||rr.Time2!=_plan.AnchorEnd)
                    {_plan.AnchorStart=rr.Time1;_plan.AnchorEnd=rr.Time2;changed=true;}
                    continue;
                }
                var line=obj as ChartTrendLine;
                if(line==null)continue;
                string key=line.Name.Substring(_prefix.Length);
                double rendered;
                if(!_renderedLevels.TryGetValue(key,out rendered))continue;
                double y=Math.Round(Rules.HandlePrice(line.Y1,line.Y2,rendered),Symbol.Digits);
                if(key=="entry"||key=="sl"||key=="tp1")
                {
                    if(Rules.ApplyDrawingHandle(_plan,key,y,rendered,Symbol.TickSize,Symbol.PipSize,MinTargetPips))changed=true;
                    continue;
                }
                if(key!="tp2"&&key!="tp3")continue;
                double previous=rendered;
                if(!Rules.Finite(y)||y<=0||Math.Abs(y-previous)<Symbol.TickSize/2)continue;
                if(key=="tp2")_plan.Target2=y;else _plan.Target3=y;
                changed=true;
            }
            if(changed){_plan.Manual=true;_message="Manual edits fixed - reset to recalculate";Save();Render();UpdateStatus();}
        }
        private void Render()
        {
#if TRADE_PLAN_V13
            if(!LicenseActive)return;
#endif
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
                if(rr!=null&&(rr.OrderType!=NativeOrderType||rr.TradeType!=(_plan.Side=="BUY"?TradeType.Buy:TradeType.Sell))){Chart.RemoveObject(_prefix+"rr");rr=null;}
                if(rr==null)rr=Chart.DrawRiskReward(_prefix+"rr",_plan.AnchorStart,_plan.AnchorEnd,_plan.Entry,
                    NativeOrderType,_plan.Side=="BUY"?TradeType.Buy:TradeType.Sell,new ChartRiskRewardFixedSizeType(Symbol.VolumeInUnitsMin));
                UpdatePreviewVolume();
                rr.IsFixedRatio=false;
                if(Math.Abs(rr.EntryPrice-_plan.Entry)>Symbol.TickSize/2)rr.EntryPrice=_plan.Entry;
                rr.StopLossPrice=_plan.Stop;rr.TakeProfitPrice=_plan.Target;
                rr.Time1=_plan.AnchorStart;rr.Time2=_plan.AnchorEnd;
                int alpha=(int)Math.Round(255*DrawingOpacity/100.0);
                if(!ShowShading)alpha=Math.Min(alpha,35);
                rr.RiskColor=_plan.Invalid?Color.FromArgb(alpha,255,170,68):Color.FromArgb(alpha,255,77,109);
                rr.RewardColor=_plan.Invalid?Color.FromArgb(alpha,255,170,68):Color.FromArgb(alpha,0,255,159);
                rr.RiskThickness=LineThickness;rr.RewardThickness=LineThickness;
                rr.IsInteractive=true;rr.IsLocked=false;rr.Comment="Panda Trade Plan preview; "+_plan.EntryLabel;
                // Explicit handles/labels stay visible even when cTrader shows
                // only the native RR fills while that object is deselected.
                double risk=Math.Abs(_plan.Entry-_plan.Stop)/Symbol.PipSize;
                double reward=Math.Abs(_plan.Target-_plan.Entry)/Symbol.PipSize;
                DrawLevel("entry",_plan.Entry,"ENTRY "+_plan.Kind.ToString().ToUpperInvariant(),Blue,true);
                DrawLevel("sl",_plan.Stop,"SL ["+risk.ToString("0.0",CultureInfo.InvariantCulture)+"p]",Red,true);
                DrawLevel("tp1",_plan.Target,"TP1 ["+reward.ToString("0.0",CultureInfo.InvariantCulture)+"p | "+(risk>0?reward/risk:0).ToString("0.00",CultureInfo.InvariantCulture)+"R]",Green,true);
                if(ShowGuides&&_plan.Target2.HasValue)DrawLevel("tp2",_plan.Target2.Value,"TP2",Green);else RemoveLevel("tp2");
                if(ShowGuides&&_plan.Target3.HasValue)DrawLevel("tp3",_plan.Target3.Value,"TP3",Green);else RemoveLevel("tp3");
                var label=Chart.DrawText(_prefix+"source",(_plan.Invalid?"INVALID | ":_plan.Draft?"DRAFT | ":"")+_plan.EntryLabel,_plan.AnchorStart,_plan.Entry,_plan.Invalid?Red:Blue);
                label.FontSize=LabelFontSize;label.IsBold=true;label.IsInteractive=false;
                _fields["Entry"].Text=Price(_plan.Entry);_fields["Stop loss"].Text=Price(_plan.Stop);_fields["TP1"].Text=Price(_plan.Target);
                _fields["TP2 guide"].Text=_plan.Target2.HasValue?Price(_plan.Target2.Value):"-";
                _fields["TP3 guide"].Text=_plan.Target3.HasValue?Price(_plan.Target3.Value):"-";
            }
            finally {_rendering=false;}
        }
        private void DrawLevel(string key,double price,string label,Color color,bool primary=false)
        {
            var line=Chart.FindObject(_prefix+key) as ChartTrendLine;
            if(line==null)line=Chart.DrawTrendLine(_prefix+key,_plan.AnchorStart,price,_plan.AnchorEnd,price,color,2,LineStyle.Lines);
            else {line.Y1=price;line.Y2=price;line.Time1=_plan.AnchorStart;line.Time2=_plan.AnchorEnd;}
            line.Thickness=primary?LineThickness:GuideThickness;line.LineStyle=primary?LineStyle.Solid:LineStyle.Lines;line.ExtendToInfinity=false;
            var guideColor=_plan.Invalid?Color.FromHex("#ffaa44"):color;
            line.Color=Color.FromArgb((int)Math.Round(255*(primary?100:GuideOpacity)/100.0),guideColor);line.IsInteractive=key!="entry"||_plan.Kind!=ExecutionKind.Market;line.IsLocked=!line.IsInteractive;
            _renderedLevels[key]=price;
            var text=Chart.DrawText(_prefix+key+"Label",label+" "+Price(price),_plan.AnchorEnd,price,line.Color);
            text.FontSize=LabelFontSize;text.IsBold=true;text.IsInteractive=false;
        }
        private void RemoveLevel(string key){_renderedLevels.Remove(key);Chart.RemoveObject(_prefix+key);Chart.RemoveObject(_prefix+key+"Label");}
        private void FitPlan()
        {
#if TRADE_PLAN_V13
            if(!LicenseActive){UpdateStatus();return;}
#endif
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
            LocalStorage.SetString("Auto paused",_autoPaused?"1":"0",LocalStorageScope.Instance);
            LocalStorage.SetString(StoreKey,_plan==null?"":JsonSerializer.Serialize(_plan,_json),LocalStorageScope.Instance);
            LocalStorage.Flush(LocalStorageScope.Instance);
        }
        private void UpdateStatus()
        {
            PublishPlan();
#if TRADE_PLAN_V13
            if(!LicenseActive)
            {
                _place.IsEnabled=false;
                _planScoreBias.Text="LICENSE "+_licenseStatus;
                _planScoreBias.ForegroundColor=Red;
                _context.Text="Account "+Account.Number.ToString(CultureInfo.InvariantCulture);
                _status.Text="Trade plan locked until this account is approved";
                _status.ForegroundColor=Red;
                _metrics.Text="SL - pips | TP1 - R";
                _note.Text="Existing broker orders are not cancelled by license checks";
                UpdateDashboardPanel();
                return;
            }
            _place.IsEnabled=true;
#endif
            _compact.Text=SymbolName+" | "+(_plan==null?_pandaBias:_plan.Invalid?"INVALID":_plan.Side+" PLAN");
#if TRADE_PLAN_V12 || TRADE_PLAN_V13
            UpdateDashboardPanel();
            _planScoreBias.Text=(_scoreReady?_pandaGap.ToString("+0;-0;0",CultureInfo.InvariantCulture):"—")+" "+_pandaBias;
            _planScoreBias.ForegroundColor=BiasDashboardColor(_pandaBias);
            _context.Text=SymbolName+" | "+_readyPairs+"/21 cTrader";
#else
            _context.Text=SymbolName+" | Bias "+_pandaBias+" | Gap "+_pandaGap+" | "+_readyPairs+"/21 cTrader";
#endif
            if(ShowScoreDiagnostics&&!string.IsNullOrEmpty(_scoreDetails))_context.Text+="\n"+_scoreDetails;
            _place.Text="Place "+(_plan==null?_pandaBias:_plan.Side)+" "+_orderKind;
            _hide.Text=_hidden?"Show plan":"Hide plan";
            _autoButton.Text=!AutoPlan?"Auto disabled (settings)":_autoPaused?"Resume auto":"Pause auto";
            _status.ForegroundColor=(_plan!=null&&_plan.Invalid)||(_scoreReady&&_hardInvalid)?Red:Blue;
            _status.Text=_plan!=null&&_plan.Invalid?"INVALID - "+(_plan.InvalidReason??"bias changed")+"; plan retained":_message;
            if(!_scoreReady&&_plan==null)_status.Text="Waiting for all 21 pair histories and quotes";
            if(_scoreReady&&_hardInvalid)_status.Text=_scoreInvalidReason;
            if(_plan==null){_metrics.Text="SL - pips | TP1 - R";_note.Text="Rules: "+Mode+"\nReference: "+Reference+"\nExpiry: "+Expiry;return;}
            double risk=Math.Abs(_plan.Entry-_plan.Stop),rr=risk>0?Math.Abs(_plan.Target-_plan.Entry)/risk:0;
            if(_plan.RuleVersion!=5){_status.Text="Older plan retained; Refresh plan applies revised scoring/references";_status.ForegroundColor=Red;}
            bool geometry=Rules.ValidGeometry(_plan.Side,_plan.Entry,_plan.Stop,_plan.Target);
            if(!geometry){_status.Text="INVALID geometry - edit SL/entry/TP";_status.ForegroundColor=Red;}
            else if(!Rules.MeetsTargetMinimum(_plan.Entry,_plan.Target,Symbol.PipSize,MinTargetPips))
            {_status.Text="TP1 below configured minimum - adjust target";_status.ForegroundColor=Red;}
            else if(!Rules.ValidGuides(_plan.Side,_plan.Target,_plan.Target2,_plan.Target3))
            {_status.Text="INVALID guides - targets must follow TP1";_status.ForegroundColor=Red;}
            _metrics.Text="SL "+(risk/Symbol.PipSize).ToString("0.0",CultureInfo.InvariantCulture)+"p | TP1 "+(Math.Abs(_plan.Target-_plan.Entry)/Symbol.PipSize).ToString("0.0",CultureInfo.InvariantCulture)+"p | "+rr.ToString("0.00",CultureInfo.InvariantCulture)+"R";
            bool limitSide=_plan.Kind==ExecutionKind.Market||(_plan.Kind==ExecutionKind.Stop?(_plan.Side=="BUY"?_plan.Entry>Symbol.Ask:_plan.Entry<Symbol.Bid):(_plan.Side=="BUY"?_plan.Entry<Symbol.Ask:_plan.Entry>Symbol.Bid));
            _note.Text=(_plan.Draft?"DRAFT: drag prices or Apply to confirm":_plan.Manual?"MANUAL: levels stay fixed":"Entry: "+_plan.EntryLabel+" | "+_plan.Mode)+
                "\n"+(!limitSide?"Entry crossed: refresh or adjust this pending plan\n":"")+
                (!_scoreReady?"Context unavailable; recheck before use\n":"")+"Expiry: "+Expiry+" | TP2/3 optional guides"+
                "\nAuto orders: "+(AutoPlaceLimits?(AutoOrderDryRun?"DRY RUN":"LIVE ARMED"):"OFF");
        }
        protected override void OnDestroy()
        {
            Timer.Stop();Timer.TimerTick-=Tick;Chart.ObjectsUpdated-=OnObjectsUpdated;
#if TRADE_PLAN_V12 || TRADE_PLAN_V13
            _dashboardDisposed=true;
#endif
            RemoveDrawings();if(_panel!=null)Chart.Draggables.Remove(_panel);
        }
    }
}
