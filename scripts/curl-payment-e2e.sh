#!/usr/bin/env bash
# =============================================================================
# curl-payment-e2e.sh — Simule des paiements complets de bout en bout
#
# Cree une subscription via /payment-intent, puis confirme le paiement
# via l'API Stripe avec une carte de test (4242 4242 4242 4242).
#
# Usage: ./scripts/curl-payment-e2e.sh [BASE_URL]
#
# Prerequis:
#   - Le service tourne sur BASE_URL (default: http://localhost:8087)
#   - USER_SERVICE_MOCK=true dans le conteneur
#   - python3 disponible (pour parser le JSON)
# =============================================================================

set -euo pipefail

BASE_URL="${1:-http://localhost:8087}"
API="${BASE_URL}/api/v1"

# Stripe secret key (mode test) — meme cle que dans docker-compose/values.yaml
STRIPE_SK="${STRIPE_SECRET_KEY:-sk_test_51Sq9o8HhqOObOnmXjmlvI1W2wwaOdIM1hpKQsEGQlL7YEVOLhMVJa5f7WwfWreDUsMalkNdjhQncMQF7QoTabrhW00JkLzdyBf}"

PASS=0
FAIL=0
TOTAL=0

# --- Utilisateurs de test ----------------------------------------------------
USER_A="aaaaaaaa-1111-4000-a000-000000000001"
USER_B="bbbbbbbb-2222-4000-b000-000000000002"
USER_C="cccccccc-3333-4000-c000-000000000003"

# --- Helpers -----------------------------------------------------------------

# Extraire un champ JSON : json_get '{"a":"b"}' a → b
json_get() {
  python3 -c "import sys,json; print(json.loads(sys.argv[1]).get(sys.argv[2],''))" "$1" "$2"
}

print_header() {
  echo ""
  echo "================================================================"
  echo "  $1"
  echo "================================================================"
}

step() {
  echo "  -> $1"
}

# simulate_payment <USER_ID> <PLAN_ID> <INTERVAL> <LABEL>
simulate_payment() {
  local user_id="$1"
  local plan_id="$2"
  local interval="$3"
  local label="$4"

  TOTAL=$((TOTAL + 1))
  echo ""
  echo "--- [$TOTAL] $label ---"
  echo "  User:     $user_id"
  echo "  Plan:     $plan_id ($interval)"

  # --- Etape 1 : Creer la subscription incomplete via notre API ----------------
  step "POST /subscriptions/payment-intent"
  RESPONSE=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -H "x-user-id: ${user_id}" \
    -d "{\"planId\":\"${plan_id}\",\"interval\":\"${interval}\"}" \
    "${API}/subscriptions/payment-intent")

  CLIENT_SECRET=$(json_get "$RESPONSE" "clientSecret")
  CUSTOMER_ID=$(json_get "$RESPONSE" "customerId")
  SUB_ID=$(json_get "$RESPONSE" "subscriptionId")

  if [ -z "$CLIENT_SECRET" ] || [ -z "$CUSTOMER_ID" ]; then
    echo "  [FAIL] Echec creation payment-intent: $RESPONSE"
    FAIL=$((FAIL + 1))
    return
  fi
  echo "  clientSecret: ${CLIENT_SECRET:0:40}..."
  echo "  customerId:   $CUSTOMER_ID"
  echo "  subscription: $SUB_ID"

  # Extraire le PaymentIntent ID du clientSecret (pi_xxx_secret_yyy -> pi_xxx)
  PI_ID="${CLIENT_SECRET%%_secret_*}"

  # --- Etape 2 : Confirmer le PaymentIntent avec carte test --------------------
  step "Stripe API: confirmer PaymentIntent ${PI_ID} (carte 4242...)"
  CONFIRM_RESPONSE=$(curl -s -X POST "https://api.stripe.com/v1/payment_intents/${PI_ID}/confirm" \
    -u "${STRIPE_SK}:" \
    -d "payment_method=pm_card_visa")

  PI_STATUS=$(json_get "$CONFIRM_RESPONSE" "status")

  if [ "$PI_STATUS" = "succeeded" ]; then
    echo "  [PASS] PaymentIntent confirme — status: succeeded"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] PaymentIntent status: $PI_STATUS"
    echo "  Response: $(echo "$CONFIRM_RESPONSE" | head -c 300)"
    FAIL=$((FAIL + 1))
    return
  fi

  # --- Etape 3 : Verifier la subscription cote Stripe --------------------------
  step "Attente propagation webhook (2s)..."
  sleep 2
  step "Stripe API: verifier subscription ${SUB_ID}"
  SUB_RESPONSE=$(curl -s "https://api.stripe.com/v1/subscriptions/${SUB_ID}" \
    -u "${STRIPE_SK}:")
  SUB_STATUS=$(json_get "$SUB_RESPONSE" "status")
  echo "  Subscription Stripe: $SUB_STATUS"

  # --- Etape 4 : Verifier via notre API ----------------------------------------
  step "GET /subscriptions/current pour user ${user_id}"
  OUR_RESPONSE=$(curl -s -H "x-user-id: ${user_id}" "${API}/subscriptions/current")
  echo "  Notre API: $(echo "$OUR_RESPONSE" | head -c 300)"

  echo ""
  echo "  Paiement complet pour $label"
}

# =============================================================================
#  VERIFICATIONS PREALABLES
# =============================================================================
print_header "VERIFICATIONS"

step "python3 disponible ?"
if ! command -v python3 &> /dev/null; then
  echo "  [FATAL] python3 requis pour parser le JSON"
  exit 1
fi
echo "  OK"

step "Service accessible ?"
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "${API}/health")
if [ "$HEALTH" != "200" ]; then
  echo "  [FATAL] Le service ne repond pas sur ${BASE_URL}"
  exit 1
fi
echo "  OK — service en ligne"

step "Stripe API accessible ?"
STRIPE_CHECK=$(curl -s -o /dev/null -w "%{http_code}" "https://api.stripe.com/v1/balance" \
  -u "${STRIPE_SK}:")
if [ "$STRIPE_CHECK" != "200" ]; then
  echo "  [FATAL] Stripe API inaccessible ou cle invalide"
  exit 1
fi
echo "  OK — Stripe API (mode test)"

# =============================================================================
#  SCENARIOS DE PAIEMENT
# =============================================================================
print_header "SCENARIO 1 : User A -> Premium mensuel (9.99 EUR/mois)"
simulate_payment "$USER_A" "premium" "month" "User A — Premium mensuel"

print_header "SCENARIO 2 : User B -> Enterprise mensuel (29.99 EUR/mois)"
simulate_payment "$USER_B" "enterprise" "month" "User B — Enterprise mensuel"

print_header "SCENARIO 3 : User C -> Premium annuel (99.99 EUR/an)"
simulate_payment "$USER_C" "premium" "year" "User C — Premium annuel"

# =============================================================================
#  RESULTATS
# =============================================================================
echo ""
echo "================================================================"
echo "  RESULTATS PAIEMENTS E2E"
echo "================================================================"
echo "  Total:  $TOTAL"
echo "  Pass:   $PASS"
echo "  Fail:   $FAIL"
echo ""
echo "  Verifiez sur le Stripe Dashboard (Mode test, compte acct_1Sq9o8HhqOObOnmX) :"
echo "    - Payments  : 3 paiements reussis"
echo "    - Customers : 3 customers crees"
echo "    - Billing > Subscriptions : 3 subscriptions actives"
echo "================================================================"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
