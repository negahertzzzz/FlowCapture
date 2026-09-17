@echo off
title FlowCapture - faster-whisper Server
cd /d "%~dp0"

echo ============================================================
echo   FlowCapture - Server Locale faster-whisper
echo ============================================================
echo.

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRORE] Python non e' installato o non e' presente nel PATH.
    echo Scarica e installa Python da https://www.python.org/ (assicurati di spuntare "Add python.exe to PATH").
    pause
    exit /b 1
)

if not exist "venv\Scripts\activate.bat" (
    echo [1/3] Creazione ambiente virtuale venv...
    python -m venv venv
    if %errorlevel% neq 0 (
        echo [ERRORE] Impossibile creare l'ambiente virtuale venv.
        pause
        exit /b 1
    )
)

echo [2/3] Attivazione ambiente virtuale...
call venv\Scripts\activate.bat

echo [3/3] Verifica dipendenze (faster-whisper, fastapi, uvicorn)...
python -m pip install --upgrade pip
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [ERRORE] Errore durante l'installazione delle dipendenze.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo  Avvio server su http://localhost:8000 ...
echo  Puoi configurare questo URL in FlowCapture nelle Impostazioni:
echo  Base URL Trascrizione: http://localhost:8000
echo ============================================================
echo.

python server.py --host 0.0.0.0 --port 8000 --model large-v3

if %errorlevel% neq 0 (
    echo.
    echo Il server e' terminato con un codice di errore.
    pause
)
