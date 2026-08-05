from __future__ import annotations

SITE_KNOWLEDGE_VECTOR_PROFILE_ID = "site-knowledge.zh.v1"
SITE_KNOWLEDGE_VECTOR_CONNECTION_ID = "site_knowledge_vector_siliconflow"
SITE_KNOWLEDGE_VECTOR_PROVIDER_ID = "siliconflow"
SITE_KNOWLEDGE_VECTOR_PROVIDER_NAME = "SiliconFlow"
SITE_KNOWLEDGE_VECTOR_BASE_URL = "https://api.siliconflow.cn/v1"
SITE_KNOWLEDGE_VECTOR_MODEL_ID = "BAAI/bge-m3"
SITE_KNOWLEDGE_VECTOR_DIMENSIONS = 1024
SITE_KNOWLEDGE_VECTOR_METRIC = "COSINE"
SITE_KNOWLEDGE_VECTOR_PRODUCTION_BACKEND = "zilliz_cloud"
SITE_KNOWLEDGE_VECTOR_LOCAL_TEST_BACKEND = "postgres_json"
SITE_KNOWLEDGE_VECTOR_PROBE_REVISION = "site-knowledge-vector-probe.v1"
SITE_KNOWLEDGE_VECTOR_STORE_CONNECTION_ID = "site_knowledge_vector_zilliz"
SITE_KNOWLEDGE_VECTOR_STORE_PROVIDER_ID = "zilliz"
SITE_KNOWLEDGE_VECTOR_STORE_PROVIDER_NAME = "Zilliz Cloud"
SITE_KNOWLEDGE_VECTOR_STORE_COLLECTION = "site_knowledge_zh_v1"
SITE_KNOWLEDGE_VECTOR_STORE_PROBE_REVISION = "site-knowledge-vector-store-probe.v1"

SITE_KNOWLEDGE_LOCAL_PREVIEW_PROFILE_ID = "site-knowledge.local-preview.v1"
SITE_KNOWLEDGE_LOCAL_PREVIEW_CONNECTION_ID = "ollama_m4_embedding"
SITE_KNOWLEDGE_LOCAL_PREVIEW_PROVIDER_ID = "ollama-m4-embedding"
SITE_KNOWLEDGE_LOCAL_PREVIEW_PROVIDER_NAME = "Ollama M4 Embedding"
SITE_KNOWLEDGE_LOCAL_PREVIEW_BASE_URL = "http://host.docker.internal:11434/v1"
SITE_KNOWLEDGE_LOCAL_PREVIEW_MODEL_ID = "qwen3-embedding:0.6b"
SITE_KNOWLEDGE_LOCAL_PREVIEW_DIMENSIONS = 1024
SITE_KNOWLEDGE_LOCAL_PREVIEW_METRIC = "COSINE"
SITE_KNOWLEDGE_LOCAL_PREVIEW_PROBE_REVISION = (
    "site-knowledge-local-preview-probe.v1"
)

SITE_KNOWLEDGE_VECTOR_VERIFICATION_CONFIG_KEYS = frozenset(
    {
        "site_knowledge_profile_id",
        "site_knowledge_probe_revision",
        "site_knowledge_probe_dimensions",
        "site_knowledge_probe_metric",
        "site_knowledge_vector_store_profile_id",
        "site_knowledge_vector_store_probe_revision",
        "site_knowledge_vector_store_dimensions",
        "site_knowledge_vector_store_metric",
    }
)
