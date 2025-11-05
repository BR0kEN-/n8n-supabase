#!/usr/bin/env bash

## [help]
## Export tracked N8N workflows.
## [/help]

set -e

echo_yellow 'DEPRECATED: use "n8n-ew" instead!'
run_n8n_command export workflows
