#!/usr/bin/env bash
# =============================================================================
# curl-tests.sh — Test toutes les routes de core-payment-service
# Usage: ./scripts/curl-tests.sh [BASE_URL] [USER_ID] [API_KEY]
#
# Phase 1 : Tests sans donnees en base (health, plans, auth, validation, webhooks)
# Phase 2 : Tests avec donnees en base (seed -> test -> cleanup)
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

seed_db() {
  print_header "SEED — Insertion donnees de test en base"
  docker compose exec -T postgres psql -U payment_app -d payment -q <<'SQL'
INSERT INTO subscriptions (user_id, stripe_customer_id, stripe_subscription_id, plan_id, status, current_period_start, current_period_end)
VALUES ('550e8400-e29b-41d4-a716-446655440000', 'cus_test123', 'sub_test123', 'premium', 'active', now(), now() + interval '30 days')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO quotas (user_id, plan_id, generations_used, generations_limit, storage_used, storage_limit, reset_date)
VALUES ('550e8400-e29b-41d4-a716-446655440000', 'premium', 5, 50, 0, 10737418240, now() + interval '30 days')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO transactions (user_id, stripe_payment_intent_id, amount, currency, status)
VALUES ('550e8400-e29b-41d4-a716-446655440000', 'pi_test123', 999, 'eur', 'succeeded');
SQL
  echo "  Seed OK"
}

cleanup_db() {
  print_header "CLEANUP — Suppression donnees de test"
  docker compose exec -T postgres psql -U payment_app -d payment -q <<SQL
DELETE FROM transactions WHERE user_id = '${USER_ID}';
DELETE FROM quotas WHERE user_id = '${USER_ID}';
DELETE FROM subscriptions WHERE user_id = '${USER_ID}';
SQL
  echo "  Cleanup OK"
}

show_db() {
  echo ""
  echo "  --- Etat de la base ---"
  docker compose exec -T postgres psql -U payment_app -d payment -c \
    "SELECT user_id, plan_id, status FROM subscriptions WHERE user_id = '${USER_ID}';
     SELECT user_id, plan_id, generations_used, generations_limit, storage_used, storage_limit FROM quotas WHERE user_id = '${USER_ID}';
     SELECT user_id, amount, currency, status FROM transactions WHERE user_id = '${USER_ID}';" 2>/dev/null
}

# =============================================================================
#  PHASE 1 — SANS DONNEES EN BASE
# =============================================================================
print_header "PHASE 1 — SANS DONNEES EN BASE"

# Nettoyage prealable
cleanup_db 2>/dev/null || true

# --- Health ---
print_header "HEALTH CHECKS"

run_test "GET /health" "200" \
  "${API}/health"

run_test "GET /health/ready" "200" \
  "${API}/health/ready"

# --- Plans (public) ---
print_header "SUBSCRIPTIONS — Public"

run_test "GET /subscriptions/plans" "200" \
  "${API}/subscriptions/plans"

# --- Auth errors ---
print_header "AUTH — Erreurs sans header"

run_test "GET /subscriptions/current — sans header (401)" "401" \
  "${API}/subscriptions/current"

run_test "POST /subscriptions/checkout — sans header (401)" "401" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"planId":"premium","successUrl":"https://app.visiobook.com/success","cancelUrl":"https://app.visiobook.com/pricing"}' \
  "${API}/subscriptions/checkout"

run_test "GET /quotas — sans header (401)" "401" \
  "${API}/quotas"

run_test "POST /quotas/consume — sans api-key (401)" "401" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"${USER_ID}\",\"type\":\"generation\",\"amount\":1}" \
  "${API}/quotas/consume"

run_test "POST /quotas/reset — sans api-key (401)" "401" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"${USER_ID}\"}" \
  "${API}/quotas/reset"

# --- Validation errors ---
print_header "VALIDATION — Body invalide"

run_test "POST /subscriptions/checkout — body vide (400)" "400" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-user-id: ${USER_ID}" \
  -d '{}' \
  "${API}/subscriptions/checkout"

run_test "POST /quotas/consume — body vide (400)" "400" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d '{}' \
  "${API}/quotas/consume"

# --- Sans donnees: 404 / empty ---
print_header "SANS DONNEES — Comportement attendu"

run_test "GET /subscriptions/current — pas de subscription (200 vide)" "200" \
  -H "x-user-id: ${USER_ID}" \
  "${API}/subscriptions/current"

run_test "POST /subscriptions/checkout — sans subscription (201)" "201" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-user-id: ${USER_ID}" \
  -d '{"planId":"premium","successUrl":"https://app.visiobook.com/success","cancelUrl":"https://app.visiobook.com/pricing"}' \
  "${API}/subscriptions/checkout"

run_test "POST /subscriptions/checkout — interval year (201)" "201" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-user-id: ${USER_ID}" \
  -d '{"planId":"premium","interval":"year","successUrl":"https://app.visiobook.com/success","cancelUrl":"https://app.visiobook.com/pricing"}' \
  "${API}/subscriptions/checkout"

run_test "POST /subscriptions/payment-intent — sans subscription (201)" "201" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-user-id: ${USER_ID}" \
  -d '{"planId":"premium"}' \
  "${API}/subscriptions/payment-intent"

run_test "POST /subscriptions/payment-intent — interval year (201)" "201" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-user-id: ${USER_ID}" \
  -d '{"planId":"enterprise","interval":"year"}' \
  "${API}/subscriptions/payment-intent"

run_test "POST /subscriptions/cancel — pas de subscription (404)" "404" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-user-id: ${USER_ID}" \
  "${API}/subscriptions/cancel"

run_test "POST /subscriptions/upgrade — pas de subscription (404)" "404" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-user-id: ${USER_ID}" \
  -d '{"planId":"enterprise"}' \
  "${API}/subscriptions/upgrade"

run_test "POST /subscriptions/downgrade — pas de subscription (404)" "404" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-user-id: ${USER_ID}" \
  -d '{"planId":"premium"}' \
  "${API}/subscriptions/downgrade"

run_test "GET /subscriptions/portal — pas de subscription (404)" "404" \
  -H "x-user-id: ${USER_ID}" \
  "${API}/subscriptions/portal"

run_test "POST /quotas/consume — pas de quota (404)" "404" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d "{\"userId\":\"${USER_ID}\",\"type\":\"generation\",\"amount\":1}" \
  "${API}/quotas/consume"

run_test "POST /quotas/reset — pas de quota (404)" "404" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d "{\"userId\":\"${USER_ID}\"}" \
  "${API}/quotas/reset"

# --- Webhooks ---
print_header "WEBHOOKS — Stripe"

run_test "POST /webhooks/stripe — sans signature (400)" "400" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"type":"checkout.session.completed"}' \
  "${API}/webhooks/stripe"

run_test "POST /webhooks/stripe — signature bidon (400)" "400" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "stripe-signature: t=123,v1=fake" \
  -d '{"type":"checkout.session.completed"}' \
  "${API}/webhooks/stripe"

# =============================================================================
#  PHASE 2 — AVEC DONNEES EN BASE
# =============================================================================
print_header "PHASE 2 — AVEC DONNEES EN BASE"

seed_db
show_db

# --- Lecture subscription & quotas ---
print_header "AVEC DONNEES — Lectures"

run_test "GET /subscriptions/current — subscription active (200)" "200" \
  -H "x-user-id: ${USER_ID}" \
  "${API}/subscriptions/current"

run_test "GET /quotas — quota premium (200)" "200" \
  -H "x-user-id: ${USER_ID}" \
  "${API}/quotas"

# --- Checkout/payment-intent bloques ---
print_header "AVEC DONNEES — Checkout bloque si deja abonne"

run_test "POST /subscriptions/checkout — deja abonne (400)" "400" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-user-id: ${USER_ID}" \
  -d '{"planId":"enterprise","successUrl":"https://app.visiobook.com/success","cancelUrl":"https://app.visiobook.com/pricing"}' \
  "${API}/subscriptions/checkout"

run_test "POST /subscriptions/payment-intent — deja abonne (400)" "400" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-user-id: ${USER_ID}" \
  -d '{"planId":"enterprise"}' \
  "${API}/subscriptions/payment-intent"

# --- Quotas consume & reset ---
print_header "AVEC DONNEES — Consume & Reset quotas"

run_test "POST /quotas/consume — generation (201)" "201" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d "{\"userId\":\"${USER_ID}\",\"type\":\"generation\",\"amount\":1}" \
  "${API}/quotas/consume"

run_test "POST /quotas/consume — storage (201)" "201" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d "{\"userId\":\"${USER_ID}\",\"type\":\"storage\",\"amount\":100}" \
  "${API}/quotas/consume"

run_test "POST /quotas/reset (201)" "201" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d "{\"userId\":\"${USER_ID}\"}" \
  "${API}/quotas/reset"

# --- Etat final ---
print_header "ETAT FINAL DE LA BASE"
show_db

# =============================================================================
#  CLEANUP
# =============================================================================
cleanup_db

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
