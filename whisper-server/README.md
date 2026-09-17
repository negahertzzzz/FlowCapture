# FlowCapture faster-whisper Server

Server locale in Python basato su **`faster-whisper`** (implementazione CTranslate2 fino a 4x più veloce di OpenAI Whisper originale con minore consumo di memoria VRAM/RAM).

Il server espone le API standard compatibili con **OpenAI Audio Transcriptions**:
- `POST /v1/audio/transcriptions`
- `POST /audio/transcriptions`

---

## 🚀 Avvio Rapido

### Su Windows:
Fai doppio clic sul file **`start.bat`** (o eseguilo dal terminale):
```cmd
start.bat
```
Lo script:
1. Crea automaticamente un ambiente virtuale Python dedicato (`venv`).
2. Installa le dipendenze necessarie (`faster-whisper`, `fastapi`, `uvicorn`, `python-multipart`).
3. Avvia il server in ascolto su `http://localhost:8000`.

### Su Linux / macOS:
```bash
chmod +x start.sh
./start.sh
```

---

## ⚙️ Configurazione in FlowCapture

1. Apri **FlowCapture** e vai su **Settings** (Impostazioni).
2. Nella sezione **Trascrizione Audio**:
   - **Base URL Trascrizione**: imposta `http://localhost:8000` (oppure l'IP della tua macchina nella rete locale, es. `http://192.168.1.50:8000`).
   - **Modello Audio**: lascia vuoto oppure imposta il modello che preferisci (es. `small`, `medium`, `large-v3`).
   - **Lingua Trascrizione**: seleziona `Italiano (it)` o la lingua desiderata.

---

## 🔧 Opzioni e Parametri da Riga di Comando

Puoi personalizzare i parametri avviando il server manualmente:

```bash
python server.py --host 0.0.0.0 --port 8000 --model small --device auto --compute-type auto
```

### Parametri disponibili:
- `--port`: Porta TCP di ascolto (predefinita: `8000`).
- `--model`: Modello di default scaricato e utilizzato:
  - `tiny`: ultraleggero (~75 MB), velocissimo.
  - `base`: molto veloce (~145 MB).
  - `small`: **consigliato per CPU e GPU bilanciate** (~480 MB, ottimo equilibrio tra precisione e velocità).
  - `medium`: alta precisione (~1.5 GB).
  - `large-v3`: massima precisione assoluta per italiano e termini tecnici (~3 GB, consigliata GPU NVIDIA).
- `--device`:
  - `auto`: rileva automaticamente se hai una GPU NVIDIA con CUDA; se assente usa la CPU.
  - `cuda`: forza l'uso della GPU NVIDIA.
  - `cpu`: forza l'uso del processore.
- `--compute-type`:
  - `auto`: `float16` se GPU, `int8` se CPU per la massima velocità.
  - `int8`, `float16`, `float32`.

---

## 🧪 Test Rapido del Server

Verifica che il server sia attivo aprendo nel browser o con curl:
```bash
curl http://localhost:8000/health
# Risposta attesa: {"status":"ok"}
```

Test di trascrizione di un file audio via riga di comando:
```bash
curl -X POST http://localhost:8000/v1/audio/transcriptions \
  -F "file=@prova.wav" \
  -F "model=small" \
  -F "language=it"
```
