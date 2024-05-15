#!/usr/bin/env bash
# bootstrap.sh

set -e
set -o pipefail

git submodule update --init

jq 'del(.packageManager)' ./package.json | sponge ./package.json

rm .yarnrc.yml .yarn -rf

yarn set version stable

yarn config set nodeLinker node-modules

yarn install

yarn workspace @45drives/houston-common install

yarn build:common
