#!/usr/bin/env bash

## [help]
## Print this help message.
## [/help]

set -e

echo "CLI for $(echo_green "$COMPOSE_PROJECT_NAME")."
echo

# shellcheck disable=SC2329
_command_name() {
    basename "${1//.sh/}"
}

# shellcheck disable=SC2329
_command_help() {
    parse_file_docs_section "$1" help
}

_lines() {
    echo_yellow "$1:"
    for ITEM in "${@:3}"; do
        "$2" "$ITEM"
    done
    echo
}

_lines_kv() {
    local KF="$2"
    local VF="$3"

    _kv() {
        printf '  %-50s %s\n' "$(echo_green "$("$KF" "$1")")" "$("$VF" "$1")"
    }

    _lines "$1" _kv "${@:4}"
}

_get_app_config() {
    local VARNAME
    local VARVALUE
    local CONFIG=()

    # Read the real N8N URL.
    # The `IFS='+'` is used to create exactly one entry in the `CONFIG`
    # array as `+` is highly unlikely to meet in the URL.
    IFS='+' read -ra CONFIG < <(docker exec "$COMPOSE_PROJECT_NAME--n8n" sh -c 'echo "N8N_URL: $WEBHOOK_URL"')

    CONFIG+=(
        "N8N_OWNER_EMAIL: $N8N_OWNER_EMAIL"
        "N8N_OWNER_PASSWORD: $N8N_OWNER_PASSWORD"
    )

    while read -r LINE; do
        K="$(str_split_left "$LINE" =)"
        V="$(str_split_right "$LINE" =)"
        V="${V%\"}" # strip the trailing quote
        V="${V#\"}" # strip the leading quote
        CONFIG+=("SUPABASE_$K: $V")
    done < <(run_command supabase status --output env 2>/dev/null)

    # IMPORTANT! The variable label must be distinct as it's used to form
    # the variable name.
    for ITEM in "${CONFIG[@]}"; do
        # Replace spaces with `_` and uppercase the label to make the variable name.
        read -r VARNAME < <(tr '[:lower:]' '[:upper:]' < <(sed "s@[[:space:]]@_@g" < <(str_split_left "$ITEM")))
        read -r VARVALUE < <(str_split_right "$ITEM")
        export "$VARNAME=$VARVALUE"
    done

    _lines_kv "Application config" str_split_left str_split_right "${CONFIG[@]}"
    _lines \
        "Notes" \
        echo \
        "  - Use $(echo_green host.docker.internal) instead of the $(echo_yellow "$ADDR_LOCALHOST") in the N8N."
}

_lines_kv "Commands" _command_name _command_help "$COMMANDS_DIR"/*.sh

if is_project_stack_running; then
    spinner _get_app_config "Loading the application config..."
fi
