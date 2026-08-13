#!/usr/bin/env bash
# Használat: BASE=https://PROJECT_REF.supabase.co/functions/v1 ./test_register.sh
set -u
BASE="${BASE:?add meg a BASE-t}"
pass=0; fail=0
check() { # $1=leírás $2=várt $3=kapott
  if [ "$2" = "$3" ]; then echo "✔ $1"; pass=$((pass+1));
  else echo "✘ $1 — várt:$2 kapott:$3"; fail=$((fail+1)); fi
}

# 1. Valid regisztráció iskolával + új osztállyal → 201
SID=3 # a seed 'Teszt Gimi' id-je (feloldva: select id from schools where name='Teszt Gimi')
R1=$(curl -s -o /tmp/reg1.json -w '%{http_code}' -X POST "$BASE/register" \
  -H 'Content-Type: application/json' \
  -d "{\"nickname\":\"Teszt Béla\",\"school_id\":$SID,\"new_class_name\":\"9.B\",\"consent_is_parent\":false}")
check "valid regisztráció 201" "201" "$R1"
grep -q '"player_id"' /tmp/reg1.json && check "player_id a válaszban" "ok" "ok" || check "player_id a válaszban" "ok" "missing"
grep -q '"secret"' /tmp/reg1.json && check "secret a válaszban" "ok" "ok" || check "secret a válaszban" "ok" "missing"

# 2. Egyéni játékos (iskola nélkül) → 201
R2=$(curl -s -o /tmp/reg2.json -w '%{http_code}' -X POST "$BASE/register" \
  -H 'Content-Type: application/json' \
  -d '{"nickname":"Solo Zsófi","consent_is_parent":false}')
check "egyéni regisztráció 201" "201" "$R2"

# 3. Tiltott becenév → 400 nickname_blocked
R3=$(curl -s -o /tmp/reg3.json -w '%{http_code}' -X POST "$BASE/register" \
  -H 'Content-Type: application/json' \
  -d '{"nickname":"kurva jóska","consent_is_parent":false}')
check "tiltott becenév 400" "400" "$R3"
check "hiba=blocked" "nickname_blocked" "$(grep -o 'nickname_blocked' /tmp/reg3.json || echo hiányzik)"

# 4. Osztály iskola nélkül → 400 class_requires_school
R4=$(curl -s -o /tmp/reg4.json -w '%{http_code}' -X POST "$BASE/register" \
  -H 'Content-Type: application/json' \
  -d '{"nickname":"Osztály Ottó","new_class_name":"1.A","consent_is_parent":false}')
check "osztály iskola nélkül 400" "400" "$R4"

# 5. Rate limit: 6. regisztráció 1 percen belül → 429
for i in 1 2 3 4; do curl -s -o /dev/null -X POST "$BASE/register" \
  -H 'Content-Type: application/json' \
  -d "{\"nickname\":\"Flood $i\",\"consent_is_parent\":false}"; done
R5=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/register" \
  -H 'Content-Type: application/json' \
  -d '{"nickname":"Flood 5","consent_is_parent":false}')
check "rate limit 429" "429" "$R5"

echo "── $pass OK, $fail FAIL ──"; [ "$fail" = 0 ]
