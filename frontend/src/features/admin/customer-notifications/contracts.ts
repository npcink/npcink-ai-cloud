import { z } from 'zod';

export const noticeId = z.string().regex(/^notice_[a-f0-9]{32}$/);
export const links = [
  '',
  '/portal',
  '/portal/account',
  '/portal/billing',
  '/portal/usage',
  '/portal/support',
] as const;
export const valuesSchema = z.object({
  dispatch_id: noticeId,
  title: z.string().max(255),
  body: z.string().max(4000),
  link_href: z.enum(links),
  audience: z.enum(['selected', 'all']),
  account_ids: z.array(z.string().min(1).max(191)).max(1000),
});
export type NoticeValues = z.infer<typeof valuesSchema>;
const count = z.number().int().nonnegative();
const summaryFields = z.object({
  dispatch_id: noticeId,
  title: z.string(),
  body: z.string(),
  link_href: z.enum(links),
  audience: z.enum(['selected', 'all']),
  status: z.enum(['preview', 'sent']),
  actor_kind: z.string(),
  actor_ref: z.string(),
  created_at: z.string(),
  sent_at: z.string().nullable(),
  target_count: count,
  ready_count: count,
  sent_count: count,
  read_count: count,
  skipped_count: count,
  failed_count: z.literal(0),
});
export const summarySchema = summaryFields.superRefine((notice, context) => {
  if (notice.target_count > 1000 ||
      notice.ready_count + notice.sent_count + notice.skipped_count !== notice.target_count ||
      notice.read_count > notice.sent_count ||
      (notice.status === 'sent' && (notice.ready_count !== 0 || !notice.sent_at)) ||
      (notice.status === 'preview' && (notice.sent_count !== 0 || notice.sent_at !== null))) {
    context.addIssue({ code: 'custom', message: 'Invalid notice summary' });
  }
});
export const detailSchema = summaryFields
  .extend({
    recipients: z.array(
      z.object({
        account_id: z.string(),
        account_name: z.string(),
        principal_id: z.string(),
        email: z.string(),
        status: z.enum(['ready', 'sent', 'skipped']),
        reason: z.enum([
          '',
          'account_inactive',
          'owner_ambiguous',
          'recipient_inactive',
          'recipient_email_invalid',
          'recipient_changed',
        ]),
        notification_id: z.string().optional(),
        is_read: z.boolean(),
      }),
    ),
  })
  .superRefine((notice, context) => {
    const recipients = notice.recipients;
    if (
      recipients.length !== notice.target_count ||
      notice.target_count > 1000 ||
      new Set(recipients.map((item) => item.account_id)).size !== recipients.length ||
      recipients.filter((item) => item.status === 'ready').length !== notice.ready_count ||
      recipients.filter((item) => item.status === 'sent').length !== notice.sent_count ||
      recipients.filter((item) => item.status === 'skipped').length !== notice.skipped_count ||
      recipients.filter((item) => item.is_read).length !== notice.read_count ||
      notice.read_count > notice.sent_count ||
      recipients.some((item) =>
        item.status === 'sent'
          ? !item.notification_id || !item.principal_id || !item.email || item.reason !== ''
          : Boolean(item.notification_id) || item.is_read || (item.status === 'ready' ? item.reason !== '' : item.reason === '')
      ) ||
      (notice.status === 'sent' && (notice.ready_count !== 0 || !notice.sent_at)) ||
      (notice.status === 'preview' && (notice.sent_count !== 0 || notice.sent_at !== null))
    ) {
      context.addIssue({ code: 'custom', message: 'Invalid notice delivery evidence' });
    }
  });
export type NoticeDetail = z.infer<typeof detailSchema>;
export const historySchema = z.object({
  items: z.array(summarySchema),
  total_count: count,
  limit: count,
  offset: count,
});
export type NoticeHistory = z.infer<typeof historySchema>;
export const draftSchema = z.object({
  values: valuesSchema,
  pending: z.enum(['', 'preview', 'send']),
});
export type NoticeDraft = z.infer<typeof draftSchema>;
export const freshNotice = (accountId: string): NoticeValues => ({
  dispatch_id: `notice_${crypto.randomUUID().replaceAll('-', '')}`,
  title: '',
  body: '',
  link_href: '',
  audience: 'selected',
  account_ids: accountId ? [accountId] : [],
});

export function readDetail(raw: unknown, values?: NoticeValues, actor?: string): NoticeDetail {
  const result = detailSchema.parse(raw);
  if (actor && (result.actor_kind !== 'platform_admin' || result.actor_ref !== actor)) {
    throw new Error('Notice does not match the active operator');
  }
  if (
    values &&
    (result.dispatch_id !== values.dispatch_id ||
      result.title !== values.title.trim() ||
      result.body !== values.body.trim() ||
      result.link_href !== values.link_href ||
      result.audience !== values.audience ||
      (values.audience === 'selected' &&
        [...values.account_ids].sort().join('\n') !==
          result.recipients
            .map((row) => row.account_id)
            .sort()
            .join('\n')))
  ) {
    throw new Error('Notice does not match the submitted intent');
  }
  return result;
}
