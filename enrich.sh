#!/usr/bin/env bash
# =============================================================================
# enrich.sh — One-command dictionary enrichment
#
# Usage:
#   ./enrich.sh                          # uses default file
#   ./enrich.sh Dict/other_file.json     # uses a different file
#   ./enrich.sh Dict/other_file.json --dry-run   # preview only
#
# Setup (first time only):
#   1. Edit .env and set your OPENAI_API_KEY
#   2. chmod +x enrich.sh
# =============================================================================

set -e  # Exit immediately on any error

# ── Resolve script directory so it works from any location ───────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Load API key from .env ────────────────────────────────────────────────────
ENV_FILE="$SCRIPT_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
    echo "[ERROR] .env file not found at: $ENV_FILE"
    echo "        Create it with: echo 'OPENAI_API_KEY=sk-...' > .env"
    exit 1
fi

# Export variables from .env (ignores comments and blank lines)
set -o allexport
source "$ENV_FILE"
set +o allexport

if [[ -z "$OPENAI_API_KEY" || "$OPENAI_API_KEY" == *"replace-with"* ]]; then
    echo "[ERROR] OPENAI_API_KEY is not set or still placeholder in .env"
    echo "        Edit .env and paste your real key."
    exit 1
fi

# ── Input file (default or from argument) ────────────────────────────────────
DEFAULT_FILE="Dict/chinese_reader_dictionary_backup.json"
INPUT_FILE="${1:-$DEFAULT_FILE}"

# If a path was given, shift so remaining args ($2, $3...) are passed through
if [[ $# -ge 1 ]]; then
    shift
fi

# Resolve to absolute path if relative
if [[ ! "$INPUT_FILE" = /* ]]; then
    INPUT_FILE="$SCRIPT_DIR/$INPUT_FILE"
fi

if [[ ! -f "$INPUT_FILE" ]]; then
    echo "[ERROR] File not found: $INPUT_FILE"
    exit 1
fi

# ── Run inside whisperx conda environment ────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🔤  Dictionary Enrichment"
echo "  📁  File   : $INPUT_FILE"
echo "  🐍  Env    : whisperx (conda)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

conda run -n whisperx --no-capture-output \
    python "$SCRIPT_DIR/enrich_dict.py" "$INPUT_FILE" "$@"
