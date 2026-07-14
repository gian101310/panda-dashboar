using cAlgo.API;

namespace cAlgo
{
    [Indicator(IsOverlay = true, TimeZone = TimeZones.UTC, AccessRights = AccessRights.None)]
    public class PandaDashboardOverlayLicensed : PandaDashboardOverlayBase
    {
        protected override string CredentialHeader { get { return "x-panda-account-number"; } }
        protected override string CredentialValue { get { return Account.Number.ToString(); } }

        public override void Calculate(int index) { }
    }
}
