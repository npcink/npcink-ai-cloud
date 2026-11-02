export const supportTicket = (id = 'sr_synthetic') => ({ request_id: id, account_id: 'acct_synthetic', site_id: 'site_synthetic', principal_id: 'principal_synthetic',
  email: 'synthetic@example.invalid', topic: 'general', title: `Synthetic ticket ${id}`, description: 'Synthetic support evidence',
  status: 'open', priority: 'normal', admin_note: '', created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T01:00:00Z' });
export const supportMessage = (id = 'sr_synthetic') => ({ message_id: 'message_synthetic', request_id: id, account_id: 'acct_synthetic', site_id: 'site_synthetic',
  author_kind: 'operator', visibility: 'public', body: 'Intended reply', created_at: '2026-11-01T02:00:00Z' });
export const supportAttachment = (id = 'sr_synthetic') => ({ attachment_id: 'attachment_synthetic', request_id: id, account_id: 'acct_synthetic', site_id: 'site_synthetic', message_id: '',
  uploader_kind: 'operator', visibility: 'internal', filename: 'proof.txt', content_type: 'text/plain', byte_size: 5, created_at: '2026-11-01T02:00:00Z' });
export const supportDetail = (id = 'sr_synthetic') => ({ request: supportTicket(id), messages: [] as unknown[], attachments: [] as unknown[], feedback: null as unknown });
