using PandaPlanning;

namespace cAlgo
{
    public partial class PandaTradePlanV13
    {
        public PlanMode Mode {get;set;}=PlanMode.ScoringBias;
        public EntryReference Reference {get;set;}=EntryReference.PreviousLevelsAndBoxes;
        public PlanExpiry Expiry {get;set;}=PlanExpiry.ManualOnly;
        public BiasChange BiasAction {get;set;}=BiasChange.MarkInvalid;
        public bool ShowGuides {get;set;}=true;
        public bool ShowShading {get;set;}=true;
        public int DrawingWidth {get;set;}=12;
        public bool AutoPlan {get;set;}=true;
        public int RefreshSeconds {get;set;}=15;
        public bool UseDay {get;set;}=true;
        public bool UseWeek {get;set;}=true;
        public bool UseMonth {get;set;}=true;
        public bool UseH1Box {get;set;}=true;
        public bool UseH4Box {get;set;}=true;
        public bool UseD1Box {get;set;}=true;
        public double MinTargetPips {get;set;}=50;
        public double MaxEntryPips {get;set;}=0;
        public double MaxTargetPips {get;set;}=0;
        public double StopUnder100 {get;set;}=2;
        public double StopUnder200 {get;set;}=3;
        public double StopUnder300 {get;set;}=4;
        public double StopFrom300 {get;set;}=5;
        public int LineThickness {get;set;}=2;
        public int GuideThickness {get;set;}=2;
        public int DrawingOpacity {get;set;}=71;
        public int GuideOpacity {get;set;}=100;
        public int LabelFontSize {get;set;}=11;
        public int PanelScale {get;set;}=80;
        public int PanelWidth {get;set;}=280;
        public int PanelOpacity {get;set;}=96;
        public int PanelX {get;set;}=-1;
        public int PanelY {get;set;}=20;
        public bool RememberPosition {get;set;}=true;
        public bool StartCollapsed {get;set;}=false;
        public bool ShowScoreDiagnostics {get;set;}=true;
    }
}
