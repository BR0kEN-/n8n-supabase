#!/usr/bin/env bash

## [help]
## Export specific N8N credentials by their IDs.
## [/help]

set -e

if [[ $# -eq 0 ]]; then
    echo_red "At least one credential ID must be provided."
    exit 1
fi

run_n8n_command export credentials "$@"
