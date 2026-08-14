export type AdminAuditEvent = {
  event_id?: number;
  account_id?: string;
  site_id?: string;
  key_id?: string;
  subscription_id?: string;
  plan_id?: string;
  plan_version_id?: string;
  scope_kind?: string;
  scope_id?: string;
  event_kind?: string;
  outcome?: string;
  method?: string;
  path?: string;
  trace_id?: string;
  idempotency_key?: string;
  actor_kind?: string;
  actor_ref?: string;
  created_at?: string;
};

export type AdminAuditPagination = {
  limit?: number;
  offset?: number;
  total?: number;
  has_more?: boolean;
  next_offset?: number | null;
  last_offset?: number;
  is_out_of_range?: boolean;
};

export type AdminAuditListPayload = {
  items?: AdminAuditEvent[];
  total?: number;
  pagination?: AdminAuditPagination;
  generated_at?: string;
  diagnostics?: {
    returned_count?: number;
    query_duration_ms?: number;
  };
};

export type AdminAuditQueryData = AdminAuditListPayload & {
  requestKey: string;
  loadedAt: number;
};
