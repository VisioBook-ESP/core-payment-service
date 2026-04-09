#!/usr/bin/env bash
# =============================================================================
# test-e2e.sh — Lance tout l'environnement de test e2e en une commande
#
# Usage: ./scripts/test-e2e.sh [--payment] [--curl] [--db]
#   --payment  Lance les tests de paiement e2e (default si aucun flag)
#   --curl     Lance les tests curl fonctionnels
#   --db       Affiche l'etat de la DB apres les tests
#   --all      Lance curl + payment + db
#
# Prerequis: docker, stripe CLI (stripe login fait sur le bon compte)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

STRIPE_SK="${STRIPE_SECRET_KEY:-sk_test_51Sq9o8HhqOObOnmXjmlvI1W2wwaOdIM1hpKQsEGQlL7YEVOLhMVJa5f7WwfWreDUsMalkNdjhQncMQF7QoTabrhW00JkLzdyBf}"
STRIPE_LISTEN_PID=""

# --- Parse flags -------------------------------------------------------------
RUN_PAYMENT=false
RUN_CURL=false
SHOW_DB=false

if [ $# -eq 0 ]; then
  RUN_PAYMENT=true
  SHOW_DB=true
fi

for arg in "$@"; do
  case "$arg" in
    --payment) RUN_PAYMENT=true ;;
    --curl)    RUN_CURL=true ;;
    --db)      SHOW_DB=true ;;
    --all)     RUN_PAYMENT=true; RUN_CURL=true; SHOW_DB=true ;;
    *)         echo "Flag inconnu: $arg"; exit 1 ;;
  esac
done

# --- Cleanup on exit ---------------------------------------------------------
cleanup() {
  if [ -n "$STRIPE_LISTEN_PID" ] && kill -0 "$STRIPE_LISTEN_PID" 2>/dev/null; then
    echo ""
    echo "  Arret de stripe listen (PID $STRIPE_LISTEN_PID)..."
    kill "$STRIPE_LISTEN_PID" 2>/dev/null || true
    wait "$STRIPE_LISTEN_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# --- Helpers -----------------------------------------------------------------
print_step() {
  echo ""
  echo "================================================================"
  echo "  $1"
  echo "================================================================"
}

wait_for_health() {
  local url="$1"
  local max_attempts=30
  local attempt=0
  while [ $attempt -lt $max_attempts ]; do
    if curl -s -o /dev/null -w "" "$url" 2>/dev/null; then
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 1
  done
  echo "  [FATAL] Service non disponible apres ${max_attempts}s"
  exit 1
}

# =============================================================================
#  ETAPE 1 : Demarrer l'infra
# =============================================================================
print_step "ETAPE 1 — Demarrage de l'infra"

cd "$PROJECT_DIR"

echo "  -> docker compose down..."
docker compose down --remove-orphans 2>/dev/null || true

echo "  -> docker compose up (sans webhook secret pour l'instant)..."
docker compose up -d 2>/dev/null

echo "  -> Attente du service..."
wait_for_health "http://localhost:8087/api/v1/health"
echo "  Service pret."

# =============================================================================
#  ETAPE 2 : Demarrer stripe listen et capturer le whsec
# =============================================================================
if [ "$RUN_PAYMENT" = true ]; then
  print_step "ETAPE 2 — Demarrage de Stripe CLI"

  STRIPE_LOG=$(mktemp)

  stripe listen \
    --forward-to localhost:8087/api/v1/webhooks/stripe \
    --api-key "$STRIPE_SK" \
    > "$STRIPE_LOG" 2>&1 &
  STRIPE_LISTEN_PID=$!

  echo "  -> Attente du webhook secret..."
  WHSEC=""
  for i in $(seq 1 15); do
    if grep -q "whsec_" "$STRIPE_LOG" 2>/dev/null; then
      WHSEC=$(grep -o "whsec_[a-f0-9]*" "$STRIPE_LOG" | head -1)
      break
    fi
    sleep 1
  done

  if [ -z "$WHSEC" ]; then
    echo "  [FATAL] Impossible de recuperer le webhook secret"
    cat "$STRIPE_LOG"
    exit 1
  fi

  echo "  Webhook secret: ${WHSEC:0:20}..."
  echo "  Stripe listen PID: $STRIPE_LISTEN_PID"

  # =========================================================================
  #  ETAPE 3 : Redemarrer l'app avec le bon webhook secret
  # =========================================================================
  print_step "ETAPE 3 — Redemarrage de l'app avec le bon STRIPE_WEBHOOK_SECRET"

  docker compose stop app 2>/dev/null
  STRIPE_WEBHOOK_SECRET="$WHSEC" docker compose up -d app 2>/dev/null

  echo "  -> Attente du service..."
  wait_for_health "http://localhost:8087/api/v1/health"
  echo "  Service pret avec le bon webhook secret."
fi

# =============================================================================
#  ETAPE 4 : Nettoyer la DB + Lancer les tests
# =============================================================================
if [ "$RUN_PAYMENT" = true ] || [ "$RUN_CURL" = true ]; then
  print_step "ETAPE 4 — Nettoyage de la base avant les tests"
  docker compose exec -T postgres psql -U payment_app -d payment -q <<'SQL'
DELETE FROM transactions;
DELETE FROM quotas;
DELETE FROM subscriptions;
SQL
  echo "  Base nettoyee."
fi

if [ "$RUN_CURL" = true ]; then
  print_step "ETAPE 4a — Tests curl fonctionnels"
  "$SCRIPT_DIR/curl-tests.sh"
fi

if [ "$RUN_PAYMENT" = true ]; then
  print_step "ETAPE 4b — Tests paiement e2e"
  "$SCRIPT_DIR/curl-payment-e2e.sh"
fi

# =============================================================================
#  ETAPE 5 : Afficher la DB
# =============================================================================
if [ "$SHOW_DB" = true ]; then
  print_step "ETAPE 5 — Etat de la base de donnees"
  docker compose exec -T postgres psql -U payment_app -d payment -c \
    "SELECT user_id, plan_id, status FROM subscriptions;
     SELECT user_id, plan_id, generations_used, generations_limit FROM quotas;
     SELECT user_id, amount, currency, status FROM transactions;"
fi

echo ""
echo "================================================================"
echo "  TERMINE"
echo "================================================================"
