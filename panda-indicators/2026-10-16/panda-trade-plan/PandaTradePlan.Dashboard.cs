using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using cAlgo.API;

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
        private TextBlock _dashboardSummary,_dashboardFooter,_planScoreBias;
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
            _dashboardSummary.IsVisible=!_minimized&&!_dashboardView;
            _panelRoot.AddChild(_dashboardSummary);
            _dashboardSwitch=Button(_dashboardView?"Show trade plan":"Show dashboard",Blue,PanelWidth-18);
            _dashboardSwitch.IsVisible=!_minimized;
            _dashboardSwitch.Click+=e=>
            {
                _dashboardView=!_dashboardView;
                _dashboardSwitch.Text=_dashboardView?"Show trade plan":"Show dashboard";
                _dashboardBody.IsVisible=!_minimized&&_dashboardView;
                _panelBody.IsVisible=!_minimized&&!_dashboardView;
                _dashboardSummary.IsVisible=!_minimized&&!_dashboardView;
                LocalStorage.SetString("Dashboard view",_dashboardView?"1":"0",LocalStorageScope.Instance);
                LocalStorage.Flush(LocalStorageScope.Instance);
            };
            _panelRoot.AddChild(_dashboardSwitch);
            _dashboardBody=new StackPanel {Orientation=Orientation.Vertical,IsVisible=_minimized||_dashboardView};
            _panelRoot.AddChild(_dashboardBody);
            AddDashboardRow("SCORE / BIAS",18);
            AddDashboardRow("BASE XTF",11);
            AddDashboardRow("QUOTE XTF",11);
            AddDashboardRow("BOX H4",11);
            AddDashboardRow("BOX H1",11);
            AddDashboardRow("PANDA LINES",11);
            AddDashboardRow("XTF",11);
            _dashboardFooter=Text("Dashboard sync · —",Grey,9);
            _dashboardFooter.FontSize=10;
            _dashboardFooter.FontWeight=FontWeight.Bold;
            _dashboardBody.AddChild(_dashboardFooter);
            UpdateDashboardPanel();
        }

        private void AddDashboardRow(string label,double size)
        {
            var row=new Grid(1,2){Margin=Scale(2)};
            var title=Text(label,Color.FromHex("#c5d5e1"),10,true);
            title.FontSize=10;
            row.AddChild(title,0,0);
            var value=Text("—",Color.White,size,true);
            value.FontSize=size;
            _dashboardValues[label]=value;
            row.AddChild(value,0,1);
            _dashboardBody.AddChild(row);
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
            SetDashboardValue("SCORE / BIAS",score+" "+SafeDashboard(pair?.Bias),BiasDashboardColor(pair?.Bias));
            SetDashboardValue("BASE XTF",FormatDashboardExtremes(pair?.BaseCurrency,pair?.BaseScoreTf),Color.LightBlue);
            SetDashboardValue("QUOTE XTF",FormatDashboardExtremes(pair?.QuoteCurrency,pair?.QuoteScoreTf),Color.LightBlue);
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
