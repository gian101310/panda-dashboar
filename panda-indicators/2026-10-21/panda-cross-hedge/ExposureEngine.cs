using System;
using System.Collections.Generic;
using System.Linq;

namespace PandaCrossHedgeCore
{
    // All values are snapshots at current mid prices. This is exposure and a
    // hypothetical sensitivity model, not a prediction or maximum loss.
    public sealed class ExposureLeg
    {
        public string BaseCurrency { get; set; }
        public string QuoteCurrency { get; set; }
        public double SignedBaseUnits { get; set; }
        public double MidPrice { get; set; }
    }

    public sealed class ExposureSnapshot
    {
        public Dictionary<string, double> CurrencyUnits { get; } = new Dictionary<string, double>();
        public Dictionary<string, double> NetAccountValue { get; } = new Dictionary<string, double>();
        public double GrossAccountValue { get; internal set; }
        public double WorstShockLoss { get; internal set; }
        public string WorstShock { get; internal set; } = "none";
    }

    public sealed class FxQuote
    {
        public string BaseCurrency { get; set; }
        public string QuoteCurrency { get; set; }
        public double MidPrice { get; set; }
    }

    public static class FxRateResolver
    {
        // Use the shortest available chain of broker mid quotes. An inverse
        // quote is essential for JPY -> USD when USDJPY is the quoted symbol.
        public static double? FindRate(IEnumerable<FxQuote> quotes, string from, string to)
        {
            if (string.IsNullOrWhiteSpace(from) || string.IsNullOrWhiteSpace(to)) return null;
            if (from == to) return 1;
            var edges = new Dictionary<string, List<KeyValuePair<string, double>>>();
            foreach (var quote in quotes ?? Enumerable.Empty<FxQuote>())
            {
                if (quote == null || string.IsNullOrWhiteSpace(quote.BaseCurrency) ||
                    string.IsNullOrWhiteSpace(quote.QuoteCurrency) ||
                    quote.BaseCurrency == quote.QuoteCurrency ||
                    double.IsNaN(quote.MidPrice) || double.IsInfinity(quote.MidPrice) ||
                    quote.MidPrice <= 0) continue;
                AddEdge(quote.BaseCurrency, quote.QuoteCurrency, quote.MidPrice);
                AddEdge(quote.QuoteCurrency, quote.BaseCurrency, 1 / quote.MidPrice);
            }
            var seen = new HashSet<string> { from };
            var pending = new Queue<KeyValuePair<string, double>>();
            pending.Enqueue(new KeyValuePair<string, double>(from, 1));
            while (pending.Count > 0)
            {
                var current = pending.Dequeue();
                List<KeyValuePair<string, double>> neighbors;
                if (!edges.TryGetValue(current.Key, out neighbors)) continue;
                foreach (var neighbor in neighbors)
                {
                    if (!seen.Add(neighbor.Key)) continue;
                    var rate = current.Value * neighbor.Value;
                    if (double.IsNaN(rate) || double.IsInfinity(rate) || rate <= 0) continue;
                    if (neighbor.Key == to) return rate;
                    pending.Enqueue(new KeyValuePair<string, double>(neighbor.Key, rate));
                }
            }
            return null;

            void AddEdge(string source, string target, double rate)
            {
                List<KeyValuePair<string, double>> neighbors;
                if (!edges.TryGetValue(source, out neighbors))
                    edges[source] = neighbors = new List<KeyValuePair<string, double>>();
                neighbors.Add(new KeyValuePair<string, double>(target, rate));
            }
        }
    }

    public static class ExposureEngine
    {
        public static double TotalAbsoluteNet(ExposureSnapshot snapshot)
        {
            if (snapshot == null) throw new ArgumentNullException(nameof(snapshot));
            return snapshot.NetAccountValue.Values.Sum(Math.Abs);
        }

        public static double HedgeFitScore(ExposureSnapshot before, ExposureSnapshot after,
            double shockFraction, double spreadCost)
        {
            if (before == null || after == null || !Finite(shockFraction) || shockFraction <= 0 ||
                !Finite(spreadCost) || spreadCost < 0)
                throw new ArgumentException("Invalid hedge fit inputs");
            // Worst-shock improvement is primary. A smaller weighted reduction
            // in total absolute net exposure breaks near-ties between crosses.
            return before.WorstShockLoss - after.WorstShockLoss - spreadCost +
                shockFraction * 0.5 * (TotalAbsoluteNet(before) - TotalAbsoluteNet(after));
        }

        public static bool OffsetsAnySelectedCurrency(ExposureLeg selected, ExposureLeg candidate)
        {
            if (selected == null || candidate == null) return false;
            var selectedAmounts = new Dictionary<string, double> {
                [selected.BaseCurrency] = selected.SignedBaseUnits,
                [selected.QuoteCurrency] = -selected.SignedBaseUnits * selected.MidPrice
            };
            var candidateAmounts = new Dictionary<string, double> {
                [candidate.BaseCurrency] = candidate.SignedBaseUnits,
                [candidate.QuoteCurrency] = -candidate.SignedBaseUnits * candidate.MidPrice
            };
            return selectedAmounts.Any(item => candidateAmounts.ContainsKey(item.Key) &&
                Math.Abs(item.Value + candidateAmounts[item.Key]) + 0.000001 < Math.Abs(item.Value));
        }

        public static ExposureSnapshot Calculate(IEnumerable<ExposureLeg> legs,
            IReadOnlyDictionary<string, double> accountRates, string accountCurrency,
            double shockFraction)
        {
            if (legs == null || accountRates == null || string.IsNullOrWhiteSpace(accountCurrency) ||
                !Finite(shockFraction) || shockFraction <= 0 || shockFraction >= 1)
                throw new ArgumentException("Invalid exposure inputs");

            var result = new ExposureSnapshot();
            foreach (var leg in legs)
            {
                if (leg == null || string.IsNullOrWhiteSpace(leg.BaseCurrency) ||
                    string.IsNullOrWhiteSpace(leg.QuoteCurrency) ||
                    leg.BaseCurrency == leg.QuoteCurrency || !Finite(leg.SignedBaseUnits) ||
                    !Finite(leg.MidPrice) || leg.MidPrice <= 0)
                    throw new ArgumentException("Invalid position or quote");
                var baseRate = Rate(accountRates, leg.BaseCurrency);
                var quoteRate = Rate(accountRates, leg.QuoteCurrency);
                var baseUnits = leg.SignedBaseUnits;
                var quoteUnits = -baseUnits * leg.MidPrice;
                Add(result.CurrencyUnits, leg.BaseCurrency, baseUnits);
                Add(result.CurrencyUnits, leg.QuoteCurrency, quoteUnits);
                Add(result.NetAccountValue, leg.BaseCurrency, baseUnits * baseRate);
                Add(result.NetAccountValue, leg.QuoteCurrency, quoteUnits * quoteRate);
                result.GrossAccountValue += Math.Abs(baseUnits * baseRate) + Math.Abs(quoteUnits * quoteRate);
            }

            // A currency shock changes one currency's value against all others.
            // The resulting cross rates stay internally consistent. Revalue the
            // full currency basket in the account currency under each shock.
            foreach (var currency in result.NetAccountValue.Keys.Union(new[] { accountCurrency }))
            foreach (var sign in new[] { -1.0, 1.0 })
            {
                double accountFactor = currency == accountCurrency ? 1 + sign * shockFraction : 1;
                double pnl = 0;
                foreach (var item in result.NetAccountValue)
                {
                    double factor = item.Key == currency ? 1 + sign * shockFraction : 1;
                    pnl += item.Value * (factor / accountFactor - 1);
                }
                if (!Finite(pnl)) throw new ArgumentException("Invalid shock result");
                if (-pnl > result.WorstShockLoss)
                {
                    result.WorstShockLoss = -pnl;
                    result.WorstShock = currency + (sign > 0 ? " +" : " -") +
                        (shockFraction * 100).ToString("0.##") + "%";
                }
            }
            return result;
        }

        private static double Rate(IReadOnlyDictionary<string, double> rates, string currency)
        {
            double value;
            if (!rates.TryGetValue(currency, out value) || !Finite(value) || value <= 0)
                throw new ArgumentException("Missing currency conversion: " + currency);
            return value;
        }

        private static void Add(IDictionary<string, double> values, string key, double amount)
        {
            double prior;
            values.TryGetValue(key, out prior);
            values[key] = prior + amount;
        }

        private static bool Finite(double value) => !double.IsNaN(value) && !double.IsInfinity(value);
    }
}
