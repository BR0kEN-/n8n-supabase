#!/usr/bin/env bash

set -e

IFS=, read -ra STACK_REQUIRED_VARIABLES <<< "$STACK_REQUIRED_VARIABLES"

for REQUIRED_VARIABLE in "${STACK_REQUIRED_VARIABLES[@]}"; do
    if [[ -z "${!REQUIRED_VARIABLE}" ]]; then
        echo_red "Please set the \"$REQUIRED_VARIABLE\" variable in the .env file."
        return 2
    fi
done
