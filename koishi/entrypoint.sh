#!/usr/bin/env sh
set -eu

chown -R root:root /koishi
if [ ! -e "/koishi/node_modules" ]; then
  yarn
fi

exec "$@"