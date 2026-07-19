# syntax=docker/dockerfile:1.7

FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV UV_NO_PROGRESS=1
ENV UV_VERSION="0.11.29"
ENV VIRTUAL_ENV=/opt/venv
ENV PATH="${VIRTUAL_ENV}/bin:${PATH}"

WORKDIR /app

ARG PACKAGE_EXTRAS=

RUN case "${PACKAGE_EXTRAS}" in \
        "") ;; \
        "[dev]") ;; \
        "[zilliz]") ;; \
        "[dev,zilliz]") ;; \
        *) echo "Unsupported PACKAGE_EXTRAS: ${PACKAGE_EXTRAS}. Expected empty, [dev], [zilliz], or [dev,zilliz]." >&2; exit 64 ;; \
    esac

COPY pyproject.toml uv.lock README.md alembic.ini ./
COPY scripts/verify-production-python-lock.py ./scripts/verify-production-python-lock.py

RUN --mount=type=secret,id=pip_index_url,required=false \
    --mount=type=secret,id=pip_extra_index_url,required=false \
    --mount=type=secret,id=pip_trusted_host,required=false \
    set -eu; \
    if [ -s /run/secrets/pip_index_url ]; then \
        PIP_INDEX_URL="$(cat /run/secrets/pip_index_url)"; export PIP_INDEX_URL; \
    fi; \
    if [ -s /run/secrets/pip_extra_index_url ]; then \
        PIP_EXTRA_INDEX_URL="$(cat /run/secrets/pip_extra_index_url)"; export PIP_EXTRA_INDEX_URL; \
    fi; \
    if [ -s /run/secrets/pip_trusted_host ]; then \
        PIP_TRUSTED_HOST="$(cat /run/secrets/pip_trusted_host)"; export PIP_TRUSTED_HOST; \
    fi; \
    python -m pip install \
        --no-cache-dir \
        --no-deps \
        --only-binary=:all: \
        --retries 10 \
        --timeout 60 \
        "uv==${UV_VERSION}"; \
    set -- $(uv --version); \
    test "$1" = "uv"; \
    test "$2" = "${UV_VERSION}"; \
    if [ "${PACKAGE_EXTRAS}" = "[dev,zilliz]" ]; then \
        uv export \
            --locked \
            --no-dev \
            --no-emit-project \
            --no-header \
            --format requirements.txt \
            --extra dev --extra zilliz \
            --output-file /tmp/production-python-requirements.txt; \
    elif [ "${PACKAGE_EXTRAS}" = "[dev]" ]; then \
        uv export \
            --locked \
            --no-dev \
            --no-emit-project \
            --no-header \
            --format requirements.txt \
            --extra dev \
            --output-file /tmp/production-python-requirements.txt; \
    elif [ "${PACKAGE_EXTRAS}" = "[zilliz]" ]; then \
        uv export \
            --locked \
            --no-dev \
            --no-emit-project \
            --no-header \
            --format requirements.txt \
            --extra zilliz \
            --output-file /tmp/production-python-requirements.txt; \
    else \
        uv export \
            --locked \
            --no-dev \
            --no-emit-project \
            --no-header \
            --format requirements.txt \
            --output-file /tmp/production-python-requirements.txt; \
    fi; \
    python -m venv "${VIRTUAL_ENV}"; \
    "${VIRTUAL_ENV}/bin/python" -m pip install \
        --no-cache-dir \
        --only-binary=:all: \
        --retries 10 \
        --timeout 60 \
        --require-hashes \
        --requirement /tmp/production-python-requirements.txt; \
    "${VIRTUAL_ENV}/bin/python" -m pip check; \
    "${VIRTUAL_ENV}/bin/python" scripts/verify-production-python-lock.py \
        --requirements /tmp/production-python-requirements.txt \
        --uv-lock uv.lock \
        --package-extras "${PACKAGE_EXTRAS}" \
        --uv-version "${UV_VERSION}" \
        --write-manifest /tmp/production-python-lock.json

FROM python:3.12-slim

ARG PACKAGE_EXTRAS=

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV VIRTUAL_ENV=/opt/venv
ENV PATH="${VIRTUAL_ENV}/bin:${PATH}"

WORKDIR /app

RUN groupadd --system app \
    && useradd --system --gid app --create-home --home-dir /home/app app \
    && mkdir -p /app/.runtime /var/lib/npcink-ai-cloud/artifacts \
        /usr/local/share/npcink-ai-cloud \
    && chown -R app:app /app/.runtime /home/app /var/lib/npcink-ai-cloud/artifacts

COPY --from=builder /opt/venv /opt/venv
COPY --from=builder /tmp/production-python-requirements.txt /usr/local/share/npcink-ai-cloud/requirements.lock.txt
COPY --from=builder /tmp/production-python-lock.json /usr/local/share/npcink-ai-cloud/production-python-lock.json
COPY pyproject.toml uv.lock README.md alembic.ini ./
COPY app ./app
COPY migrations ./migrations
COPY deploy ./deploy
COPY scripts ./scripts

RUN PYTHONPATH=/app python scripts/verify-production-python-lock.py \
        --requirements /usr/local/share/npcink-ai-cloud/requirements.lock.txt \
        --uv-lock /app/uv.lock \
        --package-extras "${PACKAGE_EXTRAS}" \
        --uv-version "0.11.29" \
        --check-manifest /usr/local/share/npcink-ai-cloud/production-python-lock.json \
        --import-app

USER app

CMD ["uvicorn", "app.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
