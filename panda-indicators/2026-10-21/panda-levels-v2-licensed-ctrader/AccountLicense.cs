using System;

namespace cAlgo
{
    internal static class AccountLicense
    {
        internal static bool Matches(int actualAccount, string actualBroker,
            int allowedAccount, string allowedBroker)
        {
            // An unset account always fails closed. A blank broker is optional.
            if (allowedAccount <= 0 || actualAccount != allowedAccount)
                return false;
            if (string.IsNullOrWhiteSpace(allowedBroker))
                return true;
            if (allowedBroker == "REPLACE_WITH_BROKER_NAME")
                return false;
            return string.Equals(actualBroker, allowedBroker, StringComparison.OrdinalIgnoreCase);
        }
    }
}
