#!/usr/bin/env bash
# Használat: BASE=... PID=<player_id> SECRET=<secret> ./test_submit_score.sh
set -u
BASE="${BASE:?}"; PID="${PID:?}"; SECRET="${SECRET:?}"
pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "✔ $1"; pass=$((pass+1));
  else echo "✘ $1 — várt:$2 kapott:$3"; fail=$((fail+1)); fi; }
post() { curl -s -o "$3" -w '%{http_code}' -X POST "$BASE/submit-score" \
  -H 'Content-Type: application/json' -d "$2"; }

RUN1=$(uuidgen | tr 'A-F' 'a-f')

# 1. Valid beküldés → 200 + rank_individual
C=$(post x "{\"player_id\":\"$PID\",\"secret\":\"$SECRET\",\"score\":12345,\"distance_m\":800,\"duration_ms\":120000,\"client_run_id\":\"$RUN1\"}" /tmp/s1.json)
check "valid beküldés 200" "200" "$C"
grep -q 'rank_individual' /tmp/s1.json && check "rank_individual a válaszban" "ok" "ok" || check "rank_individual a válaszban" "ok" "missing"

# 2. Idempotencia: ugyanaz a client_run_id → duplicate:true, NEM új sor
C=$(post x "{\"player_id\":\"$PID\",\"secret\":\"$SECRET\",\"score\":12345,\"distance_m\":800,\"duration_ms\":120000,\"client_run_id\":\"$RUN1\"}" /tmp/s2.json)
grep -q '"duplicate":true' /tmp/s2.json && check "duplikátum-felismerés" "ok" "ok" || check "duplikátum-felismerés" "ok" "missing"

# 3. Rossz secret → 403
C=$(post x "{\"player_id\":\"$PID\",\"secret\":\"$(uuidgen)\",\"score\":1,\"duration_ms\":10000}" /tmp/s3.json)
check "rossz secret 403" "403" "$C"

# 4. Plauzibilitás: 9 999 999 pont 1 perc alatt → 422
C=$(post x "{\"player_id\":\"$PID\",\"secret\":\"$SECRET\",\"score\":9999999,\"duration_ms\":60000}" /tmp/s4.json)
check "hihetetlen pont 422" "422" "$C"

# 5. Túl rövid játékidő → 422
C=$(post x "{\"player_id\":\"$PID\",\"secret\":\"$SECRET\",\"score\":100,\"duration_ms\":500}" /tmp/s5.json)
check "túl rövid idő 422" "422" "$C"

# 6. Rate limit: azonnali újraküldés → 429 (az 1. lépés óta <10 mp telhetett el)
C=$(post x "{\"player_id\":\"$PID\",\"secret\":\"$SECRET\",\"score\":100,\"duration_ms\":10000,\"client_run_id\":\"$(uuidgen)\"}" /tmp/s6.json)
check "rate limit 429" "429" "$C"

echo "── $pass OK, $fail FAIL ──"; [ "$fail" = 0 ]
