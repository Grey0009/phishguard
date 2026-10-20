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
echo -e "${GREEN}${BOLD}✓ PhishGuard Security Intelligence Engine${NC}"
echo -e "  Starting background service & configuring browser extension..."
echo -e "${BOLD}${CYAN}=================================================================${NC}"
echo ""

# Auto-launch browser with extension in background
(
  sleep 1.2
  if [ "$(uname)" = "Darwin" ]; then
    DEF_APP=$(python3 -c "
import subprocess, re
try:
    p = subprocess.run(['defaults', 'read', 'com.apple.LaunchServices/com.apple.launchservices.secure', 'LSHandlers'], capture_output=True, text=True)
    m = re.findall(r'LSHandlerURLScheme = (?:http|https);.*?LSHandlerRoleAll = \"?([^\";\s]+)', p.stdout, re.DOTALL)
    if m:
        b = m[0].lower()
        if 'chrome' in b: print('Google Chrome')
        elif 'brave' in b: print('Brave Browser')
        elif 'edge' in b: print('Microsoft Edge')
        elif 'arc' in b: print('Arc')
        elif 'opera' in b: print('Opera')
except Exception:
    pass
" 2>/dev/null || true)

    if [ -n "$DEF_APP" ] && [ -d "/Applications/$DEF_APP.app" ]; then
      open -a "$DEF_APP" --args --load-extension="$ROOT_DIR/extension" "http://127.0.0.1:8000" 2>/dev/null || true
    elif [ -d "/Applications/Google Chrome.app" ]; then
      open -a "Google Chrome" --args --load-extension="$ROOT_DIR/extension" "http://127.0.0.1:8000" 2>/dev/null || true
    elif [ -d "/Applications/Brave Browser.app" ]; then
      open -a "Brave Browser" --args --load-extension="$ROOT_DIR/extension" "http://127.0.0.1:8000" 2>/dev/null || true
    elif [ -d "/Applications/Microsoft Edge.app" ]; then
      open -a "Microsoft Edge" --args --load-extension="$ROOT_DIR/extension" "http://127.0.0.1:8000" 2>/dev/null || true
    elif [ -d "/Applications/Arc.app" ]; then
      open -a "Arc" --args --load-extension="$ROOT_DIR/extension" "http://127.0.0.1:8000" 2>/dev/null || true
    fi
  elif [ "$(uname)" = "Linux" ]; then
    if command -v xdg-settings >/dev/null 2>&1; then
      DEF_LINUX=$(xdg-settings get default-web-browser 2>/dev/null || true)
      if echo "$DEF_LINUX" | grep -iq "chrome"; then
        google-chrome --load-extension="$ROOT_DIR/extension" "http://127.0.0.1:8000" >/dev/null 2>&1 &
      elif echo "$DEF_LINUX" | grep -iq "brave"; then
        brave-browser --load-extension="$ROOT_DIR/extension" "http://127.0.0.1:8000" >/dev/null 2>&1 &
      elif echo "$DEF_LINUX" | grep -iq "edge"; then
        microsoft-edge --load-extension="$ROOT_DIR/extension" "http://127.0.0.1:8000" >/dev/null 2>&1 &
      fi
    fi
    if command -v google-chrome >/dev/null 2>&1; then
      google-chrome --load-extension="$ROOT_DIR/extension" "http://127.0.0.1:8000" >/dev/null 2>&1 &
    elif command -v brave-browser >/dev/null 2>&1; then
      brave-browser --load-extension="$ROOT_DIR/extension" "http://127.0.0.1:8000" >/dev/null 2>&1 &
    elif command -v chromium-browser >/dev/null 2>&1; then
      chromium-browser --load-extension="$ROOT_DIR/extension" "http://127.0.0.1:8000" >/dev/null 2>&1 &
    fi
  fi
) &

# Copy extension path to clipboard
if command -v pbcopy >/dev/null 2>&1; then
  printf "%s/extension" "$ROOT_DIR" | pbcopy
  echo -e "${GREEN}✓${NC} Extension directory copied to your clipboard!"
elif command -v xclip >/dev/null 2>&1; then
  printf "%s/extension" "$ROOT_DIR" | xclip -selection clipboard 2>/dev/null || true
  echo -e "${GREEN}✓${NC} Extension directory copied to your clipboard!"
elif command -v wl-copy >/dev/null 2>&1; then
  printf "%s/extension" "$ROOT_DIR" | wl-copy 2>/dev/null || true
  echo -e "${GREEN}✓${NC} Extension directory copied to your clipboard!"
fi

# Run backend server in background (no terminal window needed)
if curl -s "http://127.0.0.1:8000/health" >/dev/null 2>&1; then
  echo -e "${GREEN}✓${NC} PhishGuard engine is already running on http://127.0.0.1:8000"
else
  nohup "$VENV_PY" "$BACKEND_DIR/run.py" --host 127.0.0.1 --port 8000 > "$BACKEND_DIR/server.log" 2>&1 &
  echo -e "${GREEN}✓${NC} PhishGuard engine started silently in the background (PID: $!)."
fi

echo ""
echo -e "${BOLD}${GREEN}=================================================================${NC}"
echo -e "${BOLD}              INSTALLATION & BACKGROUND SERVICE READY            ${NC}"
echo -e "${BOLD}${GREEN}=================================================================${NC}"
echo -e "  PhishGuard is running permanently in the background."
echo -e "  No terminal window needs to stay open."
echo -e "  To stop the background service anytime, run:  ${CYAN}./stop.sh${NC}"
echo -e "${BOLD}${GREEN}=================================================================${NC}"
echo ""
exit 0
