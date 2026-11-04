import { z } from 'zod';
import { isValidIdempotencyKey } from '@/lib/idempotency';
import { hasSupportMessage, normalizeSupportMessage, normalizeSupportNote, normalizeSupportFilename,
  normalizeSupportContentType, stripSupportWhitespace } from './support-text';

const id = z.string().min(1).refine(v => v.trim() === v);
const time = z.string().refine(v => Number.isFinite(Date.parse(v)));
export const supportPriority = z.enum(['low', 'normal', 'high', 'critical', 'urgent']);
export const supportStatus = z.enum(['open', 'in_progress', 'resolved', 'closed']);
const visibility = z.enum(['public', 'internal']);
const ticket = z.object({ request_id: id, account_id: id, site_id: z.string(), principal_id: z.string(), email: z.string(),
  topic: z.string().min(1), title: z.string(), description: z.string(), status: supportStatus,
  priority: supportPriority, admin_note: z.string(), created_at: time, updated_at: time });
const message = z.object({ message_id: id, request_id: id, account_id: id, site_id: z.string(),
  author_kind: z.enum(['customer', 'operator', 'system']), visibility, body: z.string(), created_at: time });
const attachment = z.object({ attachment_id: id, request_id: id, account_id: id, site_id: z.string(), message_id: z.string(),
  uploader_kind: z.enum(['customer', 'operator']), visibility, filename: z.string().min(1), content_type: z.string().min(1),
  byte_size: z.number().int().nonnegative(), created_at: time });
const feedback = z.object({ feedback_id: id, request_id: id, account_id: id, site_id: z.string(), resolved: z.boolean(),
  rating: z.number().int().min(1).max(5), comment: z.string(), created_at: time });
export type SupportRequest = z.infer<typeof ticket>;
export type SupportMessage = z.infer<typeof message>;
export type SupportAttachment = z.infer<typeof attachment> & { content_base64?: string };
export type SupportFeedback = z.infer<typeof feedback>;
export type SupportDetail = { request: SupportRequest; messages: SupportMessage[]; attachments: SupportAttachment[];
  feedback: SupportFeedback | null; issues: string[] };
const record = z.record(z.string(), z.unknown());
function owned<T extends { request_id: string; account_id: string; site_id: string }>(v: T, target: SupportRequest): T {
  if (v.request_id !== target.request_id || v.account_id !== target.account_id || v.site_id !== target.site_id) throw new Error('Wrong support child target');
  return v;
}
export function readSupportRequest(value: unknown, requestId: string): SupportRequest {
  const parsed = ticket.parse(value);
  if (parsed.request_id !== requestId) throw new Error('Wrong support target');
  return parsed;
}
export function readSupportDetail(value: unknown, requestId: string): SupportDetail {
  const raw = record.parse(value), request = readSupportRequest(raw.request, requestId), issues: string[] = [];
  function children<T extends { request_id: string; account_id: string; site_id: string }>(key: string, schema: z.ZodType<T>, keyOf: (v: T) => string): T[] {
    if (!Array.isArray(raw[key])) { issues.push(key); return []; }
    const parsed: T[] = [], seen = new Set<string>();
    for (const [index, child] of raw[key].entries()) {
      try {
        const v = owned(schema.parse(child), request), childId = keyOf(v);
        if (seen.has(childId)) throw new Error('Duplicate child');
        seen.add(childId); parsed.push(v);
      } catch { issues.push(`${key}[${index + 1}]`); }
    }
    return parsed;
  }
  const messages = children('messages', message, m => m.message_id);
  const attachments = children('attachments', attachment, a => a.attachment_id);
  let parsedFeedback: SupportFeedback | null = null;
  if (raw.feedback !== null) {
    try { parsedFeedback = owned(feedback.parse(raw.feedback), request); } catch { issues.push('feedback'); }
  }
  return { request, messages, attachments, feedback: parsedFeedback, issues };
}

export type SupportAction = 'message' | 'status' | 'attachment';
export type SupportValues = Record<string, string>;
export type SupportIntent = { request_id: string; account_id: string; actor_ref: string; actor_kind: 'platform_admin';
  operation_id: string; action: SupportAction; method: 'POST' | 'PATCH'; path: string; digest: string;
  values: SupportValues; body: SupportValues; created_at: string; revision: number; byte_size?: number };
export const operationPath = (id: string, action: SupportAction) => `/api/admin/support-requests/${encodeURIComponent(id)}${action === 'status' ? '' : action === 'message' ? '/messages' : '/attachments'}`;
const digestPattern = /^[a-f0-9]{64}$/;
export async function supportDigest(action: SupportAction, values: SupportValues): Promise<string> {
  const ordered = Object.fromEntries(Object.entries(values).sort(([a], [b]) => a.localeCompare(b)));
  return sha256(new TextEncoder().encode(JSON.stringify({ action, values: ordered })));
}
export async function sha256(bytes: Uint8Array): Promise<string> {
  const hashed = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(hashed), b => b.toString(16).padStart(2, '0')).join('');
}
export function readSupportIntent(value: unknown, requestId: string, actor: string): SupportIntent {
  const raw = record.parse(value);
  if (raw.request_id !== requestId || raw.actor_ref !== actor || raw.actor_kind !== 'platform_admin'
    || typeof raw.account_id !== 'string' || !raw.account_id || typeof raw.operation_id !== 'string' || !isValidIdempotencyKey(raw.operation_id)
    || !['message', 'status', 'attachment'].includes(String(raw.action)) || typeof raw.digest !== 'string' || !digestPattern.test(raw.digest)
    || raw.path !== operationPath(requestId, raw.action as SupportAction) || raw.method !== (raw.action === 'status' ? 'PATCH' : 'POST')
    || !Number.isSafeInteger(raw.revision) || Number(raw.revision) < 0) throw new Error('Invalid stored support intent');
  time.parse(raw.created_at);
  const messageValues = z.object({ body: z.string().refine(v => hasSupportMessage(v) && normalizeSupportMessage(v) === v), visibility }).strict();
  const statusValues = z.object({ status: supportStatus, admin_note: z.string().refine(v => normalizeSupportNote(v) === v && Array.from(v).length <= 2000) }).strict();
  const attachmentBody = z.object({ filename: z.string().min(1).refine(v => normalizeSupportFilename(v) === v),
    content_type: z.string().min(1).refine(v => normalizeSupportContentType(v) === v), visibility,
    message_id: z.string().refine(v => stripSupportWhitespace(v) === v) }).strict();
  const schema = raw.action === 'message' ? messageValues : raw.action === 'status' ? statusValues : attachmentBody;
  const body = schema.parse(raw.body);
  const values = raw.action === 'attachment'
    ? attachmentBody.extend({ content_sha256: z.string().regex(digestPattern) }).strict().parse(raw.values)
    : schema.parse(raw.values);
  for (const [key, value] of Object.entries(body)) if (values[key as keyof typeof values] !== value) throw new Error('Stored support body changed');
  if (raw.action === 'attachment') z.number().int().min(1).max(5 * 1024 * 1024).parse(raw.byte_size);
  return raw as SupportIntent;
}
function readReceipt(value: unknown, intent: SupportIntent) {
  const r = record.parse(value), suffix = intent.action === 'status' ? '' : intent.action === 'message' ? '/messages' : '/attachments';
  const kind = { message: 'support_request.message_created', status: 'support_request.updated', attachment: 'support_request.attachment_created' }[intent.action];
  if (r.operation_id !== intent.operation_id || r.request_id !== intent.request_id || r.action !== intent.action || r.digest !== intent.digest
    || r.actor_kind !== intent.actor_kind || r.actor_ref !== intent.actor_ref || r.method !== intent.method
    || r.path !== `/internal/service/admin/support-requests/${intent.request_id}${suffix}` || r.event_kind !== kind
    || typeof r.event_id !== 'number' || !Number.isSafeInteger(r.event_id) || r.event_id < 1) throw new Error('Invalid support receipt');
  time.parse(r.created_at);
  return r;
}
export function readSupportWrite(value: unknown, intent: SupportIntent, historical = false) {
  const raw = record.parse(value), request = readSupportRequest(raw.request, intent.request_id);
  if (request.account_id !== intent.account_id) throw new Error('Wrong support account');
  const receipt = readReceipt(raw.operation_receipt, intent);
  let savedMessage: SupportMessage | null = null, savedAttachment: SupportAttachment | null = null;
  if (intent.action === 'message') {
    savedMessage = owned(message.parse(raw.message), request);
    if (savedMessage.author_kind !== 'operator' || savedMessage.message_id !== receipt.message_id
      || savedMessage.body !== intent.values.body || savedMessage.visibility !== intent.values.visibility) throw new Error('Wrong submitted message');
  } else if (intent.action === 'attachment') {
    savedAttachment = owned(attachment.parse(raw.attachment), request);
    if (savedAttachment.uploader_kind !== 'operator' || savedAttachment.attachment_id !== receipt.attachment_id
      || savedAttachment.filename !== intent.values.filename || savedAttachment.content_type !== intent.values.content_type
      || savedAttachment.message_id !== intent.values.message_id || savedAttachment.visibility !== intent.values.visibility
      || savedAttachment.byte_size !== intent.byte_size) throw new Error('Wrong submitted attachment');
  } else if (!historical && request.status !== intent.values.status) throw new Error('Wrong submitted status');
  const delivery = record.safeParse(raw.notification);
  return { request, message: savedMessage, attachment: savedAttachment, receipt,
    delivered: delivery.success && typeof delivery.data.delivered === 'boolean' ? delivery.data.delivered : null };
}
export function readSupportConfirmation(value: unknown, intent: SupportIntent) {
  const raw = record.parse(value);
  if (raw.request_id !== intent.request_id || raw.operation_id !== intent.operation_id || raw.action !== intent.action || raw.digest !== intent.digest) throw new Error('Wrong support confirmation');
  if (raw.state === 'unconfirmed' && raw.result === null) return null;
  if (raw.state !== 'confirmed') throw new Error('Invalid support confirmation');
  return readSupportWrite(raw.result, intent, true);
}
export function readSupportDownload(value: unknown, target: SupportAttachment, request: SupportRequest): SupportAttachment {
  const raw = record.parse(value), parsed = owned(attachment.parse(raw.attachment), request);
  const content = record.parse(raw.attachment).content_base64;
  if (parsed.attachment_id !== target.attachment_id || parsed.filename !== target.filename || parsed.visibility !== target.visibility
    || parsed.byte_size !== target.byte_size || parsed.content_type !== target.content_type || typeof content !== 'string'
    || atob(content).length !== parsed.byte_size) throw new Error('Wrong support download');
  return { ...parsed, content_base64: content };
}
