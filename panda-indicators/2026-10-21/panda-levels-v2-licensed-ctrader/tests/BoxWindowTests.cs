using System;
using cAlgo;
internal static class BoxWindowTests
{
    static DateTime D(int y, int m, int d, int h = 0) => new DateTime(y,m,d,h,0,0);
    static void Window(DateTime now, int offset, int kind, DateTime start, DateTime end)
    {
        var w = PandaBoxMath.GetWindow(now, offset, kind);
        if (w.Start != start || w.End != end)
            throw new Exception($"Window mismatch {now}: got {w.Start} - {w.End}, expected {start} - {end}");
    }
    internal static void Run()
    {
        // MT4 H1: trading-day boundaries, NOT the last three candle-bearing dates.
        Window(D(2026,10,19),0,2,D(2026,10,14),D(2026,10,16));
        Window(D(2026,10,20),0,2,D(2026,10,15),D(2026,10,19));
        Window(D(2026,10,21),0,2,D(2026,10,16),D(2026,10,20));
        Window(D(2026,10,22),0,2,D(2026,10,19),D(2026,10,21));
        Window(D(2026,10,23),0,2,D(2026,10,20),D(2026,10,22));
        Window(D(2026,10,24),0,2,D(2026,10,20),D(2026,10,22));
        Window(D(2026,10,25),0,2,D(2026,10,20),D(2026,10,22));
        // Offset must be applied BEFORE choosing broker day/week/month boundaries.
        Window(D(2026,10,20,22),3,2,D(2026,10,15,21),D(2026,10,19,21));
        Window(D(2026,10,21),0,1,D(2026,9,28),D(2026,10,12));
        Window(D(2026,10,21),0,0,D(2026,7,1),D(2026,9,1));
        Window(D(2026,1,1),0,0,D(2025,10,1),D(2025,12,1));
        Window(D(2024,3,1),0,0,D(2023,12,1),D(2024,2,1));
        // Simulate H1 bars: exclude before/start-end rules, include Sunday within the window,
        // and ignore invalid zero-price bars exactly as MT4 CalculateBoxBounds does.
        var times = new[] { D(2026,10,15,23),D(2026,10,16),D(2026,10,18,22),D(2026,10,19),D(2026,10,19,1),D(2026,10,20) };
        var highs = new[] { 999.0,110.0,150.0,120.0,1000.0,999.0 };
        var lows = new[] { 1.0,90.0,80.0,85.0,0.0,1.0 };
        double high,low;
        var w = PandaBoxMath.GetWindow(D(2026,10,21),0,2);
        if (!PandaBoxMath.TryRange(times.Length,i=>times[i],i=>highs[i],i=>lows[i],w,out high,out low) || high != 150 || low != 80)
            throw new Exception("MT4 range mismatch: boundaries, Sunday candles, or invalid prices");
        if (PandaBoxMath.TryRange(0,i=>DateTime.MinValue,i=>0,i=>0,w,out high,out low))
            throw new Exception("Empty history must not produce a box");
        Console.WriteLine("PASS: 12 MT4 calendar windows plus H1 range and empty-history cases.");
    }
}
