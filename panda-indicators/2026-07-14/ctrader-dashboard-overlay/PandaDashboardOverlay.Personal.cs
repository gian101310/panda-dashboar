using cAlgo.API;

namespace cAlgo
{
    [Indicator(IsOverlay = true, TimeZone = TimeZones.UTC, AccessRights = AccessRights.None)]
    public class PandaDashboardOverlayPersonal : PandaDashboardOverlayBase
    {
        [Parameter("Operator Token", DefaultValue = "")]
        public string OperatorToken { get; set; }

        protected override string CredentialHeader { get { return "x-panda-operator-token"; } }
        protected override string CredentialValue { get { return OperatorToken == null ? string.Empty : OperatorToken.Trim(); } }

        public override void Calculate(int index) { }
    }
}
