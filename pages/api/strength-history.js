import { supabase } from '../../lib/supabase';
import { validateSession } from '../../lib/auth';

export default async function handler(req, res) {
  const token = req.cookies?.panda_session;
  const session = await validateSession(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // Get last 32 entries per symbol = 8 hours of 15min data
    const { data, error } = await supabase
      .from('strength_log')
      .select('symbol, strength, timestamp')
      .order('timestamp', { ascending: false })
      .limit(1000);

    if (error) return res.status(500).json({ error: error.message });

    // Group by symbol, keep last 32 entries (8 hours)
    const grouped = {};
    for (const row of (data || [])) {
      if (!grouped[row.symbol]) grouped[row.symbol] = [];
      if (grouped[row.symbol].length < 32) grouped[row.symbol].push(row);
    }

    const trends = {};

    for (const [symbol, rows] of Object.entries(grouped)) {
      // rows[0] = most recent, rows[N] = oldest
      const vals = rows.map(r => parseFloat(r.strength) || 0);

      const latest    = vals[0]  ?? 0;
      const prev1h    = vals[Math.min(3,  vals.length - 1)] ?? latest; // 1h ago  (4 readings)
      const prev4h    = vals[Math.min(15, vals.length - 1)] ?? latest; // 4h ago (16 readings)
      const prev8h    = vals[Math.min(31, vals.length - 1)] ?? latest; // 8h ago (32 readings)

      // Deltas
      const delta1h = parseFloat((latest - prev1h).toFixed(2));
      const delta4h = parseFloat((latest - prev4h).toFixed(2));
      const delta8h = parseFloat((latest - prev8h).toFixed(2));

      // Velocity: is momentum accelerating or decelerating?
      // Compare recent 1h move vs previous 1h move
      const mid1h = vals[Math.min(1, vals.length - 1)] ?? latest; // 15min ago
      const prev2h = vals[Math.min(7, vals.length - 1)] ?? latest; // 2h ago
      const recentVelocity = latest - mid1h;   // last 15min change
      const olderVelocity  = mid1h - prev2h;   // 15min change from 2h ago

      let velocityTag = 'STABLE';
      if (recentVelocity > olderVelocity + 0.2) velocityTag = 'ACCELERATING';
      else if (recentVelocity < olderVelocity - 0.2) velocityTag = 'DECELERATING';

      // Short trend (1h)
      let trend1h = 'STABLE';
      if (delta1h >= 0.5) trend1h = 'STRONGER';
      else if (delta1h <= -0.5) trend1h = 'WEAKER';

      // Medium trend (4h)
      let trend4h = 'STABLE';
      if (delta4h >= 1.0) trend4h = 'STRONGER';
      else if (delta4h <= -1.0) trend4h = 'WEAKER';

      // Long trend (8h)
      let trend8h = 'STABLE';
      if (delta8h >= 1.5) trend8h = 'STRONGER';
      else if (delta8h <= -1.5) trend8h = 'WEAKER';

      // ===== OVERALL MOMENTUM SIGNAL =====
      // Use momentum from Supabase dashboard if available (set by engine v2.1)
      // Otherwise derive from strength history trends
      const peakVal = Math.max(...vals);
      const dropFromPeak = peakVal - latest;

      let momentum = 'NEUTRAL';
      let momentumColor = '#445566';

      // Derive from strength trends (strength-history based)
      if (trend1h === 'STRONGER' && trend4h === 'STRONGER' && trend8h === 'STRONGER') {
        momentum = 'STRONG';
        momentumColor = '#00ff9f';
      } else if (trend1h === 'STRONGER' && trend4h === 'STRONGER') {
        momentum = 'BUILDING';
        momentumColor = '#66ffcc';
      } else if (trend1h === 'STRONGER' && trend4h === 'STABLE') {
        momentum = 'SPARK';
        momentumColor = '#ffd166';
      } else if (trend1h === 'WEAKER' && trend4h === 'STABLE' && latest >= 3) {
        // Short dip but mid still ok and strength high = CONSOLIDATING
        momentum = 'CONSOLIDATING';
        momentumColor = '#00b4ff';
      } else if (trend1h === 'WEAKER' && trend4h === 'WEAKER' && trend8h === 'STRONGER') {
        momentum = 'COOLING';
        momentumColor = '#ffaa44';
      } else if (trend1h === 'WEAKER' && trend4h === 'WEAKER' && dropFromPeak >= 2) {
        momentum = 'FADING';
        momentumColor = '#ff7744';
      } else if (trend1h === 'WEAKER' && trend4h === 'WEAKER' && trend8h === 'WEAKER') {
        momentum = 'REVERSING';
        momentumColor = '#ff4d6d';
      } else if (trend1h === 'STRONGER') {
        momentum = 'SPARK';
        momentumColor = '#ffd166';
      }

      // ===== SMART CLOSE ALERT =====
      // Only fire on FADING or REVERSING — NOT on normal consolidation/cooling
      const closeAlert = momentum === 'FADING' || momentum === 'REVERSING';

      trends[symbol] = {
        latest,
        delta1h,
        delta4h,
        delta8h,
        trend1h,
        trend4h,
        trend8h,
        velocity: velocityTag,
        momentum,
        momentumColor,
        closeAlert,
        dropFromPeak: parseFloat(dropFromPeak.toFixed(2)),
        peakVal: parseFloat(peakVal.toFixed(2)),
        // Last 16 readings for sparkline (4h)
        history: vals.slice(0, 16).reverse(),
      };
    }

    return res.status(200).json(trends);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}