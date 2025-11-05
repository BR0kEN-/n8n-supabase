#!/usr/bin/env bash

set -e

echo_colored() {
    echo -e "\033[$1;3$2m$3\033[0m"
}

echo_yellow() {
    echo_colored 1 3 "$1"
}

echo_green() {
    echo_colored 0 2 "$1"
}

echo_red() {
    echo_colored 0 1 "$1"
}

# Params:
#   1: the value to check the presence of.
#   2: the array to check within.
#
# Example:
#   in_array --dry-run "$@"
in_array() {
    # Spaces surrounding the operands guarantee the exact match.
    local INPUT_ARG

    for INPUT_ARG in "${@:2}"; do
        if [[ "$INPUT_ARG" == "$1" ]]; then
            return 0
        fi
    done

    return 1
}

# Params:
#   1: function to run.
#   2: message to display while loading.
spinner() {
    local PID
    local SPIN="\|/-"
    local TEMP=""
    local FIFO=/tmp/cmd_pipe_$$
    local MESSAGE="$2"
    local MESSAGE_LENGTH=$((${#MESSAGE} + 20))
    local SPINNER_PLACEHOLDER=""

    SPINNER_PLACEHOLDER="$(echo_yellow "[%c]")"
    MESSAGE_LENGTH="$(seq $MESSAGE_LENGTH)"

    _reset() {
        # shellcheck disable=SC2086
        printf "${1:-\b}%.0s" $MESSAGE_LENGTH
    }

    # Hide cursor.
    tput civis
    # Create fifo for capturing the output.
    mkfifo "$FIFO"
    # Run the function.
    "$1" > "$FIFO" &
    # Store the process ID.
    PID=$!
    # Redirect the output.
    exec 3< "$FIFO"
    # Fifo is done.
    rm "$FIFO"

    # Print function's output.
    while IFS= read -r LINE <&3; do
        echo "$LINE"
    done &

    while kill -0 $PID 2>/dev/null; do
        TEMP="${SPIN#?}"
        SPIN="$TEMP${SPIN%"$TEMP"}"
        printf "$SPINNER_PLACEHOLDER %s" "$SPIN" "$MESSAGE"
        _reset
        sleep 0.1
    done

    # Print empty spaces to erase the loading message.
    _reset " "
    # Remove the lines where the loading message was displayed.
    _reset

    # Restore cursor.
    tput cnorm
    # Get function's exit code.
    wait $PID

    return $?
}

# Params:
#   1: the question to ask a confirmation for.
#
# Example:
#   confirmed "Do you want to proceed?"
confirmed() {
    local REPLY
    read -p "$(echo_yellow "$1") (Y/n) " -n 1 -r REPLY

    # The `Enter` key has been hit, assume `Yes`.
    if [[ "$REPLY" == "" ]]; then
        return 0
    fi

    # New line.
    echo

    # Explicit `Yes`.
    if [[ "$REPLY" =~ ^[Yy]$ ]]; then
        return 0
    # Explicit `No`.
    elif [[ "$REPLY" =~ ^[Nn]$ ]]; then
        return 1
    # Invalid reply, keep asking.
    else
        confirmed "$1"
    fi
}

# Confirm the use of an existing variable value or require to input one.
#
# Params:
#   1: a human-readable variable description.
#   2: the name of a variable to define.
#   [3]: the default value for a variable.
#
# Example:
#   var_ensure "First name" FIRST_NAME Jon
#
# Example:
#   var_ensure "Last name" LAST_NAME
var_ensure() {
    local KIND="$1"
    local VARIABLE="$2"
    local VALUE="${!VARIABLE:-$3}"

    if [[ -z "$VALUE" ]] || ! confirmed "Use \"$VALUE\" $KIND?"; then
        # Require providing a value in case it's not
        # yet assigned or its use wasn't confirmed.
        read -p "$(echo_green "$KIND: ")" -r VALUE
    fi

    if [[ -z "$VALUE" ]]; then
        # The value has been neither provided nor confirmed.
        # Loop the call until the value is determined.
        var_ensure "$@"
    else
        # Assign the variable with a determined value.
        export "$VARIABLE=$VALUE"
    fi
}

# Params:
#   1: the path to file.
#   2: the section name.
#   [3]: the prefix for each line.
parse_file_docs_section() {
    local COLLECTING
    local DESCRIPTION=()

    while read -r LINE; do
        if [[ "$LINE" =~ \#([[:space:]]+)?\["$2"] ]]; then
            COLLECTING=true
            continue
        fi

        if [[ "$LINE" =~ \#([[:space:]]+)?\[/"$2"] ]]; then
            unset COLLECTING
            break
        fi

        if [[ -n "$COLLECTING" ]]; then
            # Delete all leading "#" characters.
            LINE="${LINE#"${LINE%%[!#]*}"}"
            # Delete all leading whitespaces.
            LINE="${LINE#"${LINE%%[![:space:]]*}"}"
            DESCRIPTION+=("$3$LINE")
        fi
    done < "$1"

    echo "${DESCRIPTION[@]}"
}

is_project_stack_running() {
    # Avoid using `--quiet` with `--filter`.
    # See https://github.com/docker/compose/issues/11176
    grep "$COMPOSE_PROJECT_NAME" > /dev/null < <(docker compose ls --quiet) && return 0 || return 1
}

# Params:
#   1: the service name.
get_project_container_id() {
    docker ps \
        -q \
        --no-trunc \
        --filter="label=com.docker.compose.project=$COMPOSE_PROJECT_NAME" \
        --filter="label=com.docker.compose.service=$1" \
        --filter="status=running" 2>/dev/null
}

# Params:
#   1: the IP to check the port at.
#   2: the port to check.
#
# Example:
#   is_port_occupied 127.0.0.1 8000
is_port_occupied() {
    nc -w 3 -z "$1" "$2" > /dev/null 2>&1
}

# Params:
#   1: the IP to check the port at.
#   2: the port to start a lookup from.
#
# Example:
#   find_next_free_port 127.0.0.1 8000
find_next_free_port() {
    local PORT="$2"

    until ! is_port_occupied "$1" "$PORT"; do
        ((PORT+=1))
    done

    echo "$PORT"
}

# Params:
#   1: the file to manipulate.
#   2: the value to replace.
#   3: the value to replace with.
#
# Example:
#   replace_in_file composer.json find replace
replace_in_file() {
    local REGEX="s@$2@$3@g"

    if [[ "$OSTYPE" == darwin* ]]; then
        sed -i '' "$REGEX" "$1"
    else
        sed -i'' "$REGEX" "$1"
    fi
}

# Params:
#   1: the string to split.
#   [2]: the split char (defaults to `:`).
#
# Example: `str_split_left key=value =` will output `key`.
str_split_left() {
    echo "${1%%"${2:-:}"*}"
}

# Params:
#   1: the string to split.
#   [2]: the split char (defaults to `: `).
#
# Example: `str_split_right key=value =` will output `value`.
str_split_right() {
    echo "${1#*"${2:-": "}"}"
}

# Params:
#   1: the file to manipulate.
#   2: the name of a variable.
#   3: the value to assign to a variable.
#
# Example:
#   set_env .env MY_VAR 1234
set_env() {
    local ENV_FILE="$1"
    local VARIABLE="$2"
    local VALUE="$3"

    if [[ -f "$ENV_FILE" ]] && grep -q "^$VARIABLE=" "$ENV_FILE"; then
        replace_in_file "$ENV_FILE" "^$VARIABLE=.*" "$VARIABLE=${VALUE//@/\\@}"
    else
        echo "$VARIABLE=$VALUE" >> "$ENV_FILE"
    fi
}

run_n8n_command() {
    if ! is_project_stack_running; then
        echo_red "The project stack is not running."
        return 1
    fi

    docker exec \
        --env ADDR_LOCALHOST="$ADDR_LOCALHOST" \
        --env-file .env \
        --interactive \
        "$COMPOSE_PROJECT_NAME--n8n" \
        /usr/local/lib/node_modules/n8n/host-data/cli.js \
        "$@"
}

run_command() {
    COMMAND_NAME="$1"

    if [[ "$COMMAND_NAME" == "-h" || "$COMMAND_NAME" == "--help" ]]; then
        COMMAND_NAME="help"
    fi

    COMMANDS_DIR="$SELF_DIR/commands"

    if [[ -f "$COMMANDS_DIR/$COMMAND_NAME.sh" ]]; then
        # Delete the first argument, which is the name of the command.
        shift 1
    else
        COMMAND_NAME="help"
    fi

    # shellcheck disable=SC1090
    source "$COMMANDS_DIR/$COMMAND_NAME.sh"
}
