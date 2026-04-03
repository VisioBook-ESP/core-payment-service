#!/usr/bin/env bash
# =============================================================================
# curl-tests.sh — Test toutes les routes de core-payment-service
# Usage: ./scripts/curl-tests.sh [BASE_URL] [USER_ID] [API_KEY]
# =============================================================================

set -euo pipefail

BASE_URL="${1:-http://localhost:8087}"
USER_ID="${2:-550e8400-e29b-41d4-a716-446655440000}"
API_KEY="${3:-dev-internal-key}"

API="${BASE_URL}/api/v1"
PASS=0
FAIL=0
TOTAL=0

# --- Helpers -----------------------------------------------------------------

print_header() {
  echo ""
  echo "================================================================"
  echo "  $1"
  echo "================================================================"
}

run_test() {
  local label="$1"
  local expected_status="$2"
  shift 2
  TOTAL=$((TOTAL + 1))

  echo ""
  echo "--- [$TOTAL] $label ---"
  echo "  > $*"

  HTTP_CODE=$(curl -s -o /tmp/curl_body.txt -w "%{http_code}" "$@")
  BODY=$(cat /tmp/curl_body.txt)

  if [ "$HTTP_CODE" = "$expected_status" ]; then
    echo "  [PASS] HTTP $HTTP_CODE"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] HTTP $HTTP_CODE (expected $expected_status)"
    FAIL=$((FAIL + 1))
  fi

  echo "  Response: $(echo "$BODY" | head -c 500)"
}

# =============================================================================
#  HEALTH
# =============================================================================
print_header "HEALTH CHECKS"

run_test "GET /health" "200" \
  "${API}/health"

run_test "GET /health/ready" "200" \
  "${API}/health/ready"

# =============================================================================
#  SUBSCRIPTIONS — Routes publiques
# =============================================================================
print_header "SUBSCRIPTIONS — Public"

run_test "GET /subscriptions/plans" "200" \
  "${API}/subscriptions/plans"

# =============================================================================
#  SUBSCRIPTIONS — Routes authentifiees (x-user-id)
# =============================================================================
print_header "SUBSCRIPTIONS — Authenticated (x-user-id)"

run_test "GET /subscriptions/current" "200" \
  -H "x-user-id: ${USER_ID}" \
  "${API}/subscriptions/current"

run_test "GET /subscriptions/current — sans header (401 attendu)" "401" \
  "${API}/subscriptions/current"

run_test "POST /subscriptions/checkout" "201" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-user-id: ${USER_ID}" \
  -d '{"planId":"premium","successUrl":"https://app.visiobook.com/success","cancelUrl":"https://app.visiobook.com/pricing"}' \
  "${API}/subscriptions/checkout"

run_test "POST /subscriptions/checkout — avec interval year" "201" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-user-id: ${USER_ID}" \
  -d '{"planId":"premium","interval":"year","successUrl":"https://app.visiobook.com/success","cancelUrl":"https://app.visiobook.com/pricing"}' \
  "${API}/subscriptions/checkout"

run_test "POST /subscriptions/checkout — sans header (401 attendu)" "401" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"planId":"premium","successUrl":"https://app.visiobook.com/success","cancelUrl":"https://app.visiobook.com/pricing"}' \
  "${API}/subscriptions/checkout"

run_test "POST /subscriptions/checkout — body invalide (400 attendu)" "400" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-user-id: ${USER_ID}" \
  -d '{}' \
  "${API}/subscriptions/checkout"

run_test "POST /subscriptions/payment-intent" "201" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-user-id: ${USER_ID}" \
  -d '{"planId":"premium"}' \
  "${API}/subscriptions/payment-intent"

run_test "POST /subscriptions/payment-intent — avec interval year" "201" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-user-id: ${USER_ID}" \
  -d '{"planId":"enterprise","interval":"year"}' \
  "${API}/subscriptions/payment-intent"

run_test "POST /subscriptions/cancel — sans subscription (404 attendu)" "404" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-user-id: ${USER_ID}" \
  "${API}/subscriptions/cancel"

run_test "POST /subscriptions/upgrade — sans subscription (404 attendu)" "404" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-user-id: ${USER_ID}" \
  -d '{"planId":"enterprise"}' \
  "${API}/subscriptions/upgrade"

run_test "POST /subscriptions/downgrade — sans subscription (404 attendu)" "404" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-user-id: ${USER_ID}" \
  -d '{"planId":"premium"}' \
  "${API}/subscriptions/downgrade"

run_test "GET /subscriptions/portal — sans subscription (404 attendu)" "404" \
  -H "x-user-id: ${USER_ID}" \
  "${API}/subscriptions/portal"

run_test "GET /subscriptions/portal — avec returnUrl, sans subscription (404 attendu)" "404" \
  -H "x-user-id: ${USER_ID}" \
  "${API}/subscriptions/portal?returnUrl=https://app.visiobook.com/settings"

# =============================================================================
#  QUOTAS — Route authentifiee (x-user-id)
# =============================================================================
print_header "QUOTAS — Authenticated (x-user-id)"

run_test "GET /quotas" "200" \
  -H "x-user-id: ${USER_ID}" \
  "${API}/quotas"

run_test "GET /quotas — sans header (401 attendu)" "401" \
  "${API}/quotas"

# =============================================================================
#  QUOTAS — Routes service-only (x-api-key)
# =============================================================================
print_header "QUOTAS — Service-only (x-api-key)"

run_test "POST /quotas/consume — generation, sans quota en base (404 attendu)" "404" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d "{\"userId\":\"${USER_ID}\",\"type\":\"generation\",\"amount\":1}" \
  "${API}/quotas/consume"

run_test "POST /quotas/consume — storage, sans quota en base (404 attendu)" "404" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d "{\"userId\":\"${USER_ID}\",\"type\":\"storage\",\"amount\":100}" \
  "${API}/quotas/consume"

run_test "POST /quotas/consume — sans api-key (401 attendu)" "401" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"${USER_ID}\",\"type\":\"generation\",\"amount\":1}" \
  "${API}/quotas/consume"

run_test "POST /quotas/consume — body invalide (400 attendu)" "400" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d '{}' \
  "${API}/quotas/consume"

run_test "POST /quotas/reset — sans quota en base (404 attendu)" "404" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d "{\"userId\":\"${USER_ID}\"}" \
  "${API}/quotas/reset"

run_test "POST /quotas/reset — sans api-key (401 attendu)" "401" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"${USER_ID}\"}" \
  "${API}/quotas/reset"

# =============================================================================
#  WEBHOOKS — Stripe (pas de vrai test fonctionnel sans signature valide)
# =============================================================================
print_header "WEBHOOKS — Stripe"

run_test "POST /webhooks/stripe — sans signature (400 attendu)" "400" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"type":"checkout.session.completed"}' \
  "${API}/webhooks/stripe"

run_test "POST /webhooks/stripe — signature bidon (400 attendu)" "400" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "stripe-signature: t=123,v1=fake" \
  -d '{"type":"checkout.session.completed"}' \
  "${API}/webhooks/stripe"

# =============================================================================
#  RESULTATS
# =============================================================================
echo ""
echo "================================================================"
echo "  RESULTATS"
echo "================================================================"
echo "  Total:  $TOTAL"
echo "  Pass:   $PASS"
echo "  Fail:   $FAIL"
echo "================================================================"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
