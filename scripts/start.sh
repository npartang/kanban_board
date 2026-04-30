#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="pm-app"
CONTAINER_NAME="pm-app"
VOLUME_NAME="pm-data"

echo "Building Docker image '${IMAGE_NAME}'..."
docker build -t "${IMAGE_NAME}" .

echo "Stopping existing container (if any)..."
if docker ps -a --format '{{.Names}}' | grep -Eq "^${CONTAINER_NAME}\$"; then
  docker stop "${CONTAINER_NAME}" >/dev/null 2>&1 || true
  docker rm "${CONTAINER_NAME}" >/dev/null 2>&1 || true
fi

echo "Starting container '${CONTAINER_NAME}' on port 8000..."

ENV_ARGS=()
if [ -f ".env" ]; then
  echo "Using environment from .env"
  ENV_ARGS+=(--env-file .env)
else
  echo "Warning: .env not found — AI features will not work without OPENROUTER_API_KEY."
fi

docker run -d \
  --name "${CONTAINER_NAME}" \
  -p 8000:8000 \
  -v "${VOLUME_NAME}:/app/backend/app" \
  "${ENV_ARGS[@]}" \
  "${IMAGE_NAME}"

echo "App is now running at http://localhost:8000"
echo "Data volume '${VOLUME_NAME}' persists the database across restarts."
