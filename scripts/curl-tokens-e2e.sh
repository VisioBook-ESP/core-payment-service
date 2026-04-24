#!/usr/bin/env bash
# =============================================================================
# curl-tokens-e2e.sh — Tests e2e des 2 routes /tokens (GET + POST /consume)
#
# Usage:
#   ./scripts/curl-tokens-e2e.sh                         # local (default)
#   ./scripts/curl-tokens-e2e.sh [BASE_URL] [USER_ID]    # local avec params
#
# Prerequis LOCAL:
#   - docker compose up -d (app + postgres)
#   - La migration AddTokensColumns a ete executee
#   - python3 pour parser le JSON
#
# Scenarios couverts (utilise x-user-id direct, donc environnement local) :
#   1. GET /tokens sur user inconnu → balance Free virtuel (PLAN_FREE_TOKENS)
#   2. Seed DB avec row Premium + tokens_limit = 500_000
#   3. GET /tokens → balance Premium (used=0, limit=500000)
#   4. POST /tokens/consume 80 tokens (elevenlabs-tts) → success, remaining=499920
#   5. POST /tokens/consume 50 tokens (openai-gpt)     → success, remaining=499870
#   6. GET /tokens → verifier used=130, balance=499870
#   7. POST /tokens/consume overshoot (1_000_000_000)  → INSUFFICIENT_TOKENS
#   8. GET /tokens → balance inchange apres rejet
#   9. Cleanup DB
#
# Pour le cluster (visiobook.cloud), utiliser scripts/test-e2e-cluster.sh --all
# qui integre les memes tests dans le parcours utilisateur complet.
# =============================================================================

set -euo pipefail

BASE_URL="${1:-http://localhost:8087}"
USER_ID="${2:-770e8400-e29b-41d4-a716-446655440000}"
API_KEY="${INTERNAL_API_KEY:-dev-internal-key}"

API="${BASE_URL}/api/v1"
PLAN_FREE_TOKENS_EXPECTED="${PLAN_FREE_TOKENS:-10000}"
PLAN_PREMIUM_TOKENS_EXPECTED="${PLAN_PREMIUM_TOKENS:-500000}"

PASS=0
FAIL=0
TOTAL=0

# --- Couleurs ----------------------------------------------------------------
if [ -t 1 ]; then
  GREEN='\033[0;32m'; RED='\033[0;31m'; BOLD='\033[1m'; DIM='\033[2m'; RESET='\033[0m'
else
  GREEN=''; RED=''; BOLD=''; DIM=''; RESET=''
fi

# --- Helpers -----------------------------------------------------------------
json_get() {
  python3 -c "import sys,json; print(json.loads(sys.argv[1]).get(sys.argv[2],''))" "$1" "$2" 2>/dev/null
}

print_header() {
  echo ""
  echo -e "${BOLD}================================================================${RESET}"
  echo -e "${BOLD}  $1${RESET}"
  echo -e "${BOLD}================================================================${RESET}"
}

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  TOTAL=$((TOTAL + 1))
  if [ "$expected" = "$actual" ]; then
    echo -e "  ${GREEN}PASS${RESET}  ${label}  ${DIM}(${actual})${RESET}"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}FAIL${RESET}  ${label}  ${RED}got=${actual} expected=${expected}${RESET}"
    FAIL=$((FAIL + 1))
  fi
}

assert_http() {
  local label="$1" expected="$2" body="$3" code="$4"
  TOTAL=$((TOTAL + 1))
  if [ "$code" = "$expected" ]; then
    echo -e "  ${GREEN}PASS${RESET}  ${label}  ${DIM}(HTTP ${code})${RESET}"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}FAIL${RESET}  ${label}  ${RED}got HTTP ${code}, expected ${expected}${RESET}"
    echo -e "        ${DIM}$(echo "$body" | head -c 200)${RESET}"
    FAIL=$((FAIL + 1))
  fi
}

seed_premium_user() {
  docker compose exec -T postgres psql -U payment_app -d payment -q <<SQL
INSERT INTO quotas (user_id, plan_id, generations_used, generations_limit, storage_used, storage_limit, tokens_used, tokens_limit, reset_date)
VALUES ('${USER_ID}', 'premium', 0, 50, 0, 10737418240, 0, ${PLAN_PREMIUM_TOKENS_EXPECTED}, now() + interval '30 days')
ON CONFLICT (user_id) DO UPDATE SET
  plan_id='premium', tokens_used=0, tokens_limit=${PLAN_PREMIUM_TOKENS_EXPECTED};
SQL
}

cleanup_user() {
  docker compose exec -T postgres psql -U payment_app -d payment -q <<SQL
DELETE FROM quotas WHERE user_id = '${USER_ID}';
SQL
}

# --- Pre-check ---------------------------------------------------------------
print_header "Pre-check"

if ! command -v python3 >/dev/null 2>&1; then
  echo -e "  ${RED}FATAL: python3 requis${RESET}"; exit 1
fi

HEALTH=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${API}/health" || echo "000")
if [ "$HEALTH" != "200" ]; then
  echo -e "  ${RED}FATAL: service indisponible sur ${BASE_URL} (health=${HEALTH})${RESET}"
  exit 1
fi
echo -e "  ${GREEN}OK${RESET} — service accessible"

# Cleanup residuel (si run precedent a plante)
cleanup_user 2>/dev/null || true

# =============================================================================
#  1 — GET /tokens sur user inconnu → balance Free virtuel
# =============================================================================
print_header "1. User inconnu → balance Free virtuel (PLAN_FREE_TOKENS=${PLAN_FREE_TOKENS_EXPECTED})"

RESP=$(curl -s --max-time 10 -H "x-user-id: ${USER_ID}" "${API}/tokens")
PLAN=$(json_get "$RESP" "plan")
LIMIT=$(json_get "$RESP" "limit")
USED=$(json_get "$RESP" "used")
BALANCE=$(json_get "$RESP" "balance")

assert_eq "plan = free"         "free"                          "$PLAN"
assert_eq "limit = PLAN_FREE"   "$PLAN_FREE_TOKENS_EXPECTED"    "$LIMIT"
assert_eq "used = 0"            "0"                             "$USED"
assert_eq "balance = limit"     "$PLAN_FREE_TOKENS_EXPECTED"    "$BALANCE"

# POST /consume sans row → 404
print_header "1b. POST /tokens/consume sur user sans row → 404"

HTTP_CODE=$(curl -s -o /tmp/curl_body.txt -w "%{http_code}" --max-time 10 -X POST \
  -H "Content-Type: application/json" -H "x-api-key: ${API_KEY}" \
  -d "{\"userId\":\"${USER_ID}\",\"amount\":1}" "${API}/tokens/consume")
BODY=$(cat /tmp/curl_body.txt)
assert_http "consume sans row → 404" "404" "$BODY" "$HTTP_CODE"

# =============================================================================
#  2 — Seed user Premium avec tokens_limit=500000
# =============================================================================
print_header "2. Seed DB — user Premium avec tokens_limit=${PLAN_PREMIUM_TOKENS_EXPECTED}"
seed_premium_user
echo -e "  ${GREEN}OK${RESET} — user seede"

# =============================================================================
#  3 — GET /tokens → balance Premium
# =============================================================================
print_header "3. GET /tokens → balance Premium"

RESP=$(curl -s --max-time 10 -H "x-user-id: ${USER_ID}" "${API}/tokens")
PLAN=$(json_get "$RESP" "plan")
LIMIT=$(json_get "$RESP" "limit")
USED=$(json_get "$RESP" "used")
BALANCE=$(json_get "$RESP" "balance")

assert_eq "plan = premium"        "premium"                       "$PLAN"
assert_eq "limit = PLAN_PREMIUM"  "$PLAN_PREMIUM_TOKENS_EXPECTED" "$LIMIT"
assert_eq "used = 0"              "0"                             "$USED"
assert_eq "balance = limit"       "$PLAN_PREMIUM_TOKENS_EXPECTED" "$BALANCE"

# =============================================================================
#  4 — POST /consume 80 tokens (elevenlabs-tts) + verif
# =============================================================================
print_header "4. POST /tokens/consume x80 (elevenlabs-tts)"

RESP=$(curl -s --max-time 10 -X POST \
  -H "Content-Type: application/json" -H "x-api-key: ${API_KEY}" \
  -d "{\"userId\":\"${USER_ID}\",\"amount\":80,\"source\":\"elevenlabs-tts\"}" \
  "${API}/tokens/consume")
SUCCESS=$(json_get "$RESP" "success")
REMAINING=$(json_get "$RESP" "remaining")
EXPECTED=$((PLAN_PREMIUM_TOKENS_EXPECTED - 80))

assert_eq "success"              "True"        "$SUCCESS"
assert_eq "remaining = limit-80" "$EXPECTED"   "$REMAINING"

# =============================================================================
#  5 — POST /consume 50 tokens (openai-gpt)  (multi-IA)
# =============================================================================
print_header "5. POST /tokens/consume x50 (openai-gpt — multi-IA)"

RESP=$(curl -s --max-time 10 -X POST \
  -H "Content-Type: application/json" -H "x-api-key: ${API_KEY}" \
  -d "{\"userId\":\"${USER_ID}\",\"amount\":50,\"source\":\"openai-gpt\"}" \
  "${API}/tokens/consume")
SUCCESS=$(json_get "$RESP" "success")
REMAINING=$(json_get "$RESP" "remaining")
EXPECTED=$((PLAN_PREMIUM_TOKENS_EXPECTED - 130))

assert_eq "success"               "True"       "$SUCCESS"
assert_eq "remaining = limit-130" "$EXPECTED"  "$REMAINING"

# =============================================================================
#  6 — GET /tokens → verifier cumul (used=130)
# =============================================================================
print_header "6. GET /tokens → used cumule"

RESP=$(curl -s --max-time 10 -H "x-user-id: ${USER_ID}" "${API}/tokens")
USED=$(json_get "$RESP" "used")
BALANCE=$(json_get "$RESP" "balance")
EXPECTED_BALANCE=$((PLAN_PREMIUM_TOKENS_EXPECTED - 130))

assert_eq "used = 130"             "130"                "$USED"
assert_eq "balance = limit - 130"  "$EXPECTED_BALANCE"  "$BALANCE"

# =============================================================================
#  7 — Overshoot → INSUFFICIENT_TOKENS, pas de debit
# =============================================================================
print_header "7. Overshoot → INSUFFICIENT_TOKENS (pas de debit)"

OVERSHOOT=$((PLAN_PREMIUM_TOKENS_EXPECTED * 2))
RESP=$(curl -s --max-time 10 -X POST \
  -H "Content-Type: application/json" -H "x-api-key: ${API_KEY}" \
  -d "{\"userId\":\"${USER_ID}\",\"amount\":${OVERSHOOT}}" \
  "${API}/tokens/consume")
SUCCESS=$(json_get "$RESP" "success")
ERR=$(json_get "$RESP" "error")
REMAINING=$(json_get "$RESP" "remaining")
EXPECTED_REMAINING=$((PLAN_PREMIUM_TOKENS_EXPECTED - 130))

assert_eq "success = false"               "False"                 "$SUCCESS"
assert_eq "error = INSUFFICIENT_TOKENS"   "INSUFFICIENT_TOKENS"   "$ERR"
assert_eq "remaining inchange"            "$EXPECTED_REMAINING"   "$REMAINING"

# =============================================================================
#  8 — GET /tokens apres rejet → balance inchange
# =============================================================================
print_header "8. GET /tokens apres rejet → balance inchange"

RESP=$(curl -s --max-time 10 -H "x-user-id: ${USER_ID}" "${API}/tokens")
USED=$(json_get "$RESP" "used")
assert_eq "used toujours = 130" "130" "$USED"

# =============================================================================
#  9 — Cleanup
# =============================================================================
print_header "9. Cleanup DB"
cleanup_user
echo -e "  ${GREEN}OK${RESET} — user nettoye"

# =============================================================================
#  Resultats
# =============================================================================
echo ""
if [ "$FAIL" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}================================================================${RESET}"
  echo -e "${GREEN}${BOLD}  ALL TOKENS TESTS PASSED  (${PASS}/${TOTAL})${RESET}"
  echo -e "${GREEN}${BOLD}================================================================${RESET}"
else
  echo -e "${RED}${BOLD}================================================================${RESET}"
  echo -e "${RED}${BOLD}  TOKENS TESTS FAILED  (${FAIL}/${TOTAL})${RESET}"
  echo -e "${RED}${BOLD}================================================================${RESET}"
  exit 1
fi
