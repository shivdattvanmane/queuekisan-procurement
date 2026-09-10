#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/apps/farmer"
python3 -m http.server 5500 --bind 0.0.0.0
