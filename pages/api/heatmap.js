import { supabase } from '../../lib/supabase';
import { validateSession } from '../../lib/auth';

export default async function handler(req, res) {
  const token = req.cookies?.panda_session;
  const session = await validateSession(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // Get last 32 strength readings per symbol (8h)
    const { data } = await supabase
      .from('strength_log')
      .select('symbol, strength, timestamp')
      .order('timestamp', { ascending: false })
      .limit(700); // 21 pairs x ~33 readings

    if (!data || data.length === 0) return res.status(200).json({});

    const SYMBOLS = ['AUDJPY','AUDCAD','AUDNZD','AUDUSD','CADJPY','EURAUD','EURCAD','EURGBP','EURJPY','EURNZD','EURUSD','GBPAUD','GBPCAD','GBPJPY','GBPNZD','GBPUSD','NZDCAD','NZDJPY','NZDUSD','USDCAD','USDJPY'];

    const result = {};

    for (const symbol of SYMBOLS) {
      const readings = data
        .filter(r => r.symbol === symbol)
        .slice(0, 33)
        .map(r => parseFloat(r.strength) || 0);

      if (readings.length === 0) {
        result[symbol] = { h1: null, h4: null, h8: null, current: null };
        continue;
      }

      const current = readings[0] || 0;
      const ago1h   = readings[3]  || readings[readings.length - 1] || 0;
      const ago4h   = readings[15] || readings[readings.length - 1] || 0;
      const ago8h   = readings[31] || readings[readings.length - 1] || 0;

      result[symbol] = {
        current: parseFloat(current.toFixed(2)),
        h1:  parseFloat((current - ago1h).toFixed(2)),
        h4:  parseFloat((current - ago4h).toFixed(2)),
        h8:  parseFloat((current - ago8h).toFixed(2)),
      };
    }

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
