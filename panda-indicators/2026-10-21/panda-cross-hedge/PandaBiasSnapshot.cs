using System;
using System.Collections.Generic;
using System.Globalization;

namespace PandaCrossHedgeCore
{
    public enum PandaSetupState { Rejected, Watch, Confirmed }

    public sealed class PandaSetup
    {
        public string Pair, Bias, Zone, H1, H4;
        public double Gap;
        public bool HardInvalid, G1Valid;

        public bool BoxOpposes(string side)
        {
            var bad = side == "BUY" ? "DOWNTREND" : "UPTREND";
            return H1 == bad || H4 == bad;
        }

        public PandaSetupState Classify(string side)
        {
            if (HardInvalid || !string.Equals(Bias, side, StringComparison.Ordinal) ||
                (side == "BUY" ? Gap < 5 : side == "SELL" ? Gap > -5 : true))
                return PandaSetupState.Rejected;
            var good = side == "BUY" ? "UPTREND" : "DOWNTREND";
            var zone = side == "BUY" ? "ABOVE" : "BELOW";
            return G1Valid && Zone == zone && H1 == good && H4 == good ?
                PandaSetupState.Confirmed : PandaSetupState.Watch;
        }
    }

    public sealed class PandaBiasSnapshot
    {
        public DateTime GeneratedUtc { get; private set; }
        public Dictionary<string, PandaSetup> Pairs { get; } = new Dictionary<string, PandaSetup>();

        public bool IsFresh(DateTime nowUtc, TimeSpan maxAge) =>
            GeneratedUtc <= nowUtc.AddMinutes(1) && nowUtc - GeneratedUtc <= maxAge;

        public static PandaBiasSnapshot Parse(string data)
        {
            if (string.IsNullOrWhiteSpace(data)) throw new FormatException("Empty Panda setup snapshot");
            var lines = data.Split(new[] { '\n' }, StringSplitOptions.RemoveEmptyEntries);
            var header = lines[0].TrimEnd('\r').Split('\t');
            if (header.Length != 2 || header[0] != "PANDA_HEDGE_BIAS_V1")
                throw new FormatException("Unsupported Panda setup snapshot");
            var snapshot = new PandaBiasSnapshot {
                GeneratedUtc = DateTime.ParseExact(header[1], "yyyy-MM-ddTHH:mm:ssZ",
                    CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal)
            };
            for (var i = 1; i < lines.Length; i++)
            {
                var fields = lines[i].TrimEnd('\r').Split('\t');
                if (fields.Length != 8 || fields[0].Length != 6 ||
                    !double.TryParse(fields[2], NumberStyles.Float, CultureInfo.InvariantCulture, out var gap))
                    throw new FormatException("Invalid Panda setup row");
                snapshot.Pairs[fields[0]] = new PandaSetup {
                    Pair = fields[0], Bias = fields[1], Gap = gap,
                    HardInvalid = fields[3] == "1", Zone = fields[4],
                    H1 = fields[5], H4 = fields[6], G1Valid = fields[7] == "1"
                };
            }
            if (snapshot.Pairs.Count == 0) throw new FormatException("No Panda setup rows");
            return snapshot;
        }
    }
}
