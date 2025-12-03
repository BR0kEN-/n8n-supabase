#!/usr/bin/env bash

## [help]
## A Supabase CLI shortcut.
## [/help]

set -e

_EXE=./node_modules/.bin/supabase

if [[ -f "$_EXE" ]]; then
    "$_EXE" "$@"
else
    npx supabase "$@"
fi
