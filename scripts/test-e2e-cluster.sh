#!/usr/bin/env bash
# =============================================================================
# test-e2e-cluster.sh — Tests e2e du payment-service dans le cluster K8s
#
# Usage:
#   ./scripts/test-e2e-cluster.sh                    # hit visiobook.cloud
#   ./scripts/test-e2e-cluster.sh --url <BASE_URL>   # URL custom
#   ./scripts/test-e2e-cluster.sh --payment           # inclut les tests Stripe
#   ./scripts/test-e2e-cluster.sh --all               # curl + payment
#
# Flags:
#   --url <URL>     URL du service (default: https://visiobook.cloud)
#   --payment       Lance aussi les tests paiement Stripe e2e
#   --all           Lance tous les tests (curl + payment)
#   --no-cleanup    Ne pas nettoyer les donnees Stripe apres les tests payment
#
# Prerequis:
#   - python3 disponible
#   - (optionnel) stripe CLI pour --payment
# =============================================================================

set -euo pipefail

# --- Config par defaut -------------------------------------------------------
BASE_URL="https://visiobook.cloud"

STRIPE_SK="${STRIPE_SECRET_KEY:-sk_test_51Sq9o8HhqOObOnmXjmlvI1W2wwaOdIM1hpKQsEGQlL7YEVOLhMVJa5f7WwfWreDUsMalkNdjhQncMQF7QoTabrhW00JkLzdyBf}"
API_KEY="${INTERNAL_API_KEY:-dev-internal-key}"

RUN_CURL=true
RUN_PAYMENT=false
CLEANUP_STRIPE=true

PASS=0
FAIL=0
TOTAL=0

# --- Utilisateur e2e (genere aleatoirement) ----------------------------------
RAND=$(head -c 4 /dev/urandom | xxd -p)
E2E_EMAIL="e2e-pay-${RAND}@example.com"
E2E_USERNAME="e2e-pay-${RAND}"
E2E_PASSWORD="SecureE2eTest123!"
TOKEN=""

# --- Parse flags -------------------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    --url)
      BASE_URL="$2"; shift ;;
    --payment)
      RUN_PAYMENT=true ;;
    --all)
      RUN_PAYMENT=true ;;
    --no-cleanup)
      CLEANUP_STRIPE=false ;;
    *)
      echo "Flag inconnu: $1"; exit 1 ;;
  esac
  shift
done

# --- Helpers -----------------------------------------------------------------
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

run_test() {
  local label="$1"
  local expected_status="$2"
  shift 2
  TOTAL=$((TOTAL + 1))

  echo ""
  echo "--- [$TOTAL] $label ---"

  HTTP_CODE=$(curl -s -o /tmp/curl_body.txt -w "%{http_code}" --max-time 10 "$@")
  BODY=$(cat /tmp/curl_body.txt)

  if [ "$HTTP_CODE" = "$expected_status" ]; then
    echo "  [PASS] HTTP $HTTP_CODE"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] HTTP $HTTP_CODE (expected $expected_status)"
    echo "  Response: $(echo "$BODY" | head -c 300)"
    FAIL=$((FAIL + 1))
  fi
}

wait_for_health() {
  local url="$1"
  local max_attempts=20
  local attempt=0
  while [ $attempt -lt $max_attempts ]; do
    if curl -s -o /dev/null -w "" --max-time 3 "$url" 2>/dev/null; then
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 1
  done
  echo "  [FATAL] Service non disponible apres ${max_attempts}s sur $url"
  exit 1
}

# =============================================================================
#  ETAPE 1 — Verification du service
# =============================================================================
print_header "ETAPE 1 — Verification du service"

step "python3 disponible ?"
if ! command -v python3 &> /dev/null; then
  echo "  [FATAL] python3 requis pour parser le JSON"
  exit 1
fi
echo "  OK"

API="${BASE_URL}/api/v1"

step "Service accessible sur $BASE_URL ?"
wait_for_health "${API}/health"
echo "  OK — service en ligne"

# =============================================================================
#  ETAPE 2 — Authentification (register + login)
# =============================================================================
print_header "ETAPE 2 — Authentification"

AUTH_API="${BASE_URL}/api/v1"

step "Register: ${E2E_EMAIL}"
REG_RESP=$(curl -s -o /tmp/curl_body.txt -w "%{http_code}" --max-time 10 \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${E2E_EMAIL}\",\"password\":\"${E2E_PASSWORD}\",\"username\":\"${E2E_USERNAME}\"}" \
  "${AUTH_API}/auth/register")
REG_BODY=$(cat /tmp/curl_body.txt)

if [ "$REG_RESP" -ge 200 ] && [ "$REG_RESP" -lt 300 ]; then
  echo "  OK — user cree (HTTP ${REG_RESP})"
else
  echo "  [FATAL] Register echoue (HTTP ${REG_RESP}): $(echo "$REG_BODY" | head -c 300)"
  exit 1
fi

step "Login: ${E2E_EMAIL}"
LOGIN_RESP=$(curl -s -o /tmp/curl_body.txt -w "%{http_code}" --max-time 10 \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${E2E_EMAIL}\",\"password\":\"${E2E_PASSWORD}\"}" \
  "${AUTH_API}/auth/login")
LOGIN_BODY=$(cat /tmp/curl_body.txt)

if [ "$LOGIN_RESP" -ge 200 ] && [ "$LOGIN_RESP" -lt 300 ]; then
  TOKEN=$(python3 -c "import sys,json; print(json.loads(sys.argv[1]).get('access_token',''))" "$LOGIN_BODY")
  if [ -z "$TOKEN" ] || [ "$TOKEN" = "None" ]; then
    echo "  [FATAL] Login OK mais pas de access_token dans la reponse"
    echo "  Response: $(echo "$LOGIN_BODY" | head -c 300)"
    exit 1
  fi
  echo "  OK — token: ${TOKEN:0:50}..."
else
  echo "  [FATAL] Login echoue (HTTP ${LOGIN_RESP}): $(echo "$LOGIN_BODY" | head -c 300)"
  exit 1
fi

# Header d'auth pour toutes les requetes authentifiees
AUTH_HEADER="Authorization: Bearer ${TOKEN}"

# =============================================================================
#  ETAPE 3 — Tests curl fonctionnels
# =============================================================================
if [ "$RUN_CURL" = true ]; then

  # =========================================================================
  #  HEALTH
  # =========================================================================
  print_header "HEALTH CHECKS"

  run_test "GET /health" "200" \
    "${API}/health"

  run_test "GET /health/ready" "200" \
    "${API}/health/ready"

  # =========================================================================
  #  PLANS (public)
  # =========================================================================
  print_header "SUBSCRIPTIONS — Plans (public)"

  run_test "GET /subscriptions/plans — liste des plans" "200" \
    "${API}/subscriptions/plans"

  # =========================================================================
  #  AUTH — Erreurs sans token (RBAC doit bloquer -> 403)
  # =========================================================================
  print_header "AUTH — Erreurs sans token (expect 403 RBAC)"

  run_test "GET /subscriptions/current — sans auth (403)" "403" \
    "${API}/subscriptions/current"

  run_test "POST /subscriptions/checkout — sans auth (403)" "403" \
    -X POST \
    -H "Content-Type: application/json" \
    -d '{"planId":"premium","successUrl":"https://app.visiobook.com/success","cancelUrl":"https://app.visiobook.com/pricing"}' \
    "${API}/subscriptions/checkout"

  run_test "POST /subscriptions/cancel — sans auth (403)" "403" \
    -X POST \
    "${API}/subscriptions/cancel"

  run_test "GET /quotas — sans auth (403)" "403" \
    "${API}/quotas"

  # =========================================================================
  #  VALIDATION — Body invalide (avec token)
  # =========================================================================
  print_header "VALIDATION — Body invalide"

  run_test "POST /subscriptions/checkout — body vide (400)" "400" \
    -X POST \
    -H "Content-Type: application/json" \
    -H "${AUTH_HEADER}" \
    -d '{}' \
    "${API}/subscriptions/checkout"

  run_test "POST /quotas/consume — body vide (400)" "400" \
    -X POST \
    -H "Content-Type: application/json" \
    -H "x-api-key: ${API_KEY}" \
    -H "${AUTH_HEADER}" \
    -d '{}' \
    "${API}/quotas/consume"

  # =========================================================================
  #  AVEC TOKEN — Comportement attendu (user sans subscription)
  # =========================================================================
  print_header "AVEC TOKEN — Comportement attendu (user frais)"

  run_test "GET /subscriptions/current — pas de subscription (200)" "200" \
    -H "${AUTH_HEADER}" \
    "${API}/subscriptions/current"

  run_test "POST /subscriptions/cancel — pas de subscription (404)" "404" \
    -X POST \
    -H "${AUTH_HEADER}" \
    "${API}/subscriptions/cancel"

  run_test "POST /subscriptions/upgrade — pas de subscription (404)" "404" \
    -X POST \
    -H "Content-Type: application/json" \
    -H "${AUTH_HEADER}" \
    -d '{"planId":"enterprise"}' \
    "${API}/subscriptions/upgrade"

  run_test "POST /subscriptions/downgrade — pas de subscription (404)" "404" \
    -X POST \
    -H "Content-Type: application/json" \
    -H "${AUTH_HEADER}" \
    -d '{"planId":"premium"}' \
    "${API}/subscriptions/downgrade"

  run_test "GET /subscriptions/portal — pas de subscription (404)" "404" \
    -H "${AUTH_HEADER}" \
    "${API}/subscriptions/portal"

  run_test "GET /quotas — user frais (200)" "200" \
    -H "${AUTH_HEADER}" \
    "${API}/quotas"

  # =========================================================================
  #  WEBHOOKS — Stripe (signature invalide)
  # =========================================================================
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

fi

# =============================================================================
#  ETAPE 4 — Tests paiement Stripe e2e
# =============================================================================
if [ "$RUN_PAYMENT" = true ]; then

  print_header "ETAPE 4 — Tests paiement Stripe e2e"

  step "Stripe API accessible ?"
  STRIPE_CHECK=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
    "https://api.stripe.com/v1/balance" -u "${STRIPE_SK}:")
  if [ "$STRIPE_CHECK" != "200" ]; then
    echo "  [FATAL] Stripe API inaccessible ou cle invalide"
    exit 1
  fi
  echo "  OK — Stripe API (mode test)"

  STRIPE_CUSTOMERS_TO_CLEANUP=()

  simulate_payment() {
    local plan_id="$1"
    local interval="$2"
    local label="$3"

    TOTAL=$((TOTAL + 1))
    echo ""
    echo "--- [$TOTAL] $label ---"
    echo "  Plan:     $plan_id ($interval)"

    # --- Creer la subscription via payment-intent ---
    step "POST /subscriptions/payment-intent"
    RESPONSE=$(curl -s --max-time 15 -X POST \
      -H "Content-Type: application/json" \
      -H "${AUTH_HEADER}" \
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

    STRIPE_CUSTOMERS_TO_CLEANUP+=("$CUSTOMER_ID")

    # Extraire le PaymentIntent ID
    PI_ID="${CLIENT_SECRET%%_secret_*}"

    # --- Confirmer le PaymentIntent avec carte test ---
    step "Stripe API: confirmer PaymentIntent ${PI_ID} (carte 4242...)"
    CONFIRM_RESPONSE=$(curl -s --max-time 15 -X POST \
      "https://api.stripe.com/v1/payment_intents/${PI_ID}/confirm" \
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

    # --- Attente propagation webhook ---
    step "Attente propagation webhook (5s)..."
    sleep 5

    # --- Verifier la subscription cote Stripe ---
    step "Stripe API: verifier subscription ${SUB_ID}"
    SUB_RESPONSE=$(curl -s --max-time 10 \
      "https://api.stripe.com/v1/subscriptions/${SUB_ID}" \
      -u "${STRIPE_SK}:")
    SUB_STATUS=$(json_get "$SUB_RESPONSE" "status")
    echo "  Subscription Stripe: $SUB_STATUS"

    # --- Verifier via notre API ---
    step "GET /subscriptions/current"
    OUR_RESPONSE=$(curl -s --max-time 10 \
      -H "${AUTH_HEADER}" \
      "${API}/subscriptions/current")
    echo "  Notre API: $(echo "$OUR_RESPONSE" | head -c 300)"
  }

  # --- Scenarios ---
  print_header "SCENARIO : Premium mensuel"
  simulate_payment "premium" "month" "Premium mensuel"

  # --- Cleanup Stripe (annuler les subscriptions de test) ---
  if [ "$CLEANUP_STRIPE" = true ] && [ ${#STRIPE_CUSTOMERS_TO_CLEANUP[@]} -gt 0 ]; then
    print_header "CLEANUP — Annulation des subscriptions Stripe de test"
    for cust_id in "${STRIPE_CUSTOMERS_TO_CLEANUP[@]}"; do
      step "Annulation des subscriptions pour customer $cust_id"
      # Lister les subscriptions du customer
      SUBS_LIST=$(curl -s --max-time 10 \
        "https://api.stripe.com/v1/subscriptions?customer=${cust_id}&status=active" \
        -u "${STRIPE_SK}:")
      # Extraire les IDs et annuler
      SUB_IDS=$(python3 -c "
import sys, json
data = json.loads(sys.argv[1])
for sub in data.get('data', []):
    print(sub['id'])
" "$SUBS_LIST" 2>/dev/null || true)
      for sub_id in $SUB_IDS; do
        curl -s --max-time 10 -X DELETE \
          "https://api.stripe.com/v1/subscriptions/${sub_id}" \
          -u "${STRIPE_SK}:" > /dev/null
        echo "    Annulee: $sub_id"
      done
    done
    echo "  Cleanup Stripe termine"
  fi
fi

# =============================================================================
#  RESULTATS
# =============================================================================
echo ""
echo "================================================================"
echo "  RESULTATS — TEST E2E CLUSTER"
echo "================================================================"
echo "  URL:        $BASE_URL"
echo "  Total:      $TOTAL"
echo "  Pass:       $PASS"
echo "  Fail:       $FAIL"
echo "================================================================"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
