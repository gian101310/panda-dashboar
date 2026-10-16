// Market-context calculations reused from the existing personal XTF/BOS indicator.
// No original indicator or engine scoring implementation is modified.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using cAlgo.API;
using cAlgo.API.Internals;
using PandaPlanning;
namespace cAlgo
{
    public partial class PandaTradePlan
    {
        private const int PandaGapThreshold=5, PandaSignificant=4;
        private const int SuperTrendPeriod=10, FollowBbPeriod=21, FollowAtrPeriod=5;
        private const double SuperTrendFactor=3.0, FollowBbDeviation=1.0;
        private const bool SuperTrendUseAtr=true, FollowUseAtr=true;
        private sealed class ContextSeries
        {
            private readonly List<double> _data=new List<double>();
            public double this[int index]
            {
                get {return index>=0&&index<_data.Count?_data[index]:double.NaN;}
                set {while(_data.Count<=index)_data.Add(double.NaN);_data[index]=value;}
            }
        }
        private void ResetContextSeries()
        {
            _tr=new ContextSeries();_atr=new ContextSeries();_upBand=new ContextSeries();_lowBand=new ContextSeries();
            _stTrend=new ContextSeries();_st=new ContextSeries();_bbUpper=new ContextSeries();_bbLower=new ContextSeries();
            _followAtr=new ContextSeries();_follow=new ContextSeries();_followTrend=new ContextSeries();
        }
        private Bars _contextBars;
        private int _loadSlot, _contextCount;
        private DateTime _contextFirst;
        private void InitializeContext()
        {
            _tr=new ContextSeries();_atr=new ContextSeries();_upBand=new ContextSeries();_lowBand=new ContextSeries();
            _stTrend=new ContextSeries();_st=new ContextSeries();_bbUpper=new ContextSeries();_bbLower=new ContextSeries();
            _followAtr=new ContextSeries();_follow=new ContextSeries();_followTrend=new ContextSeries();
            _contextBars=MarketData.GetBars(TimeFrame.Hour,SymbolName);
            _dailyLevels=MarketData.GetBars(TimeFrame.Daily);
            _weeklyLevels=MarketData.GetBars(TimeFrame.Weekly);
            _monthlyLevels=MarketData.GetBars(TimeFrame.Monthly);
            _chartPair=CanonicalPair(SymbolName);
            _baseIndex=_chartPair==""?-1:CurrencyIndex(_chartPair.Substring(0,3));
            _quoteIndex=_chartPair==""?-1:CurrencyIndex(_chartPair.Substring(3,3));
            foreach(var pair in PandaPairs)
            {
                var slot=new PairSlot {Pair=pair};
                var name=ResolveSymbolName(pair);
                try {if(name!=null)slot.Bars=MarketData.GetBars(TimeFrame.Hour,name);else slot.Missing=true;}
                catch {slot.Missing=true;}
                _slots.Add(slot);if(pair==_chartPair)_activeSlot=slot;
            }
        }
        private void RefreshContext()
        {
            foreach(var slot in _slots)
            {
                if(slot.Bars==null||slot.Bars.Count==0)continue;
                if(slot.LastCount!=slot.Bars.Count||slot.LastBarTime!=slot.Bars.LastBar.OpenTime)
                {
                    slot.LastCount=slot.Bars.Count;slot.LastBarTime=slot.Bars.LastBar.OpenTime;
                    slot.Ready=ApplySnapshot(slot);
                }
            }
            // Load at most one missing history block per tick to keep the chart responsive.
            for(int k=0;k<_slots.Count;k++)
            {
                var slot=_slots[_loadSlot++ % _slots.Count];
                if(slot.Bars==null||slot.Ready||slot.Missing)continue;
                try {if(slot.Bars.LoadMoreHistory()==0)slot.Missing=true;}catch {slot.Missing=true;}
                break;
            }
            RefreshFeedState();
            if(_contextBars.Count>0)
            {
                bool reset=_contextFirst!=_contextBars.OpenTimes[0];
                if(reset)ResetContextSeries();
                int start=reset?0:Math.Max(0,_contextCount-2);
                for(int i=start;i<_contextBars.Count;i++)ComputeChartBar(i);
                _contextCount=_contextBars.Count;_contextFirst=_contextBars.OpenTimes[0];
            }
        }
        private static readonly string[] PandaPairs =
        {
            "AUDCAD", "AUDJPY", "AUDNZD", "AUDUSD", "CADJPY",
            "EURAUD", "EURCAD", "EURGBP", "EURJPY", "EURNZD", "EURUSD",
            "GBPAUD", "GBPCAD", "GBPJPY", "GBPNZD", "GBPUSD",
            "NZDCAD", "NZDJPY", "NZDUSD", "USDCAD", "USDJPY"
        };

        private static readonly string[] PandaCurrencies = { "AUD", "CAD", "EUR", "GBP", "JPY", "NZD", "USD" };

        private sealed class PeriodRange
        {
            public DateTime Start;
            public double High;
            public double Low;
        }
        private sealed class PairSlot
        {
            public string Pair;
            public Bars Bars;
            public bool Missing;
            public int LastCount = -1;
            public DateTime LastBarTime = DateTime.MinValue;
            public bool Ready;
            public double ShortHigh, ShortLow, MediumHigh, MediumLow, LongHigh, LongLow;
            public DateTime ShortStart, ShortEnd, MediumStart, MediumEnd, LongStart, LongEnd;
        }        private readonly List<PairSlot> _slots = new List<PairSlot>();
        private readonly int[] _scoresH1 = new int[7];
        private readonly int[] _scoresH4 = new int[7];
        private readonly int[] _scoresD1 = new int[7];
        private readonly int[] _positiveH1=new int[7],_negativeH1=new int[7];
        private readonly int[] _positiveH4=new int[7],_negativeH4=new int[7];
        private readonly int[] _positiveD1=new int[7],_negativeD1=new int[7];
        private string _scoreDetails="",_scoreInvalidReason="";
        private PairSlot _activeSlot;
        private string _chartPair = "";
        private int _baseIndex = -1;
        private int _quoteIndex = -1;
        private int _readyPairs;
        private bool _scoreReady;
        private bool _hardInvalid;
        private int _pandaGap;
        private string _pandaBias = "DATA UNAVAILABLE";
        private string _boxH1Trend = "UNKNOWN";
        private string _boxH4Trend = "UNKNOWN";
        private string _baseXtfText = "—";
        private string _quoteXtfText = "—";
        private string _xtfSummaryText = "—";

        private ContextSeries _tr;
        private ContextSeries _atr;
        private ContextSeries _upBand;
        private ContextSeries _lowBand;
        private ContextSeries _stTrend;
        private ContextSeries _st;
        private ContextSeries _bbUpper;
        private ContextSeries _bbLower;
        private ContextSeries _followAtr;
        private ContextSeries _follow;
        private ContextSeries _followTrend;
        private Bars _dailyLevels;
        private Bars _weeklyLevels;
        private Bars _monthlyLevels;

        private static string Compact(string value)
        {
            return new string((value ?? string.Empty).ToUpperInvariant().Where(char.IsLetter).ToArray());
        }
        private static string CanonicalPair(string symbolName)
        {
            var compact = Compact(symbolName);
            var matches = PandaPairs.Where(compact.Contains).ToArray();
            return matches.Length == 1 ? matches[0] : "";
        }
        private string ResolveSymbolName(string pair)
        {
            if (Symbols.Exists(pair)) return pair;
            string exact = null;
            int exactCount = 0;
            string contains = null;
            int containsCount = 0;
            foreach (var name in Symbols)
            {
                var compact = Compact(name);
                if (compact == pair)
                {
                    exact = name;
                    exactCount++;
                }
                else if (compact.Contains(pair))
                {
                    contains = name;
                    containsCount++;
                }
            }
            if (exactCount == 1) return exact;
            if (exactCount == 0 && containsCount == 1) return contains;
            return null;
        }
        private static int CurrencyIndex(string currency)
        {
            return Array.IndexOf(PandaCurrencies, currency);
        }
        private static DateTime DayKey(DateTime time)
        {
            return time.Date;
        }
        private static DateTime WeekKey(DateTime time)
        {
            var date = time.Date;
            return date.AddDays(-(((int)date.DayOfWeek + 6) % 7));
        }
        private static DateTime MonthKey(DateTime time)
        {
            return new DateTime(time.Year, time.Month, 1);
        }
        private static List<PeriodRange> BuildPeriods(Bars bars, Func<DateTime, DateTime> keyOf)
        {
            var periods = new List<PeriodRange>();
            var currentKey = DateTime.MinValue;
            PeriodRange current = null;
            for (int i = 0; i < bars.Count; i++)
            {
                var key = keyOf(bars.OpenTimes[i]);
                if (current == null || key != currentKey)
                {
                    current = new PeriodRange { Start = bars.OpenTimes[i], High = bars.HighPrices[i], Low = bars.LowPrices[i] };
                    periods.Add(current);
                    currentKey = key;
                }
                else
                {
                    current.High = Math.Max(current.High, bars.HighPrices[i]);
                    current.Low = Math.Min(current.Low, bars.LowPrices[i]);
                }
            }
            return periods;
        }
        private static bool ApplySnapshot(PairSlot slot)
        {
            var bars = slot.Bars;
            var days = BuildPeriods(bars, DayKey);
            var weeks = BuildPeriods(bars, WeekKey);
            var months = BuildPeriods(bars, MonthKey);
            if (days.Count < 4 || weeks.Count < 4 || months.Count < 4) return false;

            var d1 = days[days.Count - 2];
            var d2 = days[days.Count - 3];
            var d3 = days[days.Count - 4];
            slot.ShortHigh = Math.Max(d2.High, d3.High);
            slot.ShortLow = Math.Min(d2.Low, d3.Low);
            slot.ShortStart = d3.Start;
            slot.ShortEnd = d1.Start;

            var w1 = weeks[weeks.Count - 2];
            var w2 = weeks[weeks.Count - 3];
            var w3 = weeks[weeks.Count - 4];
            slot.MediumHigh = Math.Max(w2.High, w3.High);
            slot.MediumLow = Math.Min(w2.Low, w3.Low);
            slot.MediumStart = w3.Start;
            slot.MediumEnd = w1.Start;

            var m1 = months[months.Count - 2];
            var m2 = months[months.Count - 3];
            var m3 = months[months.Count - 4];
            slot.LongHigh = Math.Max(m2.High, m3.High);
            slot.LongLow = Math.Min(m2.Low, m3.Low);
            slot.LongStart = m3.Start;
            slot.LongEnd = m1.Start;
            return true;
        }
        private static int Vote(double price, double boxHigh, double boxLow)
        {
            if (double.IsNaN(price) || double.IsNaN(boxHigh) || double.IsNaN(boxLow)) return 0;
            return price > boxHigh ? 1 : price < boxLow ? -1 : 0;
        }
        private static void AddVote(int[] positive,int[] negative,string currency,int vote)
        {
            var index = CurrencyIndex(currency);
            if(index<0)return;
            if(vote>0)positive[index]+=vote;else if(vote<0)negative[index]+=vote;
        }
        private static void AddPairVote(int[] positive,int[] negative,string pair,int vote)
        {
            AddVote(positive,negative,pair.Substring(0,3),vote);
            AddVote(positive,negative,pair.Substring(3,3),-vote);
        }
        private int ScoreCurrency(int index,out bool conflict)
        {
            return Rules.CurrencyScore(new[]{_positiveD1[index],_positiveH4[index],_positiveH1[index]},
                new[]{_negativeD1[index],_negativeH4[index],_negativeH1[index]},out conflict);
        }
        private static string VoteCell(int positive,int negative)
        {
            return positive>0&&negative<0?SignedScore(positive)+"/"+SignedScore(negative):SignedScore(Rules.Dominant(positive,negative));
        }
        private string ScoreDetails(int index,string currency)
        {return currency+" D1 "+VoteCell(_positiveD1[index],_negativeD1[index])+" H4 "+VoteCell(_positiveH4[index],_negativeH4[index])+" H1 "+VoteCell(_positiveH1[index],_negativeH1[index]);}
        private static string BoxTrend(double formerHigh, double formerLow, double latterHigh, double latterLow)
        {
            if (double.IsNaN(formerHigh) || double.IsNaN(formerLow) || double.IsNaN(latterHigh) || double.IsNaN(latterLow)) return "UNKNOWN";
            var latterMidpoint = (latterHigh + latterLow) / 2.0;
            return latterMidpoint >= formerHigh ? "UPTREND" : latterMidpoint <= formerLow ? "DOWNTREND" : "RANGING";
        }
        private static string SignedScore(int value)
        {
            return value > 0 ? "+" + value.ToString(CultureInfo.InvariantCulture) : value.ToString(CultureInfo.InvariantCulture);
        }
        private static string StrongestExtremeLabel(string currency, int d1, int h4, int h1)
        {
            var best = "";
            var bestValue = 0;
            if (Math.Abs(d1) >= PandaSignificant)
            {
                best = "D1 " + SignedScore(d1);
                bestValue = Math.Abs(d1);
            }
            if (Math.Abs(h4) >= PandaSignificant && Math.Abs(h4) > bestValue)
            {
                best = "H4 " + SignedScore(h4);
                bestValue = Math.Abs(h4);
            }
            if (Math.Abs(h1) >= PandaSignificant && Math.Abs(h1) > bestValue)
            {
                best = "H1 " + SignedScore(h1);
            }
            return best == "" ? currency + " NONE" : currency + " " + best;
        }
        private static string CurrencyExtremes(string currency, int d1, int h4, int h1)
        {
            var values = "";
            if (Math.Abs(d1) >= PandaSignificant) values = "D1 " + SignedScore(d1);
            if (Math.Abs(h4) >= PandaSignificant) values = values == "" ? "H4 " + SignedScore(h4) : values + " · H4 " + SignedScore(h4);
            if (Math.Abs(h1) >= PandaSignificant) values = values == "" ? "H1 " + SignedScore(h1) : values + " · H1 " + SignedScore(h1);
            return currency + ": " + (values == "" ? "NONE" : values);
        }
        private void RefreshFeedState()
        {
            Array.Clear(_scoresH1, 0, 7);
            Array.Clear(_scoresH4, 0, 7);
            Array.Clear(_scoresD1, 0, 7);
            foreach(var counts in new[]{_positiveD1,_negativeD1,_positiveH4,_negativeH4,_positiveH1,_negativeH1})Array.Clear(counts,0,7);
            _readyPairs = 0;
            foreach (var slot in _slots)
            {
                if (!slot.Ready || slot.Bars == null || slot.Bars.Count == 0) continue;
                _readyPairs++;
                var price = slot.Bars.LastBar.Close;
                AddPairVote(_positiveH1,_negativeH1,slot.Pair,Vote(price,slot.ShortHigh,slot.ShortLow));
                AddPairVote(_positiveH4,_negativeH4,slot.Pair,Vote(price,slot.MediumHigh,slot.MediumLow));
                AddPairVote(_positiveD1,_negativeD1,slot.Pair,Vote(price,slot.LongHigh,slot.LongLow));
            }
            for(int i=0;i<7;i++)
            {
                _scoresD1[i]=Rules.Dominant(_positiveD1[i],_negativeD1[i]);
                _scoresH4[i]=Rules.Dominant(_positiveH4[i],_negativeH4[i]);
                _scoresH1[i]=Rules.Dominant(_positiveH1[i],_negativeH1[i]);
            }

            var supported = _chartPair != "";
            _scoreReady = supported && _readyPairs == PandaPairs.Length && _activeSlot != null && _activeSlot.Ready;
            if (!_scoreReady)
            {
                _hardInvalid = false;
                _pandaGap = 0;
                _pandaBias = supported ? "DATA UNAVAILABLE" : "UNSUPPORTED SYMBOL";
                _boxH1Trend = "UNKNOWN";
                _boxH4Trend = "UNKNOWN";
                _baseXtfText = "—";
                _quoteXtfText = "—";
                _xtfSummaryText = "—";
                _scoreDetails="";_scoreInvalidReason="";
                return;
            }

            bool baseConflict,quoteConflict;
            var baseStrong=ScoreCurrency(_baseIndex,out baseConflict);
            var quoteStrong=ScoreCurrency(_quoteIndex,out quoteConflict);
            _scoreDetails=ScoreDetails(_baseIndex,_chartPair.Substring(0,3))+"\n"+ScoreDetails(_quoteIndex,_chartPair.Substring(3,3));
            _scoreInvalidReason=Rules.InvalidationReason(_chartPair.Substring(0,3),_chartPair.Substring(3,3),baseConflict,quoteConflict,baseStrong,quoteStrong);
            var neutralMatchup = Math.Abs(baseStrong) < PandaSignificant && Math.Abs(quoteStrong) < PandaSignificant;
            _hardInvalid = baseConflict || quoteConflict || neutralMatchup;
            _pandaGap = _hardInvalid ? 0 : baseStrong - quoteStrong;
            _pandaBias = _hardInvalid ? "HARD_INVALID" : _pandaGap >= PandaGapThreshold ? "BUY" : _pandaGap <= -PandaGapThreshold ? "SELL" : "WAIT";
            _boxH1Trend = BoxTrend(_activeSlot.MediumHigh, _activeSlot.MediumLow, _activeSlot.ShortHigh, _activeSlot.ShortLow);
            _boxH4Trend = BoxTrend(_activeSlot.LongHigh, _activeSlot.LongLow, _activeSlot.MediumHigh, _activeSlot.MediumLow);
            _baseXtfText = CurrencyExtremes(_chartPair.Substring(0, 3), _scoresD1[_baseIndex], _scoresH4[_baseIndex], _scoresH1[_baseIndex]);
            _quoteXtfText = CurrencyExtremes(_chartPair.Substring(3, 3), _scoresD1[_quoteIndex], _scoresH4[_quoteIndex], _scoresH1[_quoteIndex]);
            _xtfSummaryText = StrongestExtremeLabel(_chartPair.Substring(0, 3), _scoresD1[_baseIndex], _scoresH4[_baseIndex], _scoresH1[_baseIndex])
                + " / " + StrongestExtremeLabel(_chartPair.Substring(3, 3), _scoresD1[_quoteIndex], _scoresH4[_quoteIndex], _scoresH1[_quoteIndex]);
        }
        private double SimpleTrueRangeAverage(int index, int period)
        {
            if (index < period - 1) return double.NaN;
            double sum = 0;
            for (int offset = 0; offset < period; offset++)
            {
                var i = index - offset;
                if (i < 1) break;
                sum += _tr[i];
            }
            return sum / period;
        }
        private string PandaLineStatusAt(int i)
        {
            if (_chartPair == "" || double.IsNaN(_st[i]) || double.IsNaN(_follow[i])) return "UNKNOWN";
            var closeValue = _contextBars.ClosePrices[i];
            if (closeValue > Math.Max(_st[i], _follow[i])) return "ABOVE";
            if (closeValue < Math.Min(_st[i], _follow[i])) return "BELOW";
            return "BETWEEN";
        }
        private void ComputeChartBar(int i)
        {
            var high = _contextBars.HighPrices[i];
            var low = _contextBars.LowPrices[i];
            var closeValue = _contextBars.ClosePrices[i];
            var previousClose = i > 0 ? _contextBars.ClosePrices[i - 1] : closeValue;

            _tr[i] = i == 0 ? high - low : Math.Max(high - low, Math.Max(Math.Abs(high - previousClose), Math.Abs(low - previousClose)));

            if (i == SuperTrendPeriod - 1)
            {
                double sum = 0;
                for (int k = 0; k <= i; k++) sum += _tr[k];
                _atr[i] = sum / SuperTrendPeriod;
            }
            else if (i >= SuperTrendPeriod)
            {
                double sum = 0;
                for (int k = i - SuperTrendPeriod + 1; k <= i; k++) sum += _tr[k];
                _atr[i] = sum / SuperTrendPeriod;
            }

            var superTrendAtr = SuperTrendUseAtr ? _atr[i] : SimpleTrueRangeAverage(i, SuperTrendPeriod);
            if (!double.IsNaN(superTrendAtr))
            {
                var mid = (high + low) / 2.0;
                var basicLower = mid - SuperTrendFactor * superTrendAtr;
                var basicUpper = mid + SuperTrendFactor * superTrendAtr;
                var previousLower = i > 0 && !double.IsNaN(_lowBand[i - 1]) ? _lowBand[i - 1] : basicLower;
                var previousUpper = i > 0 && !double.IsNaN(_upBand[i - 1]) ? _upBand[i - 1] : basicUpper;
                var currentLower = previousClose > previousLower ? Math.Max(basicLower, previousLower) : basicLower;
                var currentUpper = previousClose < previousUpper ? Math.Min(basicUpper, previousUpper) : basicUpper;
                _lowBand[i] = currentLower;
                _upBand[i] = currentUpper;
                var previousTrend = i > 0 && !double.IsNaN(_stTrend[i - 1]) ? _stTrend[i - 1] : 1.0;
                var trend = previousTrend;
                if (previousTrend == -1.0 && previousClose > previousUpper) trend = 1.0;
                else if (previousTrend == 1.0 && previousClose < previousLower) trend = -1.0;
                _stTrend[i] = trend;
                _st[i] = trend == 1.0 ? currentLower : currentUpper;
            }

            if (i >= FollowBbPeriod - 1)
            {
                double sum = 0;
                for (int k = i - FollowBbPeriod + 1; k <= i; k++) sum += _contextBars.ClosePrices[k];
                var mean = sum / FollowBbPeriod;
                double variance = 0;
                for (int k = i - FollowBbPeriod + 1; k <= i; k++)
                {
                    var deviation = _contextBars.ClosePrices[k] - mean;
                    variance += deviation * deviation;
                }
                var stdev = Math.Sqrt(variance / FollowBbPeriod) * FollowBbDeviation;
                _bbUpper[i] = mean + stdev;
                _bbLower[i] = mean - stdev;
            }

            if (i >= FollowAtrPeriod - 1)
            {
                double sum = 0;
                for (int k = i - FollowAtrPeriod + 1; k <= i; k++) sum += _tr[k];
                _followAtr[i] = sum / FollowAtrPeriod;
            }

            var previousFollow = i > 0 && !double.IsNaN(_follow[i - 1]) ? _follow[i - 1] : closeValue;
            var bbSignal = 0;
            if (i > 0 && !double.IsNaN(_bbUpper[i - 1])) bbSignal = previousClose > _bbUpper[i - 1] ? 1 : previousClose < _bbLower[i - 1] ? -1 : 0;
            if (bbSignal == 1) _follow[i] = Math.Max(FollowUseAtr && !double.IsNaN(_followAtr[i]) ? low - _followAtr[i] : low, previousFollow);
            else if (bbSignal == -1) _follow[i] = Math.Min(FollowUseAtr && !double.IsNaN(_followAtr[i]) ? high + _followAtr[i] : high, previousFollow);
            else _follow[i] = previousFollow;

            var previousFollowTrend = i > 0 && !double.IsNaN(_followTrend[i - 1]) ? _followTrend[i - 1] : 0.0;
            var followTrend = previousFollowTrend;
            if (_follow[i] > previousFollow) followTrend = 1.0;
            else if (_follow[i] < previousFollow) followTrend = -1.0;
            _followTrend[i] = followTrend;

        }
    }
}
