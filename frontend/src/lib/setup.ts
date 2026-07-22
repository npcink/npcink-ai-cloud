export const INSTALLATION_STATES = ['pending', 'initializing', 'complete'] as const;

export type InstallationState = (typeof INSTALLATION_STATES)[number];

export interface SetupStateData {
  installation_state: InstallationState;
  setup_revision: string;
  retry_allowed: boolean;
}

export interface SetupSessionData {
  installation_state: InstallationState;
  setup_revision: string;
  retry_allowed: boolean;
  expires_in_seconds: number;
}

export interface SetupDatabaseInput {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl_mode: 'verify-full';
  ca_pem: string;
}

export interface SetupDatabaseTestData {
  postgres_major_version?: number;
  ssl_mode?: 'verify-full';
  database_empty?: boolean;
  alembic_state?: string;
  latency_ms?: number;
  max_connections?: number;
}

export interface SetupInstallData {
  admin_key: string;
  next_url: '/admin/login';
}

export function isInstallationState(value: unknown): value is InstallationState {
  return typeof value === 'string' && INSTALLATION_STATES.includes(value as InstallationState);
}

export function parseSetupStateEnvelope(payload: unknown): SetupStateData | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const envelope = payload as Record<string, unknown>;
  const meta = envelope.meta;
  if (
    envelope.status !== 'ok' ||
    envelope.error_code !== '' ||
    typeof envelope.message !== 'string' ||
    !envelope.data ||
    typeof envelope.data !== 'object' ||
    !meta ||
    typeof meta !== 'object'
  ) {
    return null;
  }

  const envelopeMeta = meta as Record<string, unknown>;
  if (
    typeof envelopeMeta.trace_id !== 'string' ||
    typeof envelopeMeta.revision !== 'string' ||
    !envelopeMeta.revision.trim()
  ) {
    return null;
  }

  const data = envelope.data as Record<string, unknown>;
  if (
    !isInstallationState(data.installation_state) ||
    typeof data.setup_revision !== 'string' ||
    !data.setup_revision.trim() ||
    typeof data.retry_allowed !== 'boolean'
  ) {
    return null;
  }

  return {
    installation_state: data.installation_state,
    setup_revision: data.setup_revision,
    retry_allowed: data.retry_allowed,
  };
}
