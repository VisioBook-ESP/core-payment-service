#!/usr/bin/env bash
# =============================================================================
# run-tests.sh — Lance build/typecheck/tests dans Docker (leger en RAM)
#
# Usage:
#   ./scripts/run-tests.sh              # typecheck + tous les tests
#   ./scripts/run-tests.sh --typecheck  # typecheck seul
#   ./scripts/run-tests.sh --test       # tous les tests unitaires
#   ./scripts/run-tests.sh --test webhook.service  # un seul fichier
#   ./scripts/run-tests.sh --build      # nest build
#   ./scripts/run-tests.sh --all        # build + typecheck + tests
#
# Si le conteneur app du docker-compose tourne deja, le script l'utilise
# directement (pas de rebuild). Sinon il build une image temporaire.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
IMAGE_NAME="payment-test"

cd "$PROJECT_DIR"

# --- Parse flags -------------------------------------------------------------
RUN_BUILD=false
RUN_TYPECHECK=false
RUN_TEST=false
TEST_PATTERN=""

if [ $# -eq 0 ]; then
  RUN_TYPECHECK=true
  RUN_TEST=true
fi

while [ $# -gt 0 ]; do
  case "$1" in
    --build)     RUN_BUILD=true ;;
    --typecheck) RUN_TYPECHECK=true ;;
    --test)
      RUN_TEST=true
      if [ $# -gt 1 ] && [[ ! "$2" == --* ]]; then
        TEST_PATTERN="$2"
        shift
      fi
      ;;
    --all)
      RUN_BUILD=true
      RUN_TYPECHECK=true
      RUN_TEST=true
      ;;
    *) echo "Flag inconnu: $1"; exit 1 ;;
  esac
  shift
done

# --- Detect running container ------------------------------------------------
USE_COMPOSE=false
CONTAINER_ID=$(docker compose ps -q app 2>/dev/null || true)

if [ -n "$CONTAINER_ID" ]; then
  RUNNING=$(docker inspect -f '{{.State.Running}}' "$CONTAINER_ID" 2>/dev/null || true)
  if [ "$RUNNING" = "true" ]; then
    USE_COMPOSE=true
  fi
fi

# --- Runner helper -----------------------------------------------------------
run_in_docker() {
  if [ "$USE_COMPOSE" = true ]; then
    echo "  (via conteneur app existant)"
    docker compose exec -T app "$@"
  else
    echo "  (via image temporaire $IMAGE_NAME)"
    docker run --rm "$IMAGE_NAME" "$@"
  fi
}

# --- Build image if needed (only when compose not running) -------------------
if [ "$USE_COMPOSE" = false ]; then
  echo ""
  echo "================================================================"
  echo "  Le conteneur app ne tourne pas — build image temporaire..."
  echo "================================================================"
  docker build -f Dockerfile.dev -t "$IMAGE_NAME" . -q
  echo "  Image $IMAGE_NAME prete."
fi

# --- Typecheck ---------------------------------------------------------------
if [ "$RUN_TYPECHECK" = true ]; then
  echo ""
  echo "================================================================"
  echo "  TYPECHECK (tsc --noEmit)"
  echo "================================================================"
  run_in_docker npx tsc --noEmit
  echo "  Typecheck OK"
fi

# --- Build -------------------------------------------------------------------
if [ "$RUN_BUILD" = true ]; then
  echo ""
  echo "================================================================"
  echo "  BUILD (nest build)"
  echo "================================================================"
  run_in_docker npx nest build
  echo "  Build OK"
fi

# --- Tests -------------------------------------------------------------------
if [ "$RUN_TEST" = true ]; then
  echo ""
  echo "================================================================"
  if [ -n "$TEST_PATTERN" ]; then
    echo "  TESTS (pattern: $TEST_PATTERN)"
  else
    echo "  TESTS (tous les tests unitaires)"
  fi
  echo "================================================================"

  JEST_ARGS=(npx jest --no-coverage --runInBand --maxWorkers=1)

  if [ -n "$TEST_PATTERN" ]; then
    JEST_ARGS+=(--testPathPattern="$TEST_PATTERN")
  fi

  run_in_docker "${JEST_ARGS[@]}"
  echo "  Tests OK"
fi

# --- Done --------------------------------------------------------------------
echo ""
echo "================================================================"
echo "  TERMINE"
echo "================================================================"
