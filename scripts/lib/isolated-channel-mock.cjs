// Synthetic read-only upstream. No database, Provider, WordPress or installation handler.
const workflowMetadata = {
  workflow_id: 'media_derivative_artifact_generation',
  workflow_version: 'media_derivative_workflow.v1',
  title: 'Media derivative artifact generation',
  summary: 'Retained historical metadata; no execution in this fixture.',
  ability_name: 'npcink-cloud/media-image-transform',
  contract: 'media_job_request.v1', owner: 'cloud_worker', handoff_owner: 'wordpress_local',
  execution_pattern: 'whole_run_offload', storage_mode: 'short_ttl_artifact',
  badges: [{ label: 'whole run offload', status: 'active' }, { label: 'write blocked', status: 'success' }],
  steps: [], stop_conditions: ['Local approval required'],
  direct_wordpress_write: false, requires_operator_review: true,
  fail_closed_behavior: 'return_artifact_unavailable',
};
function responseFor(lane, method, pathname) {
  if (lane !== 'metadata') return null;
  if (method === 'POST' && pathname === '/admin/auth/login') {
    return { data: {}, headers: { 'set-cookie': 'npcink_admin_session_token=isolated-mock-session; HttpOnly; SameSite=Lax; Path=/' } };
  }
  if (method !== 'GET') return null;
  if (pathname === '/admin/session') return { data: {
    principal_id: 'isolated-mock-admin', identity_type: 'platform_admin', role: 'platform_admin',
    auth_mode: 'jwt', transport: 'cookie', revocable: true,
    capabilities: { can_review_diagnostics: true, can_manage_catalog: true },
  } };
  if (pathname === '/internal/service/admin/ai-resources') return { data: { connections: [] } };
  if (pathname === '/internal/service/admin/agent-workflow-metadata') return { data: {
    projection_version: 'cloud-agent-workflow-metadata.v1', projection_kind: 'read_only_runtime_metadata',
    agents: [], workflows: [workflowMetadata],
  } };
  if (pathname === '/internal/service/admin/model-references') return { data: { items: [], total: 0 } };
  if (pathname === '/internal/service/admin/media-observability') return { data: {
    contract_version: 'magick-media-observability-summary-v2',
    generated_at: '2026-10-25T00:00:00Z', workflow_metadata: workflowMetadata,
    window: { hours: 24, start_at: '2026-10-24T00:00:00Z', end_at: '2026-10-25T00:00:00Z' },
    totals: {}, health: {}, timeline: [], formats: [], sites: [], errors: [], recent_failures: [],
  } };
  return null;
}
module.exports = { responseFor };
