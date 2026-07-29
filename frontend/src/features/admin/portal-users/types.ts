import type { AdminMutationReceiptPayload } from '@/components/admin/AdminMutationReceipt';

export type PortalUserItem = {
  principal_id: string;
  email: string;
  status: string;
  session_version: number;
  source: string;
  created_at?: string;
  last_login_at?: string;
  account_id?: string;
  account_name?: string;
  account_status?: string;
  membership_status?: string;
  site_id?: string;
  site_name?: string;
  site_status?: string;
  site_url: string;
  platform_kind: 'wordpress';
  subscription_id?: string;
  subscription_status?: string;
  plan_id?: string;
  package_alias?: string;
  display_package_label?: string;
  qq_bound: boolean;
  qq_binding_count: number;
  qq_last_login_at?: string;
};

export type PortalUsersSummary = {
  active?: number;
  disabled?: number;
  qq_bound?: number;
  self_registered?: number;
};

export type PortalUsersResponse = {
  items?: PortalUserItem[];
  total?: number;
  summary?: PortalUsersSummary;
  pagination?: {
    offset?: number;
    limit?: number;
    total?: number;
    has_more?: boolean;
  };
};

export type PortalUsersQueryData = PortalUsersResponse & {
  requestKey: string;
  loadedAt: number;
};

export type PortalUserAuditEvent = {
  event_id: number;
  event_kind: string;
  outcome: string;
  actor_kind: string;
  actor_ref: string;
  method: string;
  path: string;
  trace_id: string;
  idempotency_key: string;
  scope_kind: string;
  scope_id: string;
  account_id?: string;
  site_id?: string;
  payload?: Record<string, unknown>;
  created_at?: string;
};

export type PortalUserAuditDetail = {
  principal?: {
    principal_id?: string;
    email?: string;
    status?: string;
    session_version?: number;
    last_login_at?: string;
    created_at?: string;
  };
  items?: PortalUserAuditEvent[];
  total?: number;
  summary?: {
    events?: number;
    succeeded?: number;
    failed?: number;
    registration_events?: number;
    disable_events?: number;
    latest_disable_reason?: string;
    latest_disable_revoked_account_memberships?: number;
    latest_disable_revoked_identity_provider_bindings?: number;
  };
};

export type BatchDisableResult = {
  receipt?: AdminMutationReceiptPayload;
  totals?: {
    attempted?: number;
    disabled?: number;
    already_disabled?: number;
    failed?: number;
  };
  items?: Array<{
    principal_id?: string;
    outcome?: string;
    status?: string;
    session_version?: number;
    error_code?: string;
    message?: string;
  }>;
};

export type PortalUserDisableResult = {
  receipt?: AdminMutationReceiptPayload;
  session_version?: number;
};

export type PortalUserFilters = {
  q: string;
  status: string;
  package_alias: string;
  qq_bound: string;
};

export type PortalUserSort = 'access_risk' | 'recent_login' | 'recent_registration';
export type PortalUserRisk = 'access_issue' | 'onboarding' | 'active' | 'disabled';
