#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/apps/counter"
npm install
npm run dev
