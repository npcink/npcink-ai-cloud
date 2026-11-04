import { describe, expect, it } from 'vitest';
import { readSupportDetail, readSupportDownload, readSupportIntent, readSupportWrite, readSupportConfirmation,
  supportDigest, type SupportIntent } from '@/features/admin/support-requests/detail-evidence';
import { supportDetail, supportTicket, supportMessage, supportAttachment } from '../fixtures/admin-support-detail';

const actor = 'platform:operator-e2e';
const intent = async (): Promise<SupportIntent> => ({ request_id: 'sr_synthetic', account_id: 'acct_synthetic', actor_kind: 'platform_admin', actor_ref: actor,
  operation_id: 'admin_support_test', action: 'message', values: { body: 'Intended reply', visibility: 'public' }, body: { body: 'Intended reply', visibility: 'public' },
  method: 'POST', path: '/api/admin/support-requests/sr_synthetic/messages', digest: await supportDigest('message', { body: 'Intended reply', visibility: 'public' }), created_at: '2026-11-01T01:00:00Z', revision: 1 });
const result = (i: SupportIntent) => ({ request: supportTicket(), message: supportMessage(), operation_receipt: { request_id: i.request_id, operation_id: i.operation_id, action: i.action, digest: i.digest, actor_ref: actor, actor_kind: 'platform_admin', method: 'POST', path: '/internal/service/admin/support-requests/sr_synthetic/messages', event_kind: 'support_request.message_created', event_id: 1, message_id: 'message_synthetic', created_at: i.created_at } });
describe('support detail consumer boundary', () => {
  it.each(['critical', 'urgent'])('accepts existing %s queue priority without disabling detail', priority => {
    const detail = supportDetail(); detail.request.priority = priority;
    expect(readSupportDetail(detail, 'sr_synthetic').request.priority).toBe(priority);
  });
  it('accepts true empty child lists', () => { expect(readSupportDetail(supportDetail(), 'sr_synthetic').issues).toEqual([]); });
  it.each(['request_id', 'status', 'priority', 'created_at'])('rejects invalid request %s', field => {
    const d = supportDetail(); Object.assign(d.request, { [field]: field === 'request_id' ? 'other' : null });
    expect(() => readSupportDetail(d, 'sr_synthetic')).toThrow();
  });
  it('isolates null, invalid, duplicate and foreign children without losing valid evidence', () => {
    const d = supportDetail(); d.messages = [supportMessage(), null, { ...supportMessage(), message_id: 'foreign', request_id: 'other' }, supportMessage()];
    d.attachments = [null, supportAttachment()]; d.feedback = { feedback_id: 'bad' };
    const parsed = readSupportDetail(d, 'sr_synthetic'); expect(parsed.messages).toHaveLength(1); expect(parsed.attachments).toHaveLength(1); expect(parsed.feedback).toBeNull(); expect(parsed.issues).toHaveLength(5);
  });
  it('distinguishes absent/non-array child evidence from a valid empty list', () => {
    const parsed = readSupportDetail({ request: supportTicket(), messages: {}, attachments: null }, 'sr_synthetic'); expect(parsed.issues).toEqual(['messages', 'attachments', 'feedback']);
  });
  it('accepts one exact success and rejects wrong target/body/visibility/receipt', async () => {
    const i = await intent(), good = result(i); expect(readSupportWrite(good, i).message?.message_id).toBe('message_synthetic');
    for (const changed of [
      { ...good, request: supportTicket('other') }, { ...good, message: { ...good.message, request_id: 'other' } },
      { ...good, message: { ...good.message, body: 'other' } }, { ...good, message: { ...good.message, visibility: 'internal' } },
      { ...good, message: { ...good.message, message_id: '' } }, { ...good, operation_receipt: { ...good.operation_receipt, actor_ref: 'other' } },
      { ...good, operation_receipt: { ...good.operation_receipt, operation_id: 'other' } }, { ...good, operation_receipt: null },
    ]) expect(() => readSupportWrite(changed, i)).toThrow();
  });
  it('never treats missing/foreign confirmation or the current same value as success', async () => {
    const i = await intent(), c = { request_id: i.request_id, operation_id: i.operation_id, action: i.action, digest: i.digest, state: 'unconfirmed', result: null };
    expect(readSupportConfirmation(c, i)).toBeNull();
    expect(() => readSupportConfirmation({ ...c, state: 'confirmed', result: { request: supportTicket() } }, i)).toThrow();
    expect(() => readSupportConfirmation({ ...c, operation_id: 'other' }, i)).toThrow();
    expect(readSupportConfirmation({ ...c, state: 'confirmed', result: result(i) }, i)?.message).not.toBeNull();
  });
  it('restores only actor/target-bound valid stored intents', async () => {
    const i = await intent(); expect(readSupportIntent(JSON.parse(JSON.stringify(i)), i.request_id, actor)).toEqual(i);
    for (const [target, currentActor] of [['other', actor], [i.request_id, 'another-user']]) expect(() => readSupportIntent(i, target, currentActor)).toThrow();
    expect(() => readSupportIntent({ ...i, path: '/api/admin/other' }, i.request_id, actor)).toThrow();
  });
  it('validates download ownership, identity, type and actual byte length', () => {
    const a = supportAttachment(), request = readSupportDetail(supportDetail(), 'sr_synthetic').request;
    expect(readSupportDownload({ attachment: { ...a, content_base64: btoa('proof') } }, a, request).byte_size).toBe(5);
    for (const changed of [{ ...a, request_id: 'other' }, { ...a, visibility: 'public' }, { ...a, filename: 'other.txt' }, { ...a, attachment_id: 'other' }, a]) expect(() => readSupportDownload({ attachment: { ...changed, content_base64: btoa('shorter') } }, a, request)).toThrow();
  });
});

it('matches the backend canonical Unicode digest', async () => {
  expect(await supportDigest('message', { visibility: 'internal', body: '合成回复🙂\nnext' })).toBe('1cf37cb02da0934e7291c8e06b7eb498bc9018b79983c78cdc1765cab87f5afd');
});
it('validates attachment receipts and rejects nonminimal or damaged stored attachment intents', async () => {
  const original = await intent();
  const body = { filename: 'proof.txt', content_type: 'text/plain', visibility: 'internal', message_id: '' };
  const values = { ...body, content_sha256: 'a'.repeat(64) };
  const i: SupportIntent = { ...original, action: 'attachment', path: '/api/admin/support-requests/sr_synthetic/attachments', body, values, byte_size: 5, digest: await supportDigest('attachment', values) };
  expect(readSupportIntent(i, i.request_id, actor)).toEqual(i);
  const good = { request: supportTicket(), attachment: supportAttachment(), operation_receipt: { ...result(original).operation_receipt, action: 'attachment', digest: i.digest,
    path: '/internal/service/admin/support-requests/sr_synthetic/attachments', event_kind: 'support_request.attachment_created', attachment_id: 'attachment_synthetic' } };
  expect(readSupportWrite(good, i).attachment?.byte_size).toBe(5);
  for (const changed of [{ ...good.attachment, message_id: 'foreign' }, { ...good.attachment, byte_size: 6 }, { ...good.attachment, content_type: 'application/json' }, { ...good.attachment, visibility: 'public' }]) {
    expect(() => readSupportWrite({ ...good, attachment: changed }, i)).toThrow();
  }
  for (const changed of [{ ...i, body: { ...body, content_base64: 'cHJvb2Y=' } }, { ...i, byte_size: 0 }, { ...i, byte_size: 5 * 1024 * 1024 + 1 },
    { ...i, values: { ...values, content_sha256: '' } }, { ...i, body: { ...body, visibility: 'public' } }]) expect(() => readSupportIntent(changed, i.request_id, actor)).toThrow();
});
it('requires direct status result but accepts historical proof with a later current status', async () => {
  const original = await intent(), values = { status: 'resolved', admin_note: '' };
  const i: SupportIntent = { ...original, action: 'status', path: '/api/admin/support-requests/sr_synthetic', method: 'PATCH', values, body: values, digest: await supportDigest('status', values) };
  const good = { request: { ...supportTicket(), status: 'resolved' }, operation_receipt: { ...result(original).operation_receipt, action: 'status', digest: i.digest,
    method: 'PATCH', path: '/internal/service/admin/support-requests/sr_synthetic', event_kind: 'support_request.updated' } };
  expect(readSupportWrite(good, i).request.status).toBe('resolved');
  const later = { ...good, request: supportTicket() };
  expect(() => readSupportWrite(later, i)).toThrow();
  expect(readSupportConfirmation({ request_id: i.request_id, operation_id: i.operation_id, action: i.action, digest: i.digest, state: 'confirmed', result: later }, i)?.request.status).toBe('open');
});
