#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
SITE_ID="${NPCINK_CLOUD_DEV_PORTAL_SITE_ID:-site_smoke}"
MEMBER_EMAIL="${NPCINK_CLOUD_DEV_PORTAL_EMAIL:-portal-demo@example.com}"
SECRET="${NPCINK_CLOUD_DEV_SITE_SECRET:-npcink-cloud-test-secret}"
COMPOSE_PROJECT_NAME="${NPCINK_CLOUD_COMPOSE_PROJECT_NAME:-${COMPOSE_PROJECT_NAME:-npcink-ai-cloud}}"

cd "${ROOT_DIR}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME}" docker compose -f docker-compose.dev.yml run --rm api \
	python -m app.dev.seed_portal_demo \
		--site-id "${SITE_ID}" \
		--email "${MEMBER_EMAIL}" \
		--secret "${SECRET}"
