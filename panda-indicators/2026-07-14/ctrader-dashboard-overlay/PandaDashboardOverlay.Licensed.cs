using System;
using cAlgo.API;

namespace cAlgo
{
    [Indicator(IsOverlay = true, TimeZone = TimeZones.UTC, AccessRights = AccessRights.None)]
    public class PandaDashboardOverlayLicensed : PandaDashboardOverlayBase
    {
        private const string DeviceIdKey = "PandaOverlay Licensed Device ID";
        private const string DeviceTokenKeyPrefix = "PandaOverlay Licensed Device Token ";
        private string _deviceId;
        private string _deviceToken;

        protected override string CredentialHeader { get { return "x-panda-account-number"; } }
        protected override string CredentialValue { get { return Account.Number.ToString(); } }
        protected override string DeviceId { get { return _deviceId ?? string.Empty; } }
        protected override string DeviceToken { get { return _deviceToken ?? string.Empty; } }

        protected override void Initialize()
        {
            _deviceId = LocalStorage.GetString(DeviceIdKey, LocalStorageScope.Device);
            _deviceToken = LocalStorage.GetString(DeviceTokenKeyPrefix + Account.Number, LocalStorageScope.Device);
            if (string.IsNullOrWhiteSpace(_deviceId))
            {
                _deviceId = Guid.NewGuid().ToString("N");
                LocalStorage.SetString(DeviceIdKey, _deviceId, LocalStorageScope.Device);
                LocalStorage.Flush(LocalStorageScope.Device);
            }
            base.Initialize();
        }

        protected override void SaveDeviceActivation(string token)
        {
            var normalized = (token ?? string.Empty).Trim();
            if (normalized.Length != 64) return;
            _deviceToken = normalized;
            LocalStorage.SetString(DeviceTokenKeyPrefix + Account.Number, _deviceToken, LocalStorageScope.Device);
            LocalStorage.Flush(LocalStorageScope.Device);
        }

        public override void Calculate(int index) { }
    }
}
