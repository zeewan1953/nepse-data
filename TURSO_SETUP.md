# Turso (remote libsql) setup — shared DB for Vercel + GitHub Actions

Goal: move the app's SQLite DB from a local file (`data/darisir.db`) to a **remote
Turso libsql DB** so that BOTH the Vercel app and GitHub Actions write to the
same database — enabling true daily auto-update of broker + stock-wise data.

The app code already supports this: `src/lib/db.ts` uses Turso when
`TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` are set, else falls back to the local file.

---

## 1. Create a Turso DB (one time, free tier)

```bash
# Install CLI (Windows: use the scoop/powershell installer from turso.tech)
curl -sSfL https://get.tur.so/install.sh | bash      # macOS/Linux
turso auth signup                                     # or: turso auth login

turso db create darisir                               # create the DB
turso db show darisir --url                           # -> libsql://darisir-<org>.turso.io
turso db tokens create darisir                        # -> auth token (long string)
```

## 2. Import existing data (one time)

The current data lives in `data/darisir.db`. Push it to Turso:

```bash
# Dump local SQLite to SQL, then load into Turso
turso db shell darisir < dump.sql
# (create dump.sql first: sqlite3 data/darisir.db .dump > dump.sql)
```

If `sqlite3` isn't installed, the app will also auto-create tables on first boot
(`migrateSchema()` in db.ts runs the CREATE TABLE statements). Existing 3 days of
broker data + Jun 23 floorsheet are in the local file — import via the dump above
to keep them, or let cron re-collect going forward.

## 3. Set env vars

### Vercel (Project → Settings → Environment Variables)
```
TURSO_DATABASE_URL = libsql://darisir-<org>.turso.io
TURSO_AUTH_TOKEN   = <token from step 1>
```
Redeploy after adding.

### GitHub Actions (Repo → Settings → Secrets and variables → Actions)
```
TURSO_DATABASE_URL = libsql://darisir-<org>.turso.io
TURSO_AUTH_TOKEN   = <token>
```

### Local dev (optional — `.env.local`)
Leave unset to keep using the local file, OR set both to develop against Turso.

---

## 4. After this works

- Vercel cron (`/api/cron/collect`, 3:03 PM NPT) writes broker-wise data to Turso.
- A GitHub Actions job can write floorsheet/stock-wise data to the SAME Turso DB
  (once a working floorsheet source is confirmed — see note below).
- The app reads everything from Turso → live site auto-updates daily.

### ⚠️ Open issue: floorsheet (stock-wise) source
NEPSE's official floorsheet API returns 0 rows from both local PC and Vercel.
The Python scraper in `nepse-pipeline/` targets nepsealpha.com but its selectors
are unverified (`TODO: VERIFY SELECTOR`). Before GitHub Actions can fill
stock-wise data, that scraper must be finished + verified against the live site.
Broker-wise (MeroLagani) already works on Vercel and needs only the Turso move.
