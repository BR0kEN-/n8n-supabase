#!/usr/bin/env bash

## [help]
## Up the Compose stack.
## [/help]

set -e

docker compose \
    --file "$SELF_DIR/docker-compose.yml" \
    --project-name "$COMPOSE_PROJECT_NAME" \
    up \
    --detach \
    "$@"

echo
run_command upenv
