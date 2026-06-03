# HERMES AGENT — DB HANDOFF

> **Created:** 2026-05-28 by Claude (Cowork) on behalf of Boss-G
> **Purpose:** Everything Hermes needs to connect and operate. Read this ENTIRE file.

---

## 1. WHAT WAS COMPLETED (by Claude)

All database setup is done. Here's exactly what was created:

### Role: `hermes_ro`
- Login-enabled PostgreSQL role with least-privilege access
- Can CONNECT to the `postgres` database
- Has USAGE on the `public` schema
- Has EXECUTE on 4 helper functions (listed below)
- Has **NO direct table access** — all data goes through SECURITY DEFINER functions

### 4 Helper Functions (all `SECURITY DEFINER`, owned by `postgres`)

| Function | Purpose | Returns |
|----------|---------|---------|
| `get_engine_heartbeat()` | Read last 100 engine heartbeats | TABLE (see schema below) |
| `get_ea_executions()` | Read last 200 EA trade executions | TABLE (see schema below) |
| `get_hermes_learnings()` | Read all Hermes learnings | TABLE (see schema below) |
| `insert_hermes_learning(...)` | Write a new learning record | void |

### Row-Level Security
- RLS enabled on `engine_heartbeat`, `ea_executions`, `hermes_learnings`
- Policy: `service_role_full_access` grants full CRUD to service_role only
- Direct table access revoked from `public` role on all 3 tables

---

## 2. WHAT BOSS-G NEEDS TO DO MANUALLY

### Step 1: Get the connection string

The `hermes_ro` role was created with password: `HrmsPanda2026!xKq9vLmR3z`

Your connection string is:
```
postgres://hermes_ro:HrmsPanda2026!xKq9vLmR3z@db.jxkelchxitwuilpbrwxk.supabase.co:5432/postgres
```

### Step 2: Store in Hermes secrets

Wherever Hermes stores its environment variables / secrets, add:
```
SUPABASE_DB_URL=postgres://hermes_ro:HrmsPanda2026!xKq9vLmR3z@db.jxkelchxitwuilpbrwxk.supabase.co:5432/postgres
```

### Step 3: Verify connectivity

Have Hermes run a test query:
```sql
SELECT * FROM get_engine_heartbeat() LIMIT 1;
```

If it returns a row, everything is working. If it errors, check:
- Password is exact (case-sensitive)
- Host is `db.jxkelchxitwuilpbrwxk.supabase.co` (port 5432)
- Database is `postgres`

---

## 3. ACTUAL TABLE SCHEMAS — VERIFIED FROM LIVE DB

> **HARD RULE: Hermes must NEVER guess, assume, or fabricate column names.**
> These schemas were queried directly from the production database on 2026-05-28.
> If a column is not listed here, it does not exist. Period.

### `engine_heartbeat`

| Column | Type | Nullable |
|--------|------|----------|
| id | integer | NO |
| cycle_type | text | YES |
| pairs_processed | integer | YES |
| signals_pushed | integer | YES |
| errors | ARRAY | YES |
| duration_sec | numeric | YES |
| created_at | timestamptz | YES |

**Access via:** `SELECT * FROM get_engine_heartbeat();`
Returns the 100 most recent rows ordered by `created_at DESC`.

### `ea_executions`

| Column | Type | Nullable |
|--------|------|----------|
| id | uuid | NO |
| ticket | text | YES |
| symbol | text | YES |
| strategy | text | YES |
| magic | bigint | YES |
| direction | text | YES |
| entry_requested | double precision | YES |
| fill_price | double precision | YES |
| sl | double precision | YES |
| tp | double precision | YES |
| close_price | double precision | YES |
| open_time | timestamptz | YES |
| close_time | timestamptz | YES |
| close_reason | text | YES |
| spread_at_entry | integer | YES |
| slippage_points | integer | YES |
| profit_pips | double precision | YES |
| profit_money | double precision | YES |
| lot_size | double precision | YES |
| engine_version | text | YES |
| created_at | timestamptz | YES |
| signal_write_time | timestamptz | YES |
| ea_read_time | timestamptz | YES |
| signal_to_fill_sec | integer | YES |

**Access via:** `SELECT * FROM get_ea_executions();`
Returns the 200 most recent rows ordered by `created_at DESC`.

### `hermes_learnings`

| Column | Type | Nullable |
|--------|------|----------|
| id | bigint | NO (auto-generated) |
| category | text | YES |
| subject | text | YES |
| finding | text | YES |
| confidence | real | YES |
| sample_size | integer | YES |
| data | jsonb | YES |
| source_tables | text[] | YES |
| status | text | YES (default: 'active') |
| superseded_by | bigint | YES |
| created_at | timestamptz | YES (default: now()) |
| updated_at | timestamptz | YES (default: now()) |

**Read via:** `SELECT * FROM get_hermes_learnings();`
Returns all rows ordered by `created_at DESC`.

**Write via:**
```sql
SELECT insert_hermes_learning(
  _category     := 'pattern',
  _subject      := 'EURUSD gap behavior',
  _finding      := 'Gaps above 7 on EURUSD tend to revert within 2 cycles',
  _confidence   := 0.82,
  _sample_size  := 45,
  _data         := '{"avg_revert_time": "12min"}'::jsonb,
  _source_tables := ARRAY['signal_results', 'gap_history'],
  _status       := 'active'
);
```

---

## 4. WHAT HERMES CANNOT DO

- **No direct table reads** — `SELECT * FROM engine_heartbeat` will fail with permission denied
- **No writes to any table except hermes_learnings** (via the insert function only)
- **No schema modifications** — cannot CREATE, ALTER, or DROP anything
- **No access to other tables** — the 31 other Supabase tables are invisible to hermes_ro

---

## 5. HARD RULES FOR HERMES

1. **NEVER guess column names.** If you think a column exists but it's not in Section 3 above, it doesn't exist. Query `information_schema.columns` if you need to verify, but you do NOT have direct access — ask Boss-G or Claude to check.

2. **NEVER fabricate schemas.** Your earlier proposed columns (p, ts, g, b, ex, m, c) do not exist. The actual schemas are in Section 3. Use ONLY those column names.

3. **Always use the helper functions.** Direct table access is blocked. Use `get_engine_heartbeat()`, `get_ea_executions()`, `get_hermes_learnings()`, and `insert_hermes_learning()`.

4. **If something doesn't work, stop and ask.** Don't try to work around permission errors. Report them to Boss-G.

5. **The password and connection string are secrets.** Never log them, expose them in outputs, or include them in learning records.

---

## 6. QUICK REFERENCE

```
Host:     db.jxkelchxitwuilpbrwxk.supabase.co
Port:     5432
Database: postgres
User:     hermes_ro
Password: (stored in your secrets — see Section 2)

Read heartbeats:  SELECT * FROM get_engine_heartbeat();
Read executions:  SELECT * FROM get_ea_executions();
Read learnings:   SELECT * FROM get_hermes_learnings();
Write learning:   SELECT insert_hermes_learning(_category, _subject, _finding, _confidence, _sample_size, _data, _source_tables, _status);
```
