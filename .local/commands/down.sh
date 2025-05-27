#!/usr/bin/env bash

## [help]
## Stop the stack.
## [/help]

set -e

SUPABASE_ARGS=()

if in_array "-v" "$@" || in_array "--volumes" "$@"; then
    SUPABASE_ARGS+=(--no-backup)
    # Export tracked N8N workflows to not lose them
    # as a result of deleting the volumes.
    # Silencing the non-zero exit code as the stack
    # may be already down.
    run_n8n_command export 1>/dev/null || true
fi

npx supabase stop "${SUPABASE_ARGS[@]}"

docker compose \
    --file "$SELF_DIR/docker-compose.yml" \
    --project-name "$COMPOSE_PROJECT_NAME" \
    down \
    "$@"
