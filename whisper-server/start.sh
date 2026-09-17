#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "============================================================"
echo "  FlowCapture - Server Locale faster-whisper"
echo "============================================================"

if [ ! -d "venv" ]; then
    echo "[1/3] Creazione ambiente virtuale venv..."
    python3 -m venv venv
fi

echo "[2/3] Attivazione ambiente virtuale..."
source venv/bin/activate

echo "[3/3] Verifica dipendenze (faster-whisper, fastapi, uvicorn)..."
pip install --upgrade pip
pip install -r requirements.txt

echo ""
echo "============================================================"
echo " Avvio server su http://localhost:8000 ..."
echo " Base URL Trascrizione: http://localhost:8000"
echo "============================================================"
echo ""

python server.py --host 0.0.0.0 --port 8000 --model small
