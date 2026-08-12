#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -eq 0 ]; then
	printf '%s\n' \
		'deploy_required=true' \
		'authoritative_cve_required=true' \
		'static_terms_only=false' \
		'docs_only=false' \
		'frontend_only=false' \
		'frontend_required=true' \
		'frontend_backend_contracts_required=false' \
		'frontend_e2e_required=true'
	exit 0
fi

deploy_required=false
authoritative_cve_required=false
static_terms_only=true
docs_only=true
frontend_only=true
frontend_required=false
frontend_backend_contracts_required=false
frontend_e2e_required=false

for changed_file in "$@"; do
	case "${changed_file}" in
		.github/workflows/ci.yml|.github/workflows/deploy-production.yml|Dockerfile*|*/Dockerfile*|docker-compose*.yml|Makefile|deploy/*.sh|deploy/image-lock/*|pyproject.toml|uv.lock|ci/pytest-backend-durations.json|migrations/*|migrations/**/*|app/core/config.py|app/core/db.py|app/core/models.py|app/api/auth.py|scripts/classify-ci-changes.sh|scripts/check-authoritative-cve-ranges.py|scripts/check-first-install-cve-gate.py|scripts/check-release-policy.sh|scripts/production-*|scripts/resolve-production-*|scripts/scan-production-*|scripts/verify-production-*|scripts/verify-release-*|tests/conftest.py|tests/fixtures/*|tests/contract/test_container_image_supply_contract.py|tests/contract/test_exact_release_bundle_contract.py|tests/contract/test_production_release_preflight_contract.py)
			authoritative_cve_required=true
			;;
	esac

	case "${changed_file}" in
		app/domain/commercial/mixins/_account_mixin.py|app/domain/commercial/mixins/_admin_mixin.py)
			frontend_backend_contracts_required=true
			;;
	esac

	case "${changed_file}" in
		frontend/*) ;;
		*) frontend_only=false ;;
	esac

	case "${changed_file}" in
		.github/workflows/ci.yml|frontend/*|package.json|pnpm-lock.yaml|pnpm-workspace.yaml|scripts/classify-ci-changes.sh|scripts/*.js|scripts/*.mjs|scripts/*.cjs)
			frontend_required=true
			;;
		.github/*|.github/**/*|app/*|app/**/*|deploy/*|deploy/**/*|docs/*|docs/**/*|migrations/*|migrations/**/*|site/terms/*|site/terms/**/*|tests/*|tests/**/*|scripts/*.py|scripts/*.sh|Dockerfile*|docker-compose*.yml|pyproject.toml|uv.lock|README.md|AGENTS.md|CONTRIBUTING.md|SECURITY.md)
			;;
		*)
			frontend_required=true
			;;
	esac

	case "${changed_file}" in
		.github/workflows/ci.yml|frontend/*|package.json|pnpm-lock.yaml|scripts/run-cloud-frontend-playwright.js)
			deploy_required=true
			static_terms_only=false
			docs_only=false
			frontend_e2e_required=true
			;;
		site/terms/*)
			deploy_required=true
			docs_only=false
			;;
		.github/workflows/deploy-production.yml|docker-compose*.yml|Dockerfile*|*/Dockerfile*|deploy/*.sh)
			deploy_required=true
			static_terms_only=false
			docs_only=false
			;;
		docs/*.md|docs/**/*.md|deploy/*.md|.github/*.md|.github/**/*.md|README.md|AGENTS.md|CONTRIBUTING.md|SECURITY.md)
			static_terms_only=false
			;;
		.github/*|.github/**/*|docs/*|docs/**/*|tests/*|tests/**/*|deploy/RELEASE_CHECKLIST.md)
			static_terms_only=false
			docs_only=false
			;;
		*)
			deploy_required=true
			static_terms_only=false
			docs_only=false
			;;
	esac
done

printf 'deploy_required=%s\n' "${deploy_required}"
printf 'authoritative_cve_required=%s\n' "${authoritative_cve_required}"
printf 'static_terms_only=%s\n' "${static_terms_only}"
printf 'docs_only=%s\n' "${docs_only}"
printf 'frontend_only=%s\n' "${frontend_only}"
printf 'frontend_required=%s\n' "${frontend_required}"
printf 'frontend_backend_contracts_required=%s\n' "${frontend_backend_contracts_required}"
printf 'frontend_e2e_required=%s\n' "${frontend_e2e_required}"
