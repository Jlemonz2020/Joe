#!/usr/bin/env bash
set -euo pipefail

base_url="${BASE_URL:-http://127.0.0.1:4432}"
routes=(
  "/"
  "/index.html"
  "/moments.html"
  "/archive.html"
  "/projects.html"
  "/project.html"
  "/post.html"
  "/about.html"
  "/status-lab.html"
)

printf 'Phase 036 route matrix\n'
printf 'base_url=%s\n' "$base_url"

for route in "${routes[@]}"; do
  status="$(curl -sS -o /dev/null -w '%{http_code}' "${base_url}${route}")"
  printf '%s %s\n' "$status" "$route"
  if [[ "$status" != "200" ]]; then
    exit 1
  fi
done
