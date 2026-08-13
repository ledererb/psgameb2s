#!/usr/bin/env bash
# B2S — SQL futtatás a Supabase Management API-n át (SQL Editor helyett).
# Használat: scripts/sb-run-sql.sh <fajl.sql>  VAGY  echo "select 1" | scripts/sb-run-sql.sh -
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .supabase-env; set +a
FILE="${1:?használat: sb-run-sql.sh <fajl.sql|- >}"
if [ "$FILE" = '-' ]; then SQL=$(cat); else SQL=$(cat "$FILE"); fi
PAYLOAD=$(python3 -c 'import json,sys; print(json.dumps({"query": sys.stdin.read()}))' <<< "$SQL")
curl -s -X POST "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d "$PAYLOAD"
echo
