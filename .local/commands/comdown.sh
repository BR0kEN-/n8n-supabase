#!/usr/bin/env bash

## [help]
## Down the Compose stack.
## [/help]

set -e

docker compose \
    --file "$SELF_DIR/docker-compose.yml" \
    --project-name "$COMPOSE_PROJECT_NAME" \
    down \
    "$@"
