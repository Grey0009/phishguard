#!/usr/bin/env bash
# ==============================================================================
# PhishGuard — 1-Click Interactive Launcher (macOS & Linux)
# Starts backend server and guides browser extension setup.
# ==============================================================================

set -e

# Change to script directory
cd "$(dirname "$0")"
ROOT_DIR="$(pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
VENV_DIR="$BACKEND_DIR/.venv"

# Terminal formatting
BOLD='\033[1m'
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

clear 2>/dev/null || true

echo -e "${CYAN}${BOLD}"
echo "  ╔═══════════════════════════════════════════════════════════════╗"
echo "  ║                                                               ║"
echo "  ║    🛡️   PhishGuard — Zero-Day Security Intelligence Engine     ║"
echo "  ║        Real-Time Heuristic Browser Protection Pipeline         ║"
echo "  ║                                                               ║"
echo "  ╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# 1. Detect Python 3
PYTHON_BIN=""
for cmd in python3 python; do
  if command -v "$cmd" >/dev/null 2>&1; then
    ver=$("$cmd" -c 'import sys; print(sys.version_info[0])' 2>/dev/null || true)
    if [ "$ver" = "3" ]; then
      PYTHON_BIN="$cmd"
      break
    fi
  fi
done

if [ -z "$PYTHON_BIN" ]; then
  echo -e "${RED}[ERROR] Python 3 was not found on your system.${NC}"
  echo "Please install Python 3.10+ from https://www.python.org/downloads/ and try again."
  exit 1
fi

PY_VERSION=$("$PYTHON_BIN" -c 'import sys; print(f"{sys.version_info[0]}.{sys.version_info[1]}")')
echo -e "${GREEN}✓${NC} Detected Python ${BOLD}${PY_VERSION}${NC} ($PYTHON_BIN)"

# 2. Virtual Environment Setup
if [ ! -d "$VENV_DIR" ]; then
  echo -e "${CYAN}→${NC} Initializing dedicated virtual environment in backend/.venv..."
  "$PYTHON_BIN" -m venv "$VENV_DIR"
  echo -e "${GREEN}✓${NC} Virtual environment created."
fi

VENV_PY="$VENV_DIR/bin/python"
VENV_PIP="$VENV_DIR/bin/pip"

# 3. Check and Install Dependencies
DEPS_MARKER="$VENV_DIR/.installed_requirements"
REQ_FILE="$BACKEND_DIR/requirements.txt"

if [ ! -f "$DEPS_MARKER" ] || [ "$REQ_FILE" -nt "$DEPS_MARKER" ]; then
  echo -e "${CYAN}→${NC} Installing backend dependencies (Flask, NumPy, Pillow, Waitress)..."
  "$VENV_PIP" install --upgrade pip --quiet 2>/dev/null || true
  "$VENV_PIP" install -r "$REQ_FILE" --quiet
  touch "$DEPS_MARKER"
  echo -e "${GREEN}✓${NC} Dependencies verified and ready."
else
  echo -e "${GREEN}✓${NC} Dependencies already satisfied."
fi

echo ""
echo -e "${BOLD}${CYAN}=================================================================${NC}"
echo -e "${BOLD}              BROWSER EXTENSION QUICK START GUIDE                ${NC}"
echo -e "${BOLD}${CYAN}=================================================================${NC}"
echo -e "Follow these 2 simple steps to load the extension in your browser:"
echo -e "${BOLD}For Chromium Browsers (Google Chrome, Brave, Microsoft Edge, Opera, Arc):${NC}"
echo -e "  1. Open your browser and navigate to:  ${CYAN}chrome://extensions${NC} (or edge://extensions)"
echo -e "  2. In the top right, turn ${BOLD}ON${NC} the toggle for ${YELLOW}Developer mode${NC}."
echo -e "  3. Click the ${BOLD}Load unpacked${NC} button on the top left."
echo -e "  4. Select this folder:"
echo -e "     ${GREEN}$ROOT_DIR/extension${NC}"
echo ""
echo -e "${BOLD}${CYAN}=================================================================${NC}"
echo -e "${GREEN}${BOLD}✓ Starting PhishGuard Server on http://127.0.0.1:8000 ...${NC}"
echo -e "  (Press ${YELLOW}Ctrl+C${NC} anytime to stop the server)"
echo -e "${BOLD}${CYAN}=================================================================${NC}"
echo ""

# Run backend server
exec "$VENV_PY" "$BACKEND_DIR/run.py" --host 127.0.0.1 --port 8000
