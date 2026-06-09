#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="${FLOWCAPTURE_LINUX_IMAGE:-flowcapture-linux-build}"
DOCKERFILE="$ROOT/scripts/linux-build.Dockerfile"
REBUILD=false
BUNDLE=false

for arg in "$@"; do
  case "$arg" in
    --rebuild) REBUILD=true ;;
    --bundle) BUNDLE=true ;;
    -h|--help)
      cat <<'EOF'
Usage: npm run build:linux [-- [--rebuild] [--bundle]]

  Builds/tests FlowCapture on Ubuntu 22.04 inside Docker.

  --bundle   Also run `tauri build` and copy installers to dist-linux/
  --rebuild  Force rebuild of the Docker image

  First image build takes ~10-20 min (apt + Node + Rust).
  Bundle output: dist-linux/deb/, dist-linux/appimage/, etc.
EOF
      exit 0
      ;;
  esac
done

if ! command -v docker >/dev/null 2>&1; then
  echo "error: docker is not installed or not on PATH" >&2
  exit 1
fi

echo "==> Checking Docker daemon..."
if ! docker info >/dev/null 2>&1; then
  echo "error: Docker daemon is not responding. Open Docker Desktop and wait until it says 'Running'." >&2
  exit 1
fi

if [[ "$REBUILD" == true ]] || ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "==> Building Linux image ($IMAGE) from Ubuntu 22.04..."
  echo "    (This downloads packages + Rust — can take 10-20 minutes on first run.)"
  DOCKER_BUILDKIT=1 docker build --progress=plain -f "$DOCKERFILE" -t "$IMAGE" "$ROOT"
else
  echo "==> Using existing image ($IMAGE). Pass --rebuild to rebuild."
fi

if [[ "$BUNDLE" == true ]]; then
  echo "==> Running Linux production bundle inside Docker..."
  docker run --rm \
    -v "$ROOT:/app" \
    -w /app \
    -e CARGO_TARGET_DIR=/tmp/flowcapture-target \
    -e CARGO_INCREMENTAL=0 \
    -e CI=true \
    "$IMAGE" \
    bash -lc '
      set -euo pipefail
      echo "Node: $(node -v)"
      echo "Rust: $(rustc --version)"
      echo "OS:   $(. /etc/os-release && echo "$PRETTY_NAME")"
      npm ci
      npm run tauri:build
      rm -rf /app/dist-linux
      mkdir -p /app/dist-linux
      shopt -s nullglob
      for f in /tmp/flowcapture-target/release/bundle/deb/*.deb; do cp "$f" /app/dist-linux/; done
      for f in /tmp/flowcapture-target/release/bundle/rpm/*.rpm; do cp "$f" /app/dist-linux/; done
      for f in /tmp/flowcapture-target/release/bundle/appimage/*.AppImage; do cp "$f" /app/dist-linux/; done
      echo ""
      echo "Linux bundle artifacts:"
      ls -lh /app/dist-linux/
      echo ""
      echo "Linux bundle succeeded. Files copied to dist-linux/"
    '
  exit 0
fi

echo "==> Running Linux compile/tests inside Docker..."
docker run --rm \
  -v "$ROOT:/app" \
  -w /app \
  -e CARGO_TARGET_DIR=/tmp/flowcapture-target \
  -e CARGO_INCREMENTAL=0 \
  "$IMAGE" \
  bash -lc '
    set -euo pipefail
    echo "Node: $(node -v)"
    echo "Rust: $(rustc --version)"
    echo "OS:   $(. /etc/os-release && echo "$PRETTY_NAME")"
    npm ci
    npm run build
    cd src-tauri
    cargo test
    cargo build
    echo ""
    echo "Linux build succeeded."
  '
