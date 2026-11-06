# Validation — November 6, 2026

- Indicator Release build: 0 warnings, 0 errors. AlgoPublish=false; no installed indicator overwritten.
- 57 targeted account-token/feed/auth/device tests passed, including live route logic with injected database responses.
- Next.js production build passed. check_dupes.py passed.
- Broad Node suite before the last added route case: 248 passed, 7 failed. Unchanged HEAD baseline: 240 passed, the identical 7 failed. All added tests pass.

Existing failures:
- tests/advForecastScore.test.mjs
- telemetry failure never blocks the allowlisted download
- license admin exposes download telemetry and recoverable active-token controls
- publishes exactly the three Licensed overlay products
- never exposes Personal artifacts through the public catalog
- public overlay catalog keeps all three fixed products and merges live pricing
- active application surfaces no longer advertise Guardian or Hermes

The new feed fields are prepared for publication; deployment status is tracked in the release chat. Authenticated live-feed and visual cTrader checks were not performed. License Token plus the approved registered trading account is required; no secret is embedded in the package.

Package SHA-256: e75baaeb3f1a2b9f897adda53bba4cb4d6c48139653df29fdead55604ac4f26f

Account token product constraint migration applied and verified; existing row-level security remains enabled. The package reads Account.Number, clears on Account.Switched and ignores prior account responses. Visual account switching remains untested.
