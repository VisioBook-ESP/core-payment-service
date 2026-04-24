#!/usr/bin/env bash
# =============================================================================
# test-e2e-cluster.sh — Tests e2e du payment-service dans le cluster K8s
#
# Parcours utilisateur teste :
#   1. Securite    — Toutes les routes bloquees sans token (Gateway RBAC)
#   2. Decouverte  — Consulter les plans disponibles
#   3. Validation  — Donnees invalides rejetees (body vide, mauvais format)
#   4. Nouvel utilisateur — Pas de subscription, quotas par defaut, balance tokens Free
#   5. Souscription — Checkout web (session Stripe) + erreurs metier
#   6. Tokens sans sub — GET balance Free virtuel OK, POST consume 404 (pas de row)
#   7. Webhooks    — Signature Stripe validee
#   8. Paiement    — (--payment) Payment-intent mobile, confirmation, activation
#   9. Post-paiement — (--payment) Quotas + Tokens consommes apres subscription
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

# Compteurs par section
SECTION_PASS=0
SECTION_FAIL=0
SECTION_TOTAL=0

# --- Utilisateur e2e (genere aleatoirement) ----------------------------------
RAND=$(head -c 4 /dev/urandom | xxd -p)
E2E_EMAIL="e2e-pay-${RAND}@example.com"
E2E_USERNAME="e2e-pay-${RAND}"
E2E_PASSWORD="SecureE2eTest123!"
TOKEN=""
USER_ID=""

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

# --- Couleurs ----------------------------------------------------------------
if [ -t 1 ]; then
  GREEN='\033[0;32m'
  RED='\033[0;31m'
  YELLOW='\033[0;33m'
  CYAN='\033[0;36m'
  BOLD='\033[1m'
  DIM='\033[2m'
  RESET='\033[0m'
else
  GREEN='' RED='' YELLOW='' CYAN='' BOLD='' DIM='' RESET=''
fi

# --- Helpers -----------------------------------------------------------------
json_get() {
  python3 -c "import sys,json; print(json.loads(sys.argv[1]).get(sys.argv[2],''))" "$1" "$2"
}

print_header() {
  # Afficher le bilan de la section precedente si elle avait des tests
  if [ "$SECTION_TOTAL" -gt 0 ]; then
    echo ""
    if [ "$SECTION_FAIL" -eq 0 ]; then
      echo -e "  ${GREEN}${BOLD}$SECTION_PASS/$SECTION_TOTAL passed${RESET}"
    else
      echo -e "  ${RED}${BOLD}$SECTION_FAIL/$SECTION_TOTAL failed${RESET}  ${GREEN}$SECTION_PASS passed${RESET}"
    fi
  fi
  SECTION_PASS=0
  SECTION_FAIL=0
  SECTION_TOTAL=0

  echo ""
  echo -e "${BOLD}================================================================${RESET}"
  echo -e "${BOLD}  $1${RESET}"
  echo -e "${BOLD}================================================================${RESET}"
}

step() {
  echo -e "  ${DIM}->${RESET} $1"
}

run_test() {
  local label="$1"
  local expected_status="$2"
  shift 2
  TOTAL=$((TOTAL + 1))
  SECTION_TOTAL=$((SECTION_TOTAL + 1))

  HTTP_CODE=$(curl -s -o /tmp/curl_body.txt -w "%{http_code}" --max-time 10 "$@")
  BODY=$(cat /tmp/curl_body.txt)

  if [ "$HTTP_CODE" = "$expected_status" ]; then
    echo -e "  ${GREEN}PASS${RESET}  ${label}  ${DIM}(${HTTP_CODE})${RESET}"
    PASS=$((PASS + 1))
    SECTION_PASS=$((SECTION_PASS + 1))
  else
    echo -e "  ${RED}FAIL${RESET}  ${label}  ${RED}got ${HTTP_CODE}, expected ${expected_status}${RESET}"
    echo -e "        ${DIM}$(echo "$BODY" | head -c 200)${RESET}"
    FAIL=$((FAIL + 1))
    SECTION_FAIL=$((SECTION_FAIL + 1))
  fi
}

wait_for_service() {
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
  echo -e "  ${RED}[FATAL] Service non disponible apres ${max_attempts}s sur $url${RESET}"
  exit 1
}

print_section_footer() {
  if [ "$SECTION_TOTAL" -gt 0 ]; then
    echo ""
    if [ "$SECTION_FAIL" -eq 0 ]; then
      echo -e "  ${GREEN}${BOLD}$SECTION_PASS/$SECTION_TOTAL passed${RESET}"
    else
      echo -e "  ${RED}${BOLD}$SECTION_FAIL/$SECTION_TOTAL failed${RESET}  ${GREEN}$SECTION_PASS passed${RESET}"
    fi
  fi
}

# =============================================================================
#  PREPARATION — Service + Authentification
# =============================================================================
print_header "Preparation — Connexion au cluster"

step "python3 disponible ?"
if ! command -v python3 &> /dev/null; then
  echo -e "  ${RED}[FATAL] python3 requis pour parser le JSON${RESET}"
  exit 1
fi
echo -e "  ${GREEN}OK${RESET}"

API="${BASE_URL}/api/v1"

step "Service accessible sur $BASE_URL ?"
wait_for_service "${API}/health"
echo -e "  ${GREEN}OK${RESET} — service en ligne"

AUTH_API="${BASE_URL}/api/v1"

step "Register: ${E2E_EMAIL}"
REG_RESP=$(curl -s -o /tmp/curl_body.txt -w "%{http_code}" --max-time 10 \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${E2E_EMAIL}\",\"password\":\"${E2E_PASSWORD}\",\"username\":\"${E2E_USERNAME}\"}" \
  "${AUTH_API}/auth/register")
REG_BODY=$(cat /tmp/curl_body.txt)

if [ "$REG_RESP" -ge 200 ] && [ "$REG_RESP" -lt 300 ]; then
  echo -e "  ${GREEN}OK${RESET} — user cree (HTTP ${REG_RESP})"
else
  echo -e "  ${RED}[FATAL] Register echoue (HTTP ${REG_RESP}): $(echo "$REG_BODY" | head -c 300)${RESET}"
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
    echo -e "  ${RED}[FATAL] Login OK mais pas de access_token dans la reponse${RESET}"
    echo "  Response: $(echo "$LOGIN_BODY" | head -c 300)"
    exit 1
  fi
  echo -e "  ${GREEN}OK${RESET} — token: ${TOKEN:0:50}..."

  USER_ID=$(python3 -c "
import sys, json, base64
token = sys.argv[1]
payload = token.split('.')[1]
padding = 4 - len(payload) % 4
if padding != 4:
    payload += '=' * padding
data = json.loads(base64.urlsafe_b64decode(payload))
print(data.get('sub', data.get('userId', data.get('id', ''))))
" "$TOKEN")
  if [ -z "$USER_ID" ] || [ "$USER_ID" = "None" ]; then
    echo -e "  ${YELLOW}[WARN] Impossible d'extraire userId du JWT${RESET}"
  else
    echo -e "  ${GREEN}OK${RESET} — userId: ${USER_ID}"
  fi
else
  echo -e "  ${RED}[FATAL] Login echoue (HTTP ${LOGIN_RESP}): $(echo "$LOGIN_BODY" | head -c 300)${RESET}"
  exit 1
fi

AUTH_HEADER="Authorization: Bearer ${TOKEN}"

# =============================================================================
#  TESTS
# =============================================================================
if [ "$RUN_CURL" = true ]; then

  # =========================================================================
  #  1 — SECURITE : toutes les routes bloquees sans token
  # =========================================================================
  print_header "1. Securite — Routes protegees sans token (Gateway RBAC → 403)"

  run_test "GET  /subscriptions/plans" "403" \
    "${API}/subscriptions/plans"

  run_test "GET  /subscriptions/current" "403" \
    "${API}/subscriptions/current"

  run_test "POST /subscriptions/checkout" "403" \
    -X POST -H "Content-Type: application/json" \
    -d '{"planId":"premium","successUrl":"https://app.visiobook.com/success","cancelUrl":"https://app.visiobook.com/pricing"}' \
    "${API}/subscriptions/checkout"

  run_test "POST /subscriptions/payment-intent" "403" \
    -X POST -H "Content-Type: application/json" \
    -d '{"planId":"premium","interval":"month"}' \
    "${API}/subscriptions/payment-intent"

  run_test "POST /subscriptions/cancel" "403" \
    -X POST "${API}/subscriptions/cancel"

  run_test "POST /subscriptions/upgrade" "403" \
    -X POST -H "Content-Type: application/json" \
    -d '{"planId":"enterprise"}' \
    "${API}/subscriptions/upgrade"

  run_test "POST /subscriptions/downgrade" "403" \
    -X POST -H "Content-Type: application/json" \
    -d '{"planId":"premium"}' \
    "${API}/subscriptions/downgrade"

  run_test "GET  /subscriptions/portal" "403" \
    "${API}/subscriptions/portal"

  run_test "GET  /quotas" "403" \
    "${API}/quotas"

  run_test "POST /quotas/consume" "403" \
    -X POST -H "Content-Type: application/json" \
    -d '{"userId":"00000000-0000-0000-0000-000000000000","type":"generation","amount":1}' \
    "${API}/quotas/consume"

  run_test "POST /quotas/reset" "403" \
    -X POST -H "Content-Type: application/json" \
    -d '{"userId":"00000000-0000-0000-0000-000000000000"}' \
    "${API}/quotas/reset"

  run_test "GET  /tokens" "403" \
    "${API}/tokens"

  run_test "POST /tokens/consume" "403" \
    -X POST -H "Content-Type: application/json" \
    -d '{"userId":"00000000-0000-0000-0000-000000000000","amount":1}' \
    "${API}/tokens/consume"

  run_test "POST /webhooks/stripe  (pas de RBAC, securise par signature Stripe → 400)" "400" \
    -X POST -H "Content-Type: application/json" \
    -d '{"type":"checkout.session.completed"}' \
    "${API}/webhooks/stripe"

  # =========================================================================
  #  2 — DECOUVERTE : consulter les plans disponibles
  # =========================================================================
  print_header "2. Decouverte — Consulter les plans disponibles"

  run_test "GET  /subscriptions/plans  → liste des plans" "200" \
    -H "${AUTH_HEADER}" \
    "${API}/subscriptions/plans"

  # =========================================================================
  #  3 — VALIDATION : donnees invalides rejetees (400)
  # =========================================================================
  print_header "3. Validation — Donnees invalides rejetees (→ 400)"

  run_test "POST /subscriptions/checkout       body vide" "400" \
    -X POST -H "Content-Type: application/json" \
    -H "${AUTH_HEADER}" -d '{}' \
    "${API}/subscriptions/checkout"

  run_test "POST /subscriptions/payment-intent  body vide" "400" \
    -X POST -H "Content-Type: application/json" \
    -H "${AUTH_HEADER}" -d '{}' \
    "${API}/subscriptions/payment-intent"

  run_test "POST /subscriptions/upgrade         body vide" "400" \
    -X POST -H "Content-Type: application/json" \
    -H "${AUTH_HEADER}" -d '{}' \
    "${API}/subscriptions/upgrade"

  run_test "POST /subscriptions/downgrade       body vide" "400" \
    -X POST -H "Content-Type: application/json" \
    -H "${AUTH_HEADER}" -d '{}' \
    "${API}/subscriptions/downgrade"

  run_test "POST /quotas/consume                body vide" "400" \
    -X POST -H "Content-Type: application/json" \
    -H "${AUTH_HEADER}" -H "x-api-key: ${API_KEY}" \
    -d '{}' \
    "${API}/quotas/consume"

  run_test "POST /quotas/reset                  userId invalide" "400" \
    -X POST -H "Content-Type: application/json" \
    -H "${AUTH_HEADER}" -H "x-api-key: ${API_KEY}" \
    -d '{"userId":"not-a-uuid"}' \
    "${API}/quotas/reset"

  run_test "POST /tokens/consume                 body vide" "400" \
    -X POST -H "Content-Type: application/json" \
    -H "${AUTH_HEADER}" -H "x-api-key: ${API_KEY}" \
    -d '{}' \
    "${API}/tokens/consume"

  run_test "POST /tokens/consume                 amount = 0" "400" \
    -X POST -H "Content-Type: application/json" \
    -H "${AUTH_HEADER}" -H "x-api-key: ${API_KEY}" \
    -d "{\"userId\":\"${USER_ID:-00000000-0000-4000-a000-000000000001}\",\"amount\":0}" \
    "${API}/tokens/consume"

  # =========================================================================
  #  4 — NOUVEL UTILISATEUR : pas de subscription, quotas par defaut
  # =========================================================================
  print_header "4. Nouvel utilisateur — Aucune subscription active"

  run_test "GET  /subscriptions/current   → aucune subscription" "200" \
    -H "${AUTH_HEADER}" \
    "${API}/subscriptions/current"

  run_test "POST /subscriptions/cancel    → rien a annuler" "404" \
    -X POST -H "${AUTH_HEADER}" \
    "${API}/subscriptions/cancel"

  run_test "POST /subscriptions/upgrade   → pas de subscription" "404" \
    -X POST -H "Content-Type: application/json" \
    -H "${AUTH_HEADER}" -d '{"planId":"enterprise"}' \
    "${API}/subscriptions/upgrade"

  run_test "POST /subscriptions/downgrade → pas de subscription" "404" \
    -X POST -H "Content-Type: application/json" \
    -H "${AUTH_HEADER}" -d '{"planId":"premium"}' \
    "${API}/subscriptions/downgrade"

  run_test "GET  /subscriptions/portal    → pas de customer Stripe" "404" \
    -H "${AUTH_HEADER}" \
    "${API}/subscriptions/portal"

  run_test "GET  /quotas                  → quotas par defaut (free)" "200" \
    -H "${AUTH_HEADER}" \
    "${API}/quotas"

  run_test "GET  /tokens                  → balance Free virtuel (PLAN_FREE_TOKENS)" "200" \
    -H "${AUTH_HEADER}" \
    "${API}/tokens"

  # =========================================================================
  #  5 — SOUSCRIPTION : creer une session checkout (web)
  # =========================================================================
  print_header "5. Souscription — Creer une session checkout Stripe"

  run_test "POST /checkout  premium mensuel     → session creee" "201" \
    -X POST -H "Content-Type: application/json" \
    -H "${AUTH_HEADER}" \
    -d '{"planId":"premium","successUrl":"https://app.visiobook.com/success","cancelUrl":"https://app.visiobook.com/pricing"}' \
    "${API}/subscriptions/checkout"

  run_test "POST /checkout  premium annuel      → session creee" "201" \
    -X POST -H "Content-Type: application/json" \
    -H "${AUTH_HEADER}" \
    -d '{"planId":"premium","successUrl":"https://app.visiobook.com/success","cancelUrl":"https://app.visiobook.com/pricing","interval":"year"}' \
    "${API}/subscriptions/checkout"

  run_test "POST /checkout  enterprise mensuel  → session creee" "201" \
    -X POST -H "Content-Type: application/json" \
    -H "${AUTH_HEADER}" \
    -d '{"planId":"enterprise","successUrl":"https://app.visiobook.com/success","cancelUrl":"https://app.visiobook.com/pricing"}' \
    "${API}/subscriptions/checkout"

  run_test "POST /checkout  plan inexistant     → rejete" "400" \
    -X POST -H "Content-Type: application/json" \
    -H "${AUTH_HEADER}" \
    -d '{"planId":"nonexistent","successUrl":"https://app.visiobook.com/success","cancelUrl":"https://app.visiobook.com/pricing"}' \
    "${API}/subscriptions/checkout"

  run_test "POST /checkout  plan free           → rejete" "400" \
    -X POST -H "Content-Type: application/json" \
    -H "${AUTH_HEADER}" \
    -d '{"planId":"free","successUrl":"https://app.visiobook.com/success","cancelUrl":"https://app.visiobook.com/pricing"}' \
    "${API}/subscriptions/checkout"

  # =========================================================================
  #  6 — QUOTAS SANS SUBSCRIPTION : consume/reset → 404
  # =========================================================================
  if [ -n "$USER_ID" ] && [ "$USER_ID" != "None" ]; then
    print_header "6. Quotas — Sans subscription (pas de record en DB → 404)"

    run_test "POST /quotas/consume  generation → pas de quota" "404" \
      -X POST -H "Content-Type: application/json" \
      -H "${AUTH_HEADER}" -H "x-api-key: ${API_KEY}" \
      -d "{\"userId\":\"${USER_ID}\",\"type\":\"generation\",\"amount\":1}" \
      "${API}/quotas/consume"

    run_test "POST /quotas/reset              → pas de quota" "404" \
      -X POST -H "Content-Type: application/json" \
      -H "${AUTH_HEADER}" -H "x-api-key: ${API_KEY}" \
      -d "{\"userId\":\"${USER_ID}\"}" \
      "${API}/quotas/reset"

    run_test "POST /tokens/consume  sans row  → 404" "404" \
      -X POST -H "Content-Type: application/json" \
      -H "${AUTH_HEADER}" -H "x-api-key: ${API_KEY}" \
      -d "{\"userId\":\"${USER_ID}\",\"amount\":1}" \
      "${API}/tokens/consume"
  else
    print_header "6. Quotas — Sans subscription"
    echo -e "  ${YELLOW}SKIP${RESET}  userId non disponible"
  fi

  # =========================================================================
  #  7 — WEBHOOKS : signature Stripe validee
  # =========================================================================
  print_header "7. Webhooks — Verification signature Stripe"

  run_test "POST /webhooks/stripe  sans header stripe-signature" "400" \
    -X POST -H "Content-Type: application/json" \
    -H "${AUTH_HEADER}" \
    -d '{"type":"checkout.session.completed"}' \
    "${API}/webhooks/stripe"

  run_test "POST /webhooks/stripe  signature invalide" "400" \
    -X POST -H "Content-Type: application/json" \
    -H "${AUTH_HEADER}" \
    -H "stripe-signature: t=123,v1=fake" \
    -d '{"type":"checkout.session.completed"}' \
    "${API}/webhooks/stripe"

  print_section_footer

fi

# =============================================================================
#  8 — PAIEMENT STRIPE E2E (--payment)
# =============================================================================
if [ "$RUN_PAYMENT" = true ]; then

  print_header "8. Paiement Stripe e2e — Payment-intent → confirmation → activation"

  step "Stripe API accessible ?"
  STRIPE_CHECK=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
    "https://api.stripe.com/v1/balance" -u "${STRIPE_SK}:")
  if [ "$STRIPE_CHECK" != "200" ]; then
    echo -e "  ${RED}[FATAL] Stripe API inaccessible ou cle invalide${RESET}"
    exit 1
  fi
  echo -e "  ${GREEN}OK${RESET} — Stripe API (mode test)"

  STRIPE_CUSTOMERS_TO_CLEANUP=()

  simulate_payment() {
    local plan_id="$1"
    local interval="$2"
    local label="$3"

    TOTAL=$((TOTAL + 1))
    SECTION_TOTAL=$((SECTION_TOTAL + 1))
    echo ""
    echo -e "  ${CYAN}${BOLD}[$TOTAL] $label${RESET}  ${DIM}($plan_id / $interval)${RESET}"

    # 8a — Creer la subscription via payment-intent
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
      echo -e "  ${RED}FAIL${RESET}  Echec creation payment-intent"
      echo -e "        ${DIM}$RESPONSE${RESET}"
      FAIL=$((FAIL + 1))
      SECTION_FAIL=$((SECTION_FAIL + 1))
      return
    fi
    echo -e "        clientSecret: ${DIM}${CLIENT_SECRET:0:40}...${RESET}"
    echo -e "        customerId:   ${DIM}$CUSTOMER_ID${RESET}"
    echo -e "        subscription: ${DIM}$SUB_ID${RESET}"

    STRIPE_CUSTOMERS_TO_CLEANUP+=("$CUSTOMER_ID")

    PI_ID="${CLIENT_SECRET%%_secret_*}"

    # 8b — Confirmer le PaymentIntent avec carte test 4242
    step "Confirmer PaymentIntent ${PI_ID} (carte 4242...)"
    CONFIRM_RESPONSE=$(curl -s --max-time 15 -X POST \
      "https://api.stripe.com/v1/payment_intents/${PI_ID}/confirm" \
      -u "${STRIPE_SK}:" \
      -d "payment_method=pm_card_visa")

    PI_STATUS=$(json_get "$CONFIRM_RESPONSE" "status")

    if [ "$PI_STATUS" = "succeeded" ]; then
      echo -e "  ${GREEN}PASS${RESET}  PaymentIntent confirme (status: succeeded)"
      PASS=$((PASS + 1))
      SECTION_PASS=$((SECTION_PASS + 1))
    else
      echo -e "  ${RED}FAIL${RESET}  PaymentIntent status: $PI_STATUS"
      echo -e "        ${DIM}$(echo "$CONFIRM_RESPONSE" | head -c 200)${RESET}"
      FAIL=$((FAIL + 1))
      SECTION_FAIL=$((SECTION_FAIL + 1))
      return
    fi

    # 8c — Attente propagation webhook
    step "Attente propagation webhook (5s)..."
    sleep 5

    # 8d — Verifier la subscription Stripe
    step "Verifier subscription Stripe ${SUB_ID}"
    SUB_RESPONSE=$(curl -s --max-time 10 \
      "https://api.stripe.com/v1/subscriptions/${SUB_ID}" \
      -u "${STRIPE_SK}:")
    SUB_STATUS=$(json_get "$SUB_RESPONSE" "status")
    echo -e "        Stripe status: ${DIM}$SUB_STATUS${RESET}"

    # 8e — Verifier via notre API
    step "GET /subscriptions/current → subscription active ?"
    OUR_RESPONSE=$(curl -s --max-time 10 \
      -H "${AUTH_HEADER}" \
      "${API}/subscriptions/current")
    echo -e "        API response:  ${DIM}$(echo "$OUR_RESPONSE" | head -c 200)${RESET}"
  }

  # --- Scenario : Premium mensuel ---
  simulate_payment "premium" "month" "Scenario: Premium mensuel"

  # --- Post-paiement : quotas (maintenant le record existe) ---
  if [ -n "$USER_ID" ] && [ "$USER_ID" != "None" ]; then
    print_header "9. Post-paiement — Quotas apres activation subscription"

    run_test "GET  /quotas                  → quotas premium" "200" \
      -H "${AUTH_HEADER}" \
      "${API}/quotas"

    run_test "POST /quotas/consume  generation x1 → consomme" "201" \
      -X POST -H "Content-Type: application/json" \
      -H "${AUTH_HEADER}" -H "x-api-key: ${API_KEY}" \
      -d "{\"userId\":\"${USER_ID}\",\"type\":\"generation\",\"amount\":1}" \
      "${API}/quotas/consume"

    run_test "POST /quotas/consume  storage x1    → consomme" "201" \
      -X POST -H "Content-Type: application/json" \
      -H "${AUTH_HEADER}" -H "x-api-key: ${API_KEY}" \
      -d "{\"userId\":\"${USER_ID}\",\"type\":\"storage\",\"amount\":1}" \
      "${API}/quotas/consume"

    run_test "GET  /quotas                  → verifier consommation" "200" \
      -H "${AUTH_HEADER}" \
      "${API}/quotas"

    run_test "POST /quotas/reset            → reinitialiser" "201" \
      -X POST -H "Content-Type: application/json" \
      -H "${AUTH_HEADER}" -H "x-api-key: ${API_KEY}" \
      -d "{\"userId\":\"${USER_ID}\"}" \
      "${API}/quotas/reset"

    run_test "GET  /quotas                  → verifier reset" "200" \
      -H "${AUTH_HEADER}" \
      "${API}/quotas"

    # --- Tokens post-paiement : balance Premium + consume multi-IA + overshoot ---
    run_test "GET  /tokens                  → balance Premium" "200" \
      -H "${AUTH_HEADER}" \
      "${API}/tokens"

    run_test "POST /tokens/consume  80 (elevenlabs-tts)" "201" \
      -X POST -H "Content-Type: application/json" \
      -H "${AUTH_HEADER}" -H "x-api-key: ${API_KEY}" \
      -d "{\"userId\":\"${USER_ID}\",\"amount\":80,\"source\":\"elevenlabs-tts\"}" \
      "${API}/tokens/consume"

    run_test "POST /tokens/consume  50 (openai-gpt)" "201" \
      -X POST -H "Content-Type: application/json" \
      -H "${AUTH_HEADER}" -H "x-api-key: ${API_KEY}" \
      -d "{\"userId\":\"${USER_ID}\",\"amount\":50,\"source\":\"openai-gpt\"}" \
      "${API}/tokens/consume"

    run_test "GET  /tokens                  → verifier cumul" "200" \
      -H "${AUTH_HEADER}" \
      "${API}/tokens"

    run_test "POST /tokens/consume  overshoot → INSUFFICIENT_TOKENS (HTTP 201)" "201" \
      -X POST -H "Content-Type: application/json" \
      -H "${AUTH_HEADER}" -H "x-api-key: ${API_KEY}" \
      -d "{\"userId\":\"${USER_ID}\",\"amount\":999999999}" \
      "${API}/tokens/consume"
  fi

  # --- Cleanup Stripe ---
  if [ "$CLEANUP_STRIPE" = true ] && [ ${#STRIPE_CUSTOMERS_TO_CLEANUP[@]} -gt 0 ]; then
    echo ""
    echo -e "  ${DIM}--- Cleanup Stripe ---${RESET}"
    for cust_id in "${STRIPE_CUSTOMERS_TO_CLEANUP[@]}"; do
      step "Annulation des subscriptions pour customer $cust_id"
      SUBS_LIST=$(curl -s --max-time 10 \
        "https://api.stripe.com/v1/subscriptions?customer=${cust_id}&status=active" \
        -u "${STRIPE_SK}:")
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
        echo -e "        ${DIM}Annulee: $sub_id${RESET}"
      done
    done
    echo -e "  ${GREEN}OK${RESET} — cleanup termine"
  fi

  print_section_footer
fi

# =============================================================================
#  RESULTATS
# =============================================================================
echo ""
echo ""
if [ "$FAIL" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}================================================================${RESET}"
  echo -e "${GREEN}${BOLD}  ALL TESTS PASSED${RESET}"
  echo -e "${GREEN}${BOLD}================================================================${RESET}"
else
  echo -e "${RED}${BOLD}================================================================${RESET}"
  echo -e "${RED}${BOLD}  SOME TESTS FAILED${RESET}"
  echo -e "${RED}${BOLD}================================================================${RESET}"
fi
echo ""
echo -e "  URL:     $BASE_URL"
echo -e "  Total:   ${BOLD}$TOTAL${RESET}"
echo -e "  Pass:    ${GREEN}${BOLD}$PASS${RESET}"
if [ "$FAIL" -gt 0 ]; then
  echo -e "  Fail:    ${RED}${BOLD}$FAIL${RESET}"
else
  echo -e "  Fail:    ${BOLD}$FAIL${RESET}"
fi
echo ""

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
