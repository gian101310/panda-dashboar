using System;
using System.Globalization;
using cAlgo.API;

namespace cAlgo
{
    public partial class PandaTradePlanV13
    {
        private string _licenseAccount=string.Empty;
        private string _licenseStatus="CHECKING";
        private DateTime _licenseValidUntilUtc=DateTime.MinValue;
        private int _licenseGeneration;

        private void InitializeLicenseAccount()
        {
            _licenseAccount=Account.Number.ToString(CultureInfo.InvariantCulture);
            _dashboardStatus="LICENSE CHECKING";
        }

        private bool LicenseActive
        {
            get
            {
                return _licenseAccount==Account.Number.ToString(CultureInfo.InvariantCulture)
                    &&DateTime.UtcNow<_licenseValidUntilUtc;
            }
        }

        private void SyncLicenseAccount(string account)
        {
            if(_licenseAccount==account)return;
            _licenseGeneration++;
            _licenseAccount=account;
            _licenseValidUntilUtc=DateTime.MinValue;
            _licenseStatus="CHECKING";
            _dashboardStatus="LICENSE CHECKING";
            _dashboardSnapshot=null;
            _dashboardNextRequestUtc=DateTime.MinValue;
            _plan=null;
            _submittedPlan=null;
            _hidden=false;
            RemoveDrawings();
            if(_fields.Count>0)
                foreach(var field in _fields.Values)field.Text="-";
            if(_place!=null)UpdateStatus();
        }

        private void CheckLicenseExpiry()
        {
            if(_licenseValidUntilUtc!=DateTime.MinValue&&!LicenseActive)
                RevokeLicense("LICENSE UNAVAILABLE");
        }

        private void ApplyLicenseFeed(FeedResult result)
        {
            if(!result.Success)
            {
                RevokeLicense(result.Status??"LICENSE UNAVAILABLE");
                return;
            }
            var wasActive=LicenseActive;
            _licenseValidUntilUtc=result.ReceivedAtUtc.AddSeconds(75);
            _licenseStatus="APPROVED";
            if(!LicenseActive)
            {
                RevokeLicense("LICENSE UNAVAILABLE");
                return;
            }
            if(!wasActive)
            {
                Render();
                Tick();
            }
        }

        private void RevokeLicense(string status)
        {
            _licenseValidUntilUtc=DateTime.MinValue;
            _licenseStatus=status;
            _dashboardStatus=status;
            _dashboardSnapshot=null;
            RemoveDrawings();
            if(_place!=null)UpdateStatus();
        }
    }
}
