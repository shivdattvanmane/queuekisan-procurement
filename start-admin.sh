#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/apps/admin"
npm install
npm run dev
