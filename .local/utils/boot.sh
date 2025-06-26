#!/usr/bin/env bash

set -e

_ensure_env() {
    local _PATH="${1:-.}/.env"

    if [[ ! -f "$_PATH" ]]; then
        cp "$_PATH.example" "$_PATH"
    fi

    # shellcheck disable=SC1090
    source "$_PATH"
}

# Load internal configs.
_ensure_env "$SELF_DIR"
# Go to the project root.
cd ..
# Load project configs.
_ensure_env .

# Do what `docker compose` does to determine the project name.
# shellcheck disable=SC2034
read -r COMPOSE_PROJECT_NAME < <(sed 's/[^-_a-z0-9]//g' < <(basename "$PWD"))

export ADDR_LOCALHOST="127.0.0.1"
export N8N_OWNER_EMAIL="node.mation+localhost@local.com"
export N8N_OWNER_PASSWORD="n8nAdmin@123"
# Either the default one or computed and stored in the `.env`.
export UI_APP_PORT="${UI_APP_PORT:-8100}"
export COMPOSE_APP_PORT="${COMPOSE_APP_PORT:-54100}"
export SUPABASE_API_PORT="${SUPABASE_API_PORT:-54200}"
export SUPABASE_DB_PORT="${SUPABASE_DB_PORT:-54300}"
export SUPABASE_DB_SHADOW_PORT="${SUPABASE_DB_SHADOW_PORT:-54400}"
export SUPABASE_DB_POOLER_PORT="${SUPABASE_DB_POOLER_PORT:-54500}"
export SUPABASE_STUDIO_PORT="${SUPABASE_STUDIO_PORT:-54600}"
export SUPABASE_INBUCKET_PORT="${SUPABASE_INBUCKET_PORT:-54700}"
export SUPABASE_EDGE_RUNTIME_INSPECTOR_PORT="${SUPABASE_EDGE_RUNTIME_INSPECTOR_PORT:-54800}"
export SUPABASE_ANALYTICS_PORT="${SUPABASE_ANALYTICS_PORT:-54900}"
