#!/usr/bin/env bash
# Használat: BASE=... SID=<Teszt Gimi id> ./test_affiliation_delete.sh
set -u
BASE="${BASE:?}"; SID="${SID:?}"
pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "✔ $1"; pass=$((pass+1));
  else echo "✘ $1 — várt:$2 kapott:$3"; fail=$((fail+1)); fi; }

# Játékos létrehozása (egyéni)
RESP=$(curl -s -X POST "$BASE/register" -H 'Content-Type: application/json' \
  -d '{"nickname":"Váltó Viki","consent_is_parent":false}')
PID=$(echo "$RESP" | grep -o '"player_id":"[^"]*"' | cut -d'"' -f4)
SECRET=$(echo "$RESP" | grep -o '"secret":"[^"]*"' | cut -d'"' -f4)

# 1. Csatlakozás iskolához + új osztály → 200, school nem null
C=$(curl -s -o /tmp/a1.json -w '%{http_code}' -X POST "$BASE/update-affiliation" \
  -H 'Content-Type: application/json' \
  -d "{\"player_id\":\"$PID\",\"secret\":\"$SECRET\",\"school_id\":$SID,\"new_class_name\":\"10.C\"}")
check "csatlakozás 200" "200" "$C"
grep -q '"10.C"' /tmp/a1.json && check "osztály a válaszban" "ok" "ok" || check "osztály a válaszban" "ok" "missing"

# 2. Rossz secret → 403
C=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/update-affiliation" \
  -H 'Content-Type: application/json' \
  -d "{\"player_id\":\"$PID\",\"secret\":\"$(uuidgen)\",\"school_id\":$SID}")
check "rossz secret 403" "403" "$C"

# 3. Törlés rossz secrettel → 403
C=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/delete-my-data" \
  -H 'Content-Type: application/json' \
  -d "{\"player_id\":\"$PID\",\"secret\":\"$(uuidgen)\"}")
check "törlés rossz secret 403" "403" "$C"

# 4. Törlés jó secrettel → 200 deleted:true
C=$(curl -s -o /tmp/a4.json -w '%{http_code}' -X POST "$BASE/delete-my-data" \
  -H 'Content-Type: application/json' \
  -d "{\"player_id\":\"$PID\",\"secret\":\"$SECRET\"}")
check "törlés 200" "200" "$C"
grep -q '"deleted":true' /tmp/a4.json && check "deleted:true" "ok" "ok" || check "deleted:true" "ok" "missing"

# 5. Törölt játékos újabb törlése → 403 (már nem létezik)
C=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/delete-my-data" \
  -H 'Content-Type: application/json' \
  -d "{\"player_id\":\"$PID\",\"secret\":\"$SECRET\"}")
check "törölt játékos 403" "403" "$C"

echo "── $pass OK, $fail FAIL ──"; [ "$fail" = 0 ]
