#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="pm-app"

if ! docker ps -a --format '{{.Names}}' | grep -Eq "^${CONTAINER_NAME}\$"; then
  echo "Container '${CONTAINER_NAME}' is not running."
  exit 0
fi

echo "Stopping container '${CONTAINER_NAME}'..."
docker stop "${CONTAINER_NAME}" >/dev/null 2>&1 || true

echo "Removing container '${CONTAINER_NAME}'..."
docker rm "${CONTAINER_NAME}" >/dev/null 2>&1 || true

echo "Container '${CONTAINER_NAME}' has been stopped and removed."

