using System;
using System.Collections.Generic;
using PandaCrossHedgeCore;

var panda = PandaBiasSnapshot.Parse(
    "PANDA_HEDGE_BIAS_V1\t2026-10-21T10:00:00Z\n" +
    "GBPUSD\tBUY\t7\t0\tABOVE\tRANGING\tUNKNOWN\t1\n" +
    "GBPJPY\tBUY\t7\t0\tABOVE\tDOWNTREND\tUNKNOWN\t1\n" +
    "GBPCAD\tWAIT\t0\t1\tABOVE\tUPTREND\tUPTREND\t1\n" +
    "EURUSD\tBUY\t9\t0\tABOVE\tUPTREND\tUPTREND\t1\n");
if (!panda.IsFresh(new DateTime(2026, 10, 21, 10, 15, 0, DateTimeKind.Utc), TimeSpan.FromMinutes(20)) ||
    panda.IsFresh(new DateTime(2026, 10, 21, 10, 21, 0, DateTimeKind.Utc), TimeSpan.FromMinutes(20)))
    throw new Exception("Panda snapshot freshness gate failed");
if (panda.Pairs["GBPUSD"].Classify("BUY") != PandaSetupState.Watch ||
    panda.Pairs["GBPJPY"].Classify("BUY") != PandaSetupState.Watch ||
    panda.Pairs["GBPCAD"].Classify("BUY") != PandaSetupState.Rejected ||
    panda.Pairs["EURUSD"].Classify("BUY") != PandaSetupState.Confirmed)
    throw new Exception("Panda setup classification failed");
if (!panda.Pairs["GBPJPY"].BoxOpposes("BUY") || panda.Pairs["GBPUSD"].BoxOpposes("BUY"))
    throw new Exception("Opposing box flag failed");

// Fixed hypothetical rates. These tests verify account-currency sensitivity,
// including a coherent currency shock, independently of live broker data.
var rates = new Dictionary<string, double> {
    ["EUR"] = 1.20, ["GBP"] = 1.40, ["USD"] = 1.0, ["JPY"] = 0.01
};
var brokerQuotes = new[] {
    new FxQuote { BaseCurrency = "USD", QuoteCurrency = "JPY", MidPrice = 150 },
    new FxQuote { BaseCurrency = "EUR", QuoteCurrency = "USD", MidPrice = 1.20 }
};
Near(FxRateResolver.FindRate(brokerQuotes, "JPY", "USD") ?? 0, 1.0 / 150,
    "inverse USDJPY converts JPY to USD");
Near(FxRateResolver.FindRate(brokerQuotes, "JPY", "EUR") ?? 0, 1.0 / 180,
    "JPY converts via USD to EUR");
if (FxRateResolver.FindRate(brokerQuotes, "CAD", "USD").HasValue)
    throw new Exception("Missing quote path was accepted");
var eurBuy = new ExposureLeg { BaseCurrency = "EUR", QuoteCurrency = "USD",
    SignedBaseUnits = 1000, MidPrice = 1.20 };
var eurSell = new ExposureLeg { BaseCurrency = "EUR", QuoteCurrency = "USD",
    SignedBaseUnits = -1000, MidPrice = 1.20 };
var gbpBuy = new ExposureLeg { BaseCurrency = "GBP", QuoteCurrency = "USD",
    SignedBaseUnits = 1000, MidPrice = 1.40 };

var one = ExposureEngine.Calculate(new[] { eurBuy }, rates, "USD", .01);
Near(one.CurrencyUnits["EUR"], 1000, "buy base units");
Near(one.CurrencyUnits["USD"], -1200, "buy quote units");
Near(one.NetAccountValue["EUR"], 1200, "EUR to USD exposure");
Near(one.WorstShockLoss, 12, "1 percent EUR weakness");

var offset = ExposureEngine.Calculate(new[] { eurBuy, eurSell }, rates, "USD", .01);
Near(offset.CurrencyUnits["EUR"], 0, "opposite base positions net");
Near(offset.NetAccountValue["USD"], 0, "opposite quote positions net");
Near(offset.WorstShockLoss, 0, "opposite positions shock loss");
Near(offset.GrossAccountValue, 4800, "gross remains visible");

var concentrated = ExposureEngine.Calculate(new[] { eurBuy, gbpBuy }, rates, "USD", .01);
Near(concentrated.CurrencyUnits["USD"], -2600, "shared USD short exposure");
Near(concentrated.WorstShockLoss, 2600 * (1 - 1 / 1.01), "two trades reinforce USD risk");

var gbpSell = new ExposureLeg { BaseCurrency = "GBP", QuoteCurrency = "USD",
    SignedBaseUnits = -1000, MidPrice = 1.40 };
if (!ExposureEngine.OffsetsAnySelectedCurrency(eurBuy, gbpSell))
    throw new Exception("GBPUSD sell should offset some selected USD short exposure");
if (ExposureEngine.OffsetsAnySelectedCurrency(eurBuy, gbpBuy))
    throw new Exception("GBPUSD buy reinforces, rather than offsets, USD short exposure");
var oversized = new ExposureLeg { BaseCurrency = "GBP", QuoteCurrency = "USD",
    SignedBaseUnits = -3000, MidPrice = 1.40 };
if (ExposureEngine.OffsetsAnySelectedCurrency(eurBuy, oversized))
    throw new Exception("Oversized opposite position should not count as a reduced selected exposure");
var synthetic = ExposureEngine.Calculate(new[] { eurBuy, gbpSell }, rates, "USD", .01);
Near(synthetic.CurrencyUnits["USD"], 200, "equal lots do not cancel USD");
if (synthetic.WorstShockLoss <= 0) throw new Exception("Synthetic cross must retain risk");

// Two crosses can reduce the same GBP shock. Prefer the one that also
// reduces an existing JPY long instead of adding a new USD short.
var audRates = new Dictionary<string, double> {
    ["AUD"] = 1, ["GBP"] = 1.90, ["JPY"] = .01, ["USD"] = 1.50
};
var gbpAudSell = new ExposureLeg { BaseCurrency = "GBP", QuoteCurrency = "AUD",
    SignedBaseUnits = -1000, MidPrice = 1.90 };
var audJpySell = new ExposureLeg { BaseCurrency = "AUD", QuoteCurrency = "JPY",
    SignedBaseUnits = -2000, MidPrice = 100 };
var portfolio = ExposureEngine.Calculate(new[] { gbpAudSell, audJpySell }, audRates, "AUD", .01);
var withGbpJpy = ExposureEngine.Calculate(new[] { gbpAudSell, audJpySell,
    new ExposureLeg { BaseCurrency = "GBP", QuoteCurrency = "JPY",
        SignedBaseUnits = 1000, MidPrice = 190 } }, audRates, "AUD", .01);
var withGbpUsd = ExposureEngine.Calculate(new[] { gbpAudSell, audJpySell,
    new ExposureLeg { BaseCurrency = "GBP", QuoteCurrency = "USD",
        SignedBaseUnits = 1000, MidPrice = 1.90 / 1.50 } }, audRates, "AUD", .01);
if (ExposureEngine.HedgeFitScore(portfolio, withGbpJpy, .01, 0) <=
    ExposureEngine.HedgeFitScore(portfolio, withGbpUsd, .01, 0))
    throw new Exception("Cross that offsets GBP and JPY should outrank one adding USD short");

var eurAccount = new Dictionary<string, double> { ["EUR"] = 1, ["USD"] = 1 / 1.2 };
var inEur = ExposureEngine.Calculate(new[] { eurBuy }, eurAccount, "EUR", .01);
Near(inEur.NetAccountValue["USD"], -1000, "inverse USD conversion");
if (inEur.WorstShockLoss <= 0) throw new Exception("EUR-account shock must show risk");

try {
    ExposureEngine.Calculate(new[] { eurBuy }, new Dictionary<string, double> { ["USD"] = 1 }, "USD", .01);
    throw new Exception("Missing conversion was accepted");
} catch (ArgumentException ex) when (ex.Message.Contains("Missing currency conversion")) { }

Console.WriteLine("PASS: exposure signs, conversion, offset, cross ranking, concentration and shocks");

static void Near(double actual, double expected, string label) {
    if (Math.Abs(actual - expected) > 0.000001)
        throw new Exception(label + ": expected " + expected + ", got " + actual);
}
