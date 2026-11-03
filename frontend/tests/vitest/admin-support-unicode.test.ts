import { expect, it } from 'vitest';
import vectors from '../fixtures/admin-support-unicode.json';
import { hasSupportMessage, normalizeSupportMessage, normalizeSupportFilename, stripSupportWhitespace } from '@/features/admin/support-requests/support-text';
import { readSupportIntent, readSupportWrite, readSupportConfirmation, supportDigest, sha256, operationPath,
  type SupportIntent, type SupportValues } from '@/features/admin/support-requests/detail-evidence';

it.each(vectors.cases)('matches actual Python serializers and restores exact Unicode intent: $name', async sample => {
  expect(normalizeSupportMessage(sample.rawMessage)).toBe(sample.messageResponse.message.body);
  expect(normalizeSupportFilename(sample.rawFilename)).toBe(sample.attachmentResponse.attachment.filename);
  for (const action of ['message', 'attachment'] as const) {
    const response = action === 'message' ? sample.messageResponse : sample.attachmentResponse;
    const body: SupportValues = action === 'message' ? { body: normalizeSupportMessage(sample.rawMessage), visibility: 'public' }
      : { filename: normalizeSupportFilename(sample.rawFilename), content_type: 'text/plain', visibility: 'internal', message_id: '' };
    const values = action === 'message' ? body : { ...body, content_sha256: await sha256(new TextEncoder().encode('proof')) };
    const receipt = response.operation_receipt;
    const intent: SupportIntent = { request_id: response.request.request_id, account_id: response.request.account_id,
      actor_ref: receipt.actor_ref, actor_kind: 'platform_admin', operation_id: receipt.operation_id,
      action, body, values, digest: await supportDigest(action, values), method: 'POST', path: operationPath(response.request.request_id, action),
      created_at: receipt.created_at, revision: 1, ...(action === 'attachment' ? { byte_size: 5 } : {}) };
    expect(intent.digest).toBe(receipt.digest);
    expect(readSupportIntent(JSON.parse(JSON.stringify(intent)), intent.request_id, intent.actor_ref)).toEqual(intent);
    expect(readSupportWrite(response, intent).receipt.digest).toBe(intent.digest);
    expect(readSupportConfirmation({ request_id: intent.request_id, operation_id: intent.operation_id, action, digest: intent.digest,
      state: 'confirmed', result: response }, intent)?.receipt.digest).toBe(intent.digest);
    const noncanonical = action === 'message' ? { ...body, body: `\u0085${body.body}\u001c` } : { ...body, filename: `\u0085${body.filename}` };
    expect(() => readSupportIntent({ ...intent, body: noncanonical, values: { ...values, ...noncanonical } }, intent.request_id, intent.actor_ref)).toThrow();
    expect(() => readSupportWrite({ ...response, operation_receipt: { ...receipt, digest: '0'.repeat(64) } }, intent)).toThrow();
  }
});

it('uses every Python whitespace codepoint and preserves BOM, zero-width and ordinary Unicode', () => {
  for (const cp of vectors.pythonWhitespaceCodepoints) {
    const space = String.fromCodePoint(cp);
    expect(stripSupportWhitespace(`${space}ab${space}`)).toBe('ab');
    expect(normalizeSupportFilename(`${space}a${space}${space}b.txt${space}`)).toBe('a b.txt');
    expect(hasSupportMessage(`${space}a${space}`)).toBe(false);
    expect(hasSupportMessage(`${space}${space}`)).toBe(false);
  }
  for (const preserved of ['\ufeff', '\u200b', '\u180e', '中', '🙂']) expect(stripSupportWhitespace(preserved)).toBe(preserved);
  expect(normalizeSupportMessage('  ab\n\tcd  ')).toBe('ab\n\tcd');
  expect(normalizeSupportFilename('  C:\\folder\\ proof\t file.txt  ')).toBe('proof file.txt');
});

it('uses Python codepoint lengths for validation and filename clipping', () => {
  expect(hasSupportMessage('\u0085🙂\u001c')).toBe(false);
  expect(hasSupportMessage('🙂🙂')).toBe(true);
  expect(hasSupportMessage('🙂'.repeat(4000))).toBe(true);
  expect(hasSupportMessage('🙂'.repeat(4001))).toBe(false);
  expect(normalizeSupportFilename('🙂'.repeat(190) + 'ab.txt')).toBe('🙂'.repeat(190) + 'a');
  expect(normalizeSupportFilename('a'.repeat(190) + ' rest.txt')).toBe('a'.repeat(190));
});
