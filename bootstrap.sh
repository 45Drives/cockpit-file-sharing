#!/usr/bin/env bash

set -e
set -o pipefail

git submodule update --init

jq 'del(.packageManager)' ./package.json | sponge ./package.json

yarn set version stable

yarn config set nodeLinker node-modules

yarn

yarn build:common
