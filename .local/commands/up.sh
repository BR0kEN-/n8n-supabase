#!/usr/bin/env bash

## [help]
## Start the stack.
## [/help]

set -e

SUPABASE_CONFIG_PATH=supabase/config.toml

_export_and_store() {
    # Update loaded runtime value.
    export "$1=$2"
    # Preserve the computed value.
    set_env .env "$1" "$2"
}

_compute_port() {
    local VARIABLE="$1"
    local VALUE="${!VARIABLE}"

    if ! [[ "$VALUE" =~ ^[0-9]+$ ]]; then
        echo_red "The \"$VARIABLE\" must be defined."
        exit 2
    fi

    # Use the currently configured port if it's
    # free. Find the next available otherwise.
    _export_and_store \
        "$VARIABLE" \
        "$(find_next_free_port "$ADDR_LOCALHOST" "$VALUE")"
}

if ! is_project_stack_running; then
    _compute_port UI_APP_PORT
    _compute_port COMPOSE_APP_PORT

    cp "$SUPABASE_CONFIG_PATH.tpl" "$SUPABASE_CONFIG_PATH"
    replace_in_file \
        "$SUPABASE_CONFIG_PATH" \
        "^project_id[[:blank:]]*=.*" \
        "project_id = \"$COMPOSE_PROJECT_NAME\""

    for VARIABLE in \
        SUPABASE_API_PORT \
        SUPABASE_DB_PORT \
        SUPABASE_DB_SHADOW_PORT \
        SUPABASE_DB_POOLER_PORT \
        SUPABASE_STUDIO_PORT \
        SUPABASE_INBUCKET_PORT \
        SUPABASE_EDGE_RUNTIME_INSPECTOR_PORT \
        SUPABASE_ANALYTICS_PORT \
    ; do
        # About the value (from left to right):
        # - Remove the last 2 digits out of a port (a 5-digit value).
        # - Take the last 2 digits of `COMPOSE_APP_PORT` (unique per stack).
        # - Concatenate.
        #
        # The rationale here is that the Compose stack is always running
        # thus its port is unique. Some of the Supabase services require
        # a port at a certain operation so auto-computing on the stack
        # start isn't an option.
        _export_and_store "$VARIABLE" "${!VARIABLE%??}${COMPOSE_APP_PORT: -2}"
        # Doing this because Supabase config doesn't support
        # integer environment variables.
        # https://github.com/supabase/cli/issues/1551
        replace_in_file "$SUPABASE_CONFIG_PATH" "env($VARIABLE)" "${!VARIABLE}"
    done
fi

npx supabase start

docker compose \
    --file "$SELF_DIR/docker-compose.yml" \
    --project-name "$COMPOSE_PROJECT_NAME" \
    up \
    --detach \
    "$@"

echo
run_command upenv
