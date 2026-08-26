#!/usr/bin/env bash
set -euo pipefail

echo "installing deps"
bun install
(cd packages/desktop/src-tauri && cargo build)
echo "done"
