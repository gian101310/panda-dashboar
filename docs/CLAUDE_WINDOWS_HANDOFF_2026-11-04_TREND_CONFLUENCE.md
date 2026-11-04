# Panda Trend Confluence v1 handoff - 2026-11-04

- Name accepted by Boss-G: Panda Trend Confluence v1.
- Admin License page now lists cTrader and MT5 downloads and separate product codes. Create an account-specific license, approve payment/status, then click **ISSUE / ROTATE TOKEN**. The clear token is shown once; only SHA-256 is stored. Rotation invalidates the previous token. Disabling or expiring the license blocks it.
- The new `/api/trend-confluence-feed` requires matching platform, account number, approved paid license, and issued token. It has no global operator-token path. The cTrader package sends the current cTrader account; the MT5 feed bridge uses the current MT5 account.
- cTrader release source: `panda-confluence-prototype/ctrader/PandaTrendConfluence.V1.cs`; download: `public/downloads/panda-trend-confluence-v1-ctrader.algo`. It is a named V5-derived read-only indicator with market/pullback checks, chart drawings, and no orders.
- MT5 source: `panda-confluence-prototype/mt5/PandaTrendConfluenceV1.mq5` indicator plus `PandaTrendConfluenceFeedV1.mq5` read-only feed bridge EA. MT5 indicators cannot make WebRequest calls. ZIP: `public/downloads/panda-trend-confluence-v1-mt5.zip`. The MT5 panel implements the core Panda, H1/M15 trend, ADX, structure, market, and pullback gates. It does not yet have cTrader's FVG/swing/risk-plan drawings; `INSTALL-MT5.txt` discloses this.
- `supabase/trend_confluence_license_tokens.sql` was applied to project `jxkelchxitwuilpbrwxk` on 2026-11-04.
- Build evidence: cTrader .NET release 0 warnings/errors; both MetaEditor64 compilations 0 warnings/errors; `node --test` 43 pass, `py -3.11 check_dupes.py` pass, `npx next build` pass.
- Live cTrader/MT5 chart attachment with an issued customer token remains to be checked. No production customer token was generated during release work.
