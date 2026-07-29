export type SupportRequestStatus =
  | 'open'
  | 'in_progress'
  | 'resolved'
  | 'closed';

export type SupportRequestSort = 'risk' | 'updated_at';
export type SupportRequestRisk = 'critical' | 'warning' | 'monitor' | 'stable';

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
  summary?: { open?: number; in_progress?: number };
};

export type SupportRequestsQueryData = SupportRequestListPayload & {
  requestKey: string;
  loadedAt: number;
};

export type SupportRequestFilters = {
  q: string;
  status: string;
  topic: string;
};

export type SupportRequestUpdateInput = {
  requestId: string;
  status: SupportRequestStatus;
  adminNote: string;
};
