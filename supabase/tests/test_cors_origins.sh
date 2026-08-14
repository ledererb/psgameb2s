#!/usr/bin/env bash
# CORS-allowlist smoke: az allowlistelt origint reflecteli, mást nem.
# Használat: BASE="$SUPABASE_URL/functions/v1" bash supabase/tests/test_cors_origins.sh [function ...]
set -uo pipefail

BASE="${BASE:-${SUPABASE_URL:-}/functions/v1}"
FNS=("$@")
if [ ${#FNS[@]} -eq 0 ]; then
  FNS=(register submit-score update-affiliation delete-my-data)
fi

fail=0
check() {
  local fn="$1" origin="$2" expect="$3"
  local got
  got=$(curl -s -o /dev/null -D - -X OPTIONS "$BASE/$fn" -H "Origin: $origin" \
    | tr -d '\r' | awk 'tolower($1)=="access-control-allow-origin:"{print $2}')
  if [ "$got" = "$expect" ]; then
    echo "PASS  $fn  $origin -> $got"
  else
    echo "FAIL  $fn  $origin -> got '$got', want '$expect'"
    fail=1
  fi
}

for fn in "${FNS[@]}"; do
  check "$fn" "https://hello.peksnack.hu"      "https://hello.peksnack.hu"
  check "$fn" "https://snackydash.vercel.app"  "https://snackydash.vercel.app"
  # Ismeretlen originre a lista első elemét kapja vissza (a böngésző blokkol):
  check "$fn" "https://evil.example"           "https://snackydash.vercel.app"
done

exit $fail
