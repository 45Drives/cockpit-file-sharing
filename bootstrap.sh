#!/usr/bin/env bash
# bootstrap.sh

set -e
set -o pipefail
set -x

command -v sponge >/dev/null || { echo "Missing 'sponge'. Please install moreutils." >&2 ; exit 1 ; }

git submodule update --init

jq 'del(.packageManager)' ./package.json | sponge ./package.json

rm .yarnrc.yml .yarn -rf

yarn set version stable

yarn config set nodeLinker node-modules

yarn install

yarn workspaces foreach -A install

yarn build:common
