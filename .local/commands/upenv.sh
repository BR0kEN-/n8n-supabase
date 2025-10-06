#!/usr/bin/env bash

## [help]
## Update project's ".env", print app config, and configure the stack (autorun by "up").
## [/help]

set -e

DOTENV=".env"

_upenv() {
    # Override to not run the `_get_app_config` by the `help` command.
    is_project_stack_running() {
       return 1
    }

    # Run to include necessary functions into the current shell.
    run_command help >/dev/null
    # Run to have the variables populated into the current shell.
    _get_app_config

    if [[ -n "$SUPABASE_API_URL" ]]; then
        # https://github.com/orgs/supabase/discussions/29260
        if [[ -n "$SUPABASE_DATABASE_URL" ]]; then
            SUPABASE_DB_URL_VARNAME="SUPABASE_DATABASE_URL"
            SUPABASE_ANON_KEY_VARNAME="SUPABASE_PUBLISHABLE_KEY"
            SUPABASE_SERVICE_ROLE_KEY_VARNAME="SUPABASE_SECRET_KEY"
        else
            SUPABASE_DB_URL_VARNAME="SUPABASE_DB_URL"
            SUPABASE_ANON_KEY_VARNAME="SUPABASE_ANON_KEY"
            SUPABASE_SERVICE_ROLE_KEY_VARNAME="SUPABASE_SERVICE_ROLE_KEY"
        fi

        SUPABASE_API_ORIGIN="$(str_split_right "$SUPABASE_API_URL" "://")"
        DB_CONNECTION_STRING="$(str_split_right "${!SUPABASE_DB_URL_VARNAME}" "://")"
        DB_USER_CREDENTIALS="$(str_split_left "$DB_CONNECTION_STRING" "@")"
        DB_HOST_DETAILS="$(str_split_right "$DB_CONNECTION_STRING" "@")"
        DB_HOST_PORT="$(str_split_left "$DB_HOST_DETAILS" "/")"

        set_env "$DOTENV" N8N_URL "$N8N_URL"
        set_env "$DOTENV" N8N_OWNER_EMAIL "$N8N_OWNER_EMAIL"
        set_env "$DOTENV" N8N_OWNER_PASSWORD "$N8N_OWNER_PASSWORD"
        set_env "$DOTENV" SUPABASE_API_URL "$SUPABASE_API_URL"
        set_env "$DOTENV" SUPABASE_ANON_KEY "${!SUPABASE_ANON_KEY_VARNAME}"
        set_env "$DOTENV" SUPABASE_API_HOST "$(str_split_left "$SUPABASE_API_ORIGIN" ":")"
        set_env "$DOTENV" SUPABASE_API_PORT "$(str_split_right "$SUPABASE_API_ORIGIN" ":")"
        set_env "$DOTENV" SUPABASE_SERVICE_ROLE_KEY "${!SUPABASE_SERVICE_ROLE_KEY_VARNAME}"
        set_env "$DOTENV" SUPABASE_DB_TYPE "$(str_split_left "${!SUPABASE_DB_URL_VARNAME}" ":")"
        set_env "$DOTENV" SUPABASE_DB_USER "$(str_split_left "$DB_USER_CREDENTIALS" ":")"
        set_env "$DOTENV" SUPABASE_DB_PASSWORD "$(str_split_right "$DB_USER_CREDENTIALS" ":")"
        set_env "$DOTENV" SUPABASE_DB_HOST "$(str_split_left "$DB_HOST_PORT" ":")"
        set_env "$DOTENV" SUPABASE_DB_PORT "$(str_split_right "$DB_HOST_PORT" ":")"
        set_env "$DOTENV" SUPABASE_DB_NAME "$(str_split_right "$DB_HOST_DETAILS" "/")"

        echo_green "The $DOTENV has been updated."
    else
        echo_red "The Supabase is not running."
        return 1
    fi
}

_configure_n8n() {
    run_n8n_command configure
}

if ! is_project_stack_running; then
    echo_red "The project stack is not running."
    return 11
fi

spinner _upenv "Updating $DOTENV..." && \
spinner _configure_n8n "Configuring N8N..."
