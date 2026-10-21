using System;
using cAlgo;
class Program
{
    static void Check(bool expected, int actualAccount, string actualBroker, int allowedAccount, string allowedBroker)
    {
        if (AccountLicense.Matches(actualAccount, actualBroker, allowedAccount, allowedBroker) != expected)
            throw new Exception("Unexpected license decision");
    }
    static void Main()
    {
        Check(true, 123456, "Example Broker", 123456, "Example Broker");
        Check(true, 123456, "example broker", 123456, "Example Broker");
        Check(false, 654321, "Example Broker", 123456, "Example Broker");
        Check(false, 123456, "Other Broker", 123456, "Example Broker");
        Check(false, 123456, "Example Broker", 0, "Example Broker");
        Check(false, 0, "Example Broker", 0, "Example Broker");
        Check(true, 123456, "Example Broker", 123456, "");
        Check(false, 123456, null, 123456, "Example Broker");
        Check(true, 123456, "Any Broker", 123456, "   ");
        Check(false, 123456, "REPLACE_WITH_BROKER_NAME", 123456, "REPLACE_WITH_BROKER_NAME");
        // Simulate authorized -> wrong account -> authorized -> wrong broker.
        Check(true, 123456, "Example Broker", 123456, "Example Broker");
        Check(false, 234567, "Example Broker", 123456, "Example Broker");
        Check(true, 123456, "Example Broker", 123456, "Example Broker");
        Check(false, 123456, "Other Broker", 123456, "Example Broker");
        Console.WriteLine("PASS: 14 license decisions, including unset placeholders and account switching.");
    }
}
