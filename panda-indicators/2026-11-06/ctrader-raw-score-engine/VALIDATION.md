# Validation — November 6, 2026

- Indicator Release build: 0 warnings, 0 errors. AlgoPublish=false; no installed indicator overwritten.
- 46 targeted feed/auth/device tests passed.
- Next.js production build passed. check_dupes.py passed.
- Broad Node suite: 242 passed, 7 failed. Unchanged HEAD baseline: 240 passed, the identical 7 failed. Two added tests pass.

Existing failures:
- tests/advForecastScore.test.mjs
- telemetry failure never blocks the allowlisted download
- license admin exposes download telemetry and recoverable active-token controls
- publishes exactly the three Licensed overlay products
- never exposes Personal artifacts through the public catalog
- public overlay catalog keeps all three fixed products and merges live pricing
- active application surfaces no longer advertise Guardian or Hermes

The new feed fields are prepared for publication; deployment status is tracked in the release chat. Authenticated live-feed and visual cTrader checks were not performed. Existing Operator Token is required; no secret is embedded in the package.

Package SHA-256: 657a879b1872ae9aa0efcaa8b55bf3ae52feffa2c57c0b057c039e5da9b7b4cb
