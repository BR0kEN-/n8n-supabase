#!/usr/bin/env bash

## [help]
## Export tracked N8N workflows or specific ones by providing their IDs.
## [/help]

set -e

run_n8n_command export workflows "$@"
