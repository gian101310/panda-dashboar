using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using cAlgo.API;
using PandaPlanning;

namespace cAlgo
{
#if TRADE_PLAN_V13
    public partial class PandaTradePlanV13
#else
    public partial class PandaTradePlanV12
#endif
    {
#if TRADE_PLAN_V13
        private const string DashboardEndpoint="https://pandaengine.app/api/ctrader-trade-plan";
#else
        private const string DashboardEndpoint="https://pandaengine.app/api/ctrader-overlay";
#endif
        private string TradePlanTitle
        {
            get
            {
#if TRADE_PLAN_V13
                return "PANDA TRADE PLAN v1.3";
#else
                return "PANDA TRADE PLAN v1.2";
#endif
            }
        }

#if !TRADE_PLAN_V13
        [Parameter("Operator token",Group="Dashboard feed",DefaultValue="",IsValueVisibleInTitle=false)]
        public string DashboardOperatorToken {get;set;}
#endif

        private readonly Dictionary<string,TextBlock> _dashboardValues=new Dictionary<string,TextBlock>();
        private StackPanel _dashboardBody;
        private TextBlock _dashboardSummary,_dashboardHeaderStatus,_dashboardCompact,_dashboardFooter,_planScoreBias;
        private Button _dashboardSwitch;
        private FeedResult _dashboardSnapshot;
        private string _dashboardStatus="CONNECTING";
        private DateTime _dashboardNextRequestUtc=DateTime.MinValue;
        private bool _dashboardView,_dashboardDisposed;
        private void InitializeDashboard()
        {
            _dashboardView=LocalStorage.GetString("Dashboard view",LocalStorageScope.Instance)=="1";
#if TRADE_PLAN_V13
            InitializeLicenseAccount();
#endif
        }

        private void RefreshDashboard()
        {
#if TRADE_PLAN_V13
            var credential=Account.Number.ToString(CultureInfo.InvariantCulture);
            SyncLicenseAccount(credential);
            CheckLicenseExpiry();
            var licenseGeneration=_licenseGeneration;
            var header="x-panda-account-number";
#else
            var credential=(DashboardOperatorToken??string.Empty).Trim();
            if(credential.Length==0){_dashboardStatus="TOKEN NEEDED";return;}
            var header="x-panda-operator-token";
#endif
            if(_chartPair==string.Empty){_dashboardStatus="UNSUPPORTED SYMBOL";return;}
            if(DateTime.UtcNow<_dashboardNextRequestUtc)return;
            _dashboardNextRequestUtc=DateTime.UtcNow.AddSeconds(60);
            try
            {
                SharedOverlayFeed.Request(Http,DashboardEndpoint,header,credential,string.Empty,string.Empty,result=>
                    BeginInvokeOnMainThread(()=>
                    {
                        if(_dashboardDisposed)return;
#if TRADE_PLAN_V13
                        if(licenseGeneration!=_licenseGeneration||credential!=Account.Number.ToString(CultureInfo.InvariantCulture))return;
                        ApplyLicenseFeed(result);
#endif
                        if(result.Success)
                        {
                            _dashboardSnapshot=result;
                            _dashboardStatus=result.Pairs.ContainsKey(_chartPair)?"LIVE":"PAIR MISSING";
                        }
                        else
                        {
                            _dashboardSnapshot=null;
                            _dashboardStatus=result.Status??"ERROR";
                        }
                        UpdateDashboardPanel();
                    }));
            }
            catch(Exception ex)
            {
                _dashboardStatus="ERROR";
#if TRADE_PLAN_V13
                RevokeLicense("LICENSE UNAVAILABLE");
#endif
                Print("Panda dashboard request failed: "+ex.GetType().Name);
            }
        }

        private void AddDashboardSwitch()
        {
            _dashboardSummary=Text("Dashboard feed: connecting",Grey,10);
            _dashboardSummary.FontSize=11;
            _dashboardSummary.FontWeight=FontWeight.Bold;
            _panelRoot.AddChild(_dashboardSummary);
            var showDashboard=Button("Show dashboard",Blue,PanelWidth-18);
            showDashboard.Click+=e=>
            {
                _dashboardView=true;
                UpdatePanelHost();
                LocalStorage.SetString("Dashboard view","1",LocalStorageScope.Instance);
                LocalStorage.Flush(LocalStorageScope.Instance);
            };
            _panelRoot.AddChild(showDashboard);

            _dashboardRoot=new StackPanel
            {
                Orientation=Orientation.Vertical,
                Width=PanelLayoutRules.DashboardWidth(_minimized),
                BackgroundColor=Color.FromArgb(230,9,15,25),
                Margin=2
            };
            var dashboardHeader=new Grid(1,3){Margin=7};
            dashboardHeader.AddChild(DashboardText(_chartPair+" · PANDA",Color.White,11,true),0,0);
            _dashboardHeaderStatus=DashboardText(_dashboardStatus,Color.Gold,9,true);
            dashboardHeader.AddChild(_dashboardHeaderStatus,0,1);
            _dashboardShrink=new Button {Text=_minimized?"+":"−",Width=28,Height=22,Margin=1};
            _dashboardShrink.HorizontalAlignment=HorizontalAlignment.Right;
            _dashboardShrink.Click+=e=>
            {
                _minimized=!_minimized;
                UpdatePanelHost();
                LocalStorage.SetString("Panel minimized",_minimized?"1":"0",LocalStorageScope.Instance);
                LocalStorage.Flush(LocalStorageScope.Instance);
            };
            dashboardHeader.AddChild(_dashboardShrink,0,2);
            _dashboardRoot.AddChild(dashboardHeader);

            _dashboardSwitch=new Button {Text="Show trade plan",Width=242,Height=27,FontSize=12,Margin=2,ForegroundColor=Blue,BackgroundColor=Color.FromHex("#202c3a")};
            _dashboardSwitch.IsVisible=PanelLayoutRules.ShowDashboardSwitch(_minimized);
            _dashboardSwitch.Click+=e=>
            {
                _dashboardView=false;
                UpdatePanelHost();
                LocalStorage.SetString("Dashboard view","0",LocalStorageScope.Instance);
                LocalStorage.Flush(LocalStorageScope.Instance);
            };
            _dashboardRoot.AddChild(_dashboardSwitch);
            _dashboardCompact=DashboardText("—  —  "+_dashboardStatus,Grey,12,true);
            _dashboardCompact.IsVisible=PanelLayoutRules.ShowDashboardCompact(_minimized);
            _dashboardRoot.AddChild(_dashboardCompact);
            _dashboardBody=new StackPanel {Orientation=Orientation.Vertical};
            _dashboardBody.IsVisible=PanelLayoutRules.ShowDashboardBody(_minimized);
            _dashboardRoot.AddChild(_dashboardBody);
            AddDashboardRow("SCORE",22);
            AddDashboardRow("BASE XTF",10);
            AddDashboardRow("QUOTE XTF",10);
            AddDashboardRow("BIAS",13);
            AddDashboardRow("BOX H4",11);
            AddDashboardRow("BOX H1",11);
            AddDashboardRow("PANDA LINES",11);
            AddDashboardRow("XTF",10);
            _dashboardFooter=DashboardText("Dashboard sync · —",Grey,9,false);
            _dashboardBody.AddChild(_dashboardFooter);
            UpdateDashboardPanel();
        }

        private void AddDashboardRow(string label,double size)
        {
            var row=new Grid(1,2){Margin=new Thickness(8,2,8,2)};
            var title=DashboardText(label,Color.Gray,9,false);
            row.AddChild(title,0,0);
            var value=DashboardText("—",Color.White,size,true);
            _dashboardValues[label]=value;
            row.AddChild(value,0,1);
            _dashboardBody.AddChild(row);
        }

        private static TextBlock DashboardText(string value,Color color,double size,bool bold)
        {
            return new TextBlock
            {
                Text=value??"—",
                ForegroundColor=color,
                FontSize=size,
                FontWeight=bold?FontWeight.ExtraBold:FontWeight.Normal,
                Margin=new Thickness(4,2,4,2)
            };
        }

        private OverlayPair DashboardPair()
        {
            OverlayPair pair;
            return _dashboardSnapshot!=null&&_dashboardSnapshot.Pairs!=null&&
                _dashboardSnapshot.Pairs.TryGetValue(_chartPair,out pair)?pair:null;
        }

        private void UpdateDashboardPanel()
        {
            if(_dashboardSummary==null)return;
            var pair=DashboardPair();
            var status=_dashboardStatus;
            if(_dashboardSnapshot!=null&&DateTime.UtcNow-_dashboardSnapshot.ReceivedAtUtc>
                TimeSpan.FromSeconds(_dashboardSnapshot.MaxAgeSeconds))status="STALE";
            DateTime updated=DateTime.MinValue;
            var hasTime=pair!=null&&DateTime.TryParse(pair.UpdatedAt,CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal|DateTimeStyles.AdjustToUniversal,out updated);
            if(status=="LIVE"&&hasTime&&DateTime.UtcNow-updated>TimeSpan.FromSeconds(_dashboardSnapshot.MaxAgeSeconds))status="STALE";
            var score=pair?.Gap.HasValue==true?FormatDashboardScore(pair.Gap.Value):"—";
            _dashboardSummary.Text="Dashboard "+score+" "+SafeDashboard(pair?.Bias)+" | "+status;
            _dashboardSummary.ForegroundColor=status=="LIVE"?BiasDashboardColor(pair?.Bias):Color.Gold;
            _dashboardHeaderStatus.Text=status;
            _dashboardHeaderStatus.ForegroundColor=status=="LIVE"?Green:Color.Gold;
            _dashboardCompact.Text=score+"  "+SafeDashboard(pair?.Bias)+"  "+status;
            _dashboardCompact.ForegroundColor=BiasDashboardColor(pair?.Bias);
            SetDashboardValue("SCORE",score,BiasDashboardColor(pair?.Bias));
            SetDashboardValue("BASE XTF",FormatDashboardExtremes(pair?.BaseCurrency,pair?.BaseScoreTf),Color.LightBlue);
            SetDashboardValue("QUOTE XTF",FormatDashboardExtremes(pair?.QuoteCurrency,pair?.QuoteScoreTf),Color.LightBlue);
            SetDashboardValue("BIAS",SafeDashboard(pair?.Bias),BiasDashboardColor(pair?.Bias));
            SetDashboardValue("BOX H4",SafeDashboard(pair?.BoxH4Trend),TrendDashboardColor(pair?.BoxH4Trend));
            SetDashboardValue("BOX H1",SafeDashboard(pair?.BoxH1Trend),TrendDashboardColor(pair?.BoxH1Trend));
            SetDashboardValue("PANDA LINES",pair==null?"—":pair.PandaLinesValid?"CONFIRMED":SafeDashboard(pair.PandaLinesZone),
                pair?.PandaLinesValid==true?Green:Color.Gold);
            SetDashboardValue("XTF",pair==null?"—":FormatDashboardXtf(pair),Color.LightBlue);
            _dashboardFooter.Text="Dashboard sync · "+(hasTime?updated.ToLocalTime().ToString("HH:mm:ss",CultureInfo.InvariantCulture):"—")+" · "+status;
            _dashboardFooter.ForegroundColor=status=="LIVE"?Green:Color.Gold;
        }

        private void SetDashboardValue(string label,string value,Color color)
        {
            _dashboardValues[label].Text=value;
            _dashboardValues[label].ForegroundColor=color;
        }

        private static string SafeDashboard(string value)
        {
            return string.IsNullOrWhiteSpace(value)?"—":value;
        }

        private static string FormatDashboardScore(double score)
        {
            return score==Math.Truncate(score)
                ?score.ToString("+0;-0;0",CultureInfo.InvariantCulture)
                :score.ToString("+0.0;-0.0;0.0",CultureInfo.InvariantCulture);
        }

        private static string FormatDashboardExtremes(string currency,string tokens)
        {
            var label=string.IsNullOrWhiteSpace(currency)?"—":currency.Trim();
            if(string.IsNullOrWhiteSpace(tokens))return label+": NONE";
            var parts=tokens.Split(new[]{' '},StringSplitOptions.RemoveEmptyEntries)
                .Where(token=>token.Length>=3)
                .Select(token=>token.Substring(0,2)+" "+token.Substring(2).TrimStart(':'))
                .Where(token=>token.Length>3).ToArray();
            return parts.Length==0?label+": NONE":label+": "+string.Join(" · ",parts);
        }

        private static string FormatDashboardXtf(OverlayPair pair)
        {
            var baseScore=string.IsNullOrWhiteSpace(pair.BaseScoreTf)?"NONE":pair.BaseCurrency+" "+pair.BaseScoreTf;
            var quoteScore=string.IsNullOrWhiteSpace(pair.QuoteScoreTf)?"NONE":pair.QuoteCurrency+" "+pair.QuoteScoreTf;
            return baseScore+" | "+quoteScore;
        }

        private static Color BiasDashboardColor(string bias)
        {
            return bias=="BUY"?Color.FromHex("#00bd78"):bias=="SELL"?Color.FromHex("#ff4545"):Grey;
        }

        private static Color TrendDashboardColor(string trend)
        {
            return trend=="UPTREND"?Green:trend=="DOWNTREND"?Red:Grey;
        }
    }
}
