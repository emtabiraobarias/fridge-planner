#!/bin/bash
set -e
exec holodeck serve /app/agent.yaml \
    --host 0.0.0.0 \
    --port "${HOLODECK_PORT:-8002}" \
    --protocol "${HOLODECK_PROTOCOL:-rest}"
