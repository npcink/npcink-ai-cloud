export type SupportRequestStatus =
  | 'open'
  | 'in_progress'
  | 'resolved'
  | 'closed';

export type SupportRequestSort = 'risk' | 'updated_at';
export type SupportRequestRisk = 'critical' | 'warning' | 'monitor' | 'stable';
export type SupportRequestAttention = '' | 'waiting_for_operator' | 'overdue';
export type SupportRequestWaitingOn = 'operator' | 'customer' | 'none';

export type SupportRequest = {
  request_id: string;
  account_id: string;
  site_id?: string;
  principal_id?: string;
  email: string;
  topic: string;
  title: string;
  description: string;
  status: SupportRequestStatus;
  priority: string;
  admin_note?: string;
  first_operator_response_at?: string;
  last_customer_activity_at?: string;
  last_operator_public_activity_at?: string;
  waiting_on?: SupportRequestWaitingOn;
  waiting_since?: string;
  created_at?: string;
  updated_at?: string;
};

export type SupportRequestListPayload = {
  items?: SupportRequest[];
  pagination?: {
    total?: number;
    limit?: number;
    offset?: number;
    has_more?: boolean;
  };
  summary?: {
    open?: number;
    in_progress?: number;
    critical?: number;
    warning?: number;
    monitor?: number;
    stable?: number;
    waiting_for_operator?: number;
    waiting_for_customer?: number;
    overdue?: number;
  };
};

export type SupportRequestsQueryData = SupportRequestListPayload & {
  requestKey: string;
  loadedAt: number;
};

export type SupportRequestFilters = {
  q: string;
  status: string;
  topic: string;
  attention: SupportRequestAttention;
};

export type SupportRequestUpdateInput = {
  requestId: string;
  status: SupportRequestStatus;
  adminNote: string;
};
