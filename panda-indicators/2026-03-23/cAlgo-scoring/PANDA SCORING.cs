using cAlgo.API;
using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace cAlgo
{
    [Indicator(IsOverlay = true, AccessRights = AccessRights.FullAccess)]
    public class Panda_scoring : Indicator
    {
        private string pandaPath =
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData) +
            @"\MetaQuotes\Terminal\Common\Files\";

        private string lastMt4Snapshot = "";
        private HashSet<string> drawnBoxes = new HashSet<string>();

        protected override void Initialize() {}

        public override void Calculate(int index)
        {
            ReadIfChanged();
        }

        private void ReadIfChanged()
        {
            string cleanSymbol = NormalizeSymbol(SymbolName);

            string mt4File   = pandaPath + "mt4_"   + cleanSymbol + ".txt";
            string pandaFile = pandaPath + "panda_" + cleanSymbol + ".txt";

            if (!File.Exists(mt4File))
                return;

            string mt4Content;
            try
            {
                using (var fs = new FileStream(mt4File, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                using (var sr = new StreamReader(fs))
                    mt4Content = sr.ReadToEnd();
            }
            catch { return; }

            if (mt4Content == lastMt4Snapshot)
                return;

            lastMt4Snapshot = mt4Content;

            string[] mt4Lines = mt4Content.Split(new[] { "\r\n", "\n" }, StringSplitOptions.None);

            if (mt4Lines.Length < 2)
                return;

            string baseLine   = mt4Lines[0];
            string quoteLine  = mt4Lines[1];
            string advBase    = mt4Lines.Length > 2 ? mt4Lines[2] : "";
            string advQuote   = mt4Lines.Length > 3 ? mt4Lines[3] : "";
            string atrLine    = mt4Lines.Length > 4 ? mt4Lines[4] : "";
            string spreadLine = mt4Lines.Length > 5 ? mt4Lines[5] : "";

            // ===== FIXED DOMINANCE ENGINE (threshold >= 3) =====
            bool ExtractScore(string line, out int score)
            {
                score = 0;
                bool invalid = false;

                if (line.StartsWith("ADV"))
                    return false;

                var matches = Regex.Matches(line, @"(D1|H4|H1)\s*:\s*([+-]?\d+)(?:/([+-]?\d+))?");

                List<int> values   = new List<int>();
                List<string> posTF = new List<string>();
                List<string> negTF = new List<string>();

                foreach (Match m in matches)
                {
                    string tf = m.Groups[1].Value;
                    int v1 = int.Parse(m.Groups[2].Value);
                    values.Add(v1);

                    if (v1 >= 3) posTF.Add(tf + ":" + v1);
                    if (v1 <= -3) negTF.Add(tf + ":" + v1);

                    if (m.Groups[3].Success)
                    {
                        int v2 = int.Parse(m.Groups[3].Value);
                        values.Add(v2);
                        if (v2 >= 3) posTF.Add(tf + ":" + v2);
                        if (v2 <= -3) negTF.Add(tf + ":" + v2);
                    }
                }

                // Conflict = INVALID
                if (posTF.Count > 0 && negTF.Count > 0)
                    return true; // invalid = true

                int strongestPos = values.Where(v => v > 0).DefaultIfEmpty(0).Max();
                int strongestNeg = values.Where(v => v < 0).DefaultIfEmpty(0).Min();
                int absPos = Math.Abs(strongestPos);
                int absNeg = Math.Abs(strongestNeg);

                if (absPos == absNeg && absPos != 0) { score = 0; return false; }
                score = absNeg > absPos ? strongestNeg : strongestPos;
                return false; // not invalid
            }

            bool baseInvalid  = ExtractScore(baseLine,  out int baseVal);
            bool quoteInvalid = ExtractScore(quoteLine, out int quoteVal);

            bool hardInvalid = baseInvalid || quoteInvalid;

            int gap = hardInvalid ? 0 : baseVal - quoteVal;

            // ===== BIAS ENGINE (mirrors cBot logic exactly) =====
            string bias, execution, confidence;

            if (hardInvalid)
            {
                bias       = "HARD_INVALID";
                execution  = "NONE";
                confidence = "INVALID";
            }
            else
            {
                int g = Math.Abs(gap);
                if (g >= 5)
                {
                    bias      = gap > 0 ? "BUY" : "SELL";
                    execution = g >= 9 ? "MARKET" : "PULLBACK";
                    confidence = g >= 10 ? "HIGH" : g >= 8 ? "MEDIUM" : "LOW";
                }
                else
                {
                    bias       = "INVALID";
                    execution  = "NONE";
                    confidence = "INVALID";
                }
            }

            // ===== WRITE BACK TO PANDA FILE =====
            try
            {
                string newContent =
                    "GAP SCORE : " + gap       + "\n" +
                    "BIAS : "      + bias       + "\n" +
                    "EXECUTION : " + execution  + "\n" +
                    "CONFIDENCE : "+ confidence + "\n";

                File.WriteAllText(pandaFile, newContent);
            }
            catch {}

            // ===== PANEL COLOR =====
            Color biasColor = Color.Gray;
            if (bias == "BUY")        biasColor = Color.LimeGreen;
            else if (bias == "SELL")  biasColor = Color.Red;
            else if (bias == "HARD_INVALID") biasColor = Color.Orange;

            // ===== DRAW PANEL =====
            string baseAbs  = "BASE ABS : "  + baseVal;
            string quoteAbs = "QUOTE ABS : " + quoteVal;
            string gapLine  = "GAP SCORE : " + gap;

            string panel =
                "🐼 PANDA PRO PANEL\n\n" +
                baseLine   + "\n" +
                quoteLine  + "\n\n" +
                advBase    + "\n" +
                advQuote   + "\n\n" +
                atrLine    + "\n" +
                spreadLine + "\n\n" +
                baseAbs    + "\n" +
                quoteAbs   + "\n\n" +
                gapLine           + "\n" +
                "BIAS : "       + bias       + "\n" +
                "EXECUTION : "  + execution  + "\n" +
                "CONFIDENCE : " + confidence;

            Chart.DrawStaticText(
                "panda_panel",
                panel,
                VerticalAlignment.Top,
                HorizontalAlignment.Right,
                biasColor);

            DrawBoxes(mt4Lines);
        }

        private string NormalizeSymbol(string s)
        {
            return Regex.Replace(s, @"[^A-Z]", "");
        }

        private void DrawBoxes(string[] lines)
        {
            var boxLines = lines.Where(x => x.StartsWith("BOX|")).ToList();

            foreach (var box in boxLines)
            {
                var parts = box.Split('|');
                if (parts.Length < 6) continue;

                string name = parts[1];
                if (drawnBoxes.Contains(name)) continue;

                DateTime t1 = DateTimeOffset
                    .FromUnixTimeSeconds(long.Parse(parts[2])).DateTime;
                double price1 = double.Parse(parts[3]);

                DateTime t2 = DateTimeOffset
                    .FromUnixTimeSeconds(long.Parse(parts[4])).DateTime;
                double price2 = double.Parse(parts[5]);

                var rect = Chart.DrawRectangle(
                    name, t1, price1, t2, price2,
                    Color.FromArgb(60, 0, 255, 0));

                rect.IsFilled      = true;
                rect.IsInteractive = false;

                drawnBoxes.Add(name);
            }
        }
    }
}