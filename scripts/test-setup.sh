#!/usr/bin/env bash
# Offline database verification for VYBR8.
# Spins up a throwaway Postgres, installs a minimal Supabase auth shim,
# applies every migration + seed, then runs the SQL security tests.
#
# Usage: npm run test:db        (needs Postgres 15+ binaries on PATH or in /usr/lib/postgresql/*/bin)
# With the Supabase CLI running instead, prefer: supabase db reset && psql "$SUPABASE_DB_URL" -f supabase/tests/...
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)}"
[ -n "$PGBIN" ] && export PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "Postgres binaries not found. Set PGBIN." >&2; exit 1; }

WORK="$(mktemp -d)"
PORT="${PGPORT_TEST:-55432}"
RUN_AS=()
if [ "$(id -u)" = "0" ]; then
  chown postgres "$WORK"
  RUN_AS=(runuser -u postgres --)
fi

cleanup() { "${RUN_AS[@]}" pg_ctl -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

"${RUN_AS[@]}" initdb -D "$WORK/data" -U postgres --auth=trust >/dev/null
"${RUN_AS[@]}" pg_ctl -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/log" start >/dev/null

PSQL=(psql -h "$WORK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)

echo "▸ Supabase shim"
"${PSQL[@]}" -f "$ROOT/scripts/supabase-shim.sql"

for f in "$ROOT"/supabase/setup/1_setup_database.sql; do
  echo "▸ setup file (one transaction, like the SQL Editor)"
  "${PSQL[@]}" -1 -f "$f"
done

echo "▸ seed"
"${PSQL[@]}" -f "$ROOT/supabase/setup/2_demo_places.sql"

echo "▸ RLS coverage"
"${PSQL[@]}" -At -c "select string_agg(relname, ', ') from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity" | {
  read -r missing || true
  if [ -n "$missing" ]; then echo "✗ tables without RLS: $missing" >&2; exit 1; fi
  echo "  every public table has RLS enabled"
}

echo "✓ setup files apply cleanly"
