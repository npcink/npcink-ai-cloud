import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ApiError, resolveUiErrorMessage } from '@/lib/errors';
import { translate, type Locale } from '@/lib/i18n';

const translator = (locale: Locale) => (
  key: string, params?: Record<string, string>, fallback?: string
) => translate(locale, key, params, fallback);
const apiError = (code: string, message = 'provider catalog request failed') => new ApiError({
  statusCode: 502, errorCode: code, message, traceId: 'trace-preserved',
});

describe('localized UI errors', () => {
  it.each([
    ['client.network_error', '无法连接云端服务'],
    ['client.request_timeout', '云端服务请求超时'],
    ['provider_connection.auth_failed', '供应商认证失败'],
    ['provider.auth_invalid', '供应商认证失败'],
    ['provider_connection.network_error', '无法连接供应商'],
    ['provider.network_error', '无法连接供应商'],
    ['provider.timeout', '供应商请求超时'],
    ['provider.rate_limited', '受到限流'],
    ['provider.quota_exhausted', '额度或余额已耗尽'],
    ['provider.invalid_response', '响应格式异常'],
    ['provider_connection.catalog_empty', '没有返回可用模型'],
    ['provider_connection.catalog_sync_failed', '目录保存失败'],
    ['provider_connection.test_failed', '连接测试失败'],
    ['web_search.tavily_api_key_missing', '凭据缺失'],
    ['web_search.anysearch_endpoint_missing', '接口地址缺失'],
    ['web_search.bocha_http_error', '供应商返回异常'],
  ])('explains %s by code rather than backend prose', (code, expected) => {
    const error = apiError(code);
    expect(resolveUiErrorMessage(error, '操作失败。', translator('zh-CN'))).toContain(expected);
    expect(error.message).toBe('provider catalog request failed');
    expect(error.traceId).toBe('trace-preserved');
  });

  it('covers every public adapter test error in both languages', () => {
    const backend = readFileSync('../app/domain/provider_connections/service.py', 'utf8');
    const publicCodes = backend.split('_PUBLIC_PROVIDER_TEST_ERROR_CODES = {')[1].split('}')[0];
    const codes = [...publicCodes.matchAll(/"([\w.]+)":/g)].map((match) => match[1]);
    expect(codes.length).toBeGreaterThan(30);
    for (const code of codes) {
      const zh = resolveUiErrorMessage(apiError(code), '兜底提示', translator('zh-CN'));
      const en = resolveUiErrorMessage(apiError(code), 'Fallback', translator('en'));
      expect(zh, code).not.toBe('兜底提示');
      expect(zh, code).toMatch(/[\u3400-\u9fff]/);
      expect(en, code).not.toBe('Fallback');
      expect(en, code).not.toMatch(/[\u3400-\u9fff]/);
      expect(en, code).not.toContain('error.provider_');
    }
  });

  it.each(['provider catalog request failed', 'fetch failed', 'network connection lost', 'Failed to fetch']) (
    'uses translated fallback for uncoded transport error %s', (message) => {
      expect(resolveUiErrorMessage(new Error(message), '加载失败，请稍后重试。')).toBe('加载失败，请稍后重试。');
    }
  );

  it('keeps unknown API detail and machine codes out of both locales', () => {
    for (const fallback of ['操作失败。', 'Action failed.']) {
      expect(resolveUiErrorMessage(apiError('provider.future_failure', 'private host: auth token rejected'), fallback, translator('en'))).toBe(fallback);
    }
    expect(resolveUiErrorMessage({ error_code: 'internal.secret_failure' }, '操作失败。')).toBe('操作失败。');
    expect(resolveUiErrorMessage(null, '操作失败。')).toBe('操作失败。');
    expect(resolveUiErrorMessage(apiError('toString'), '操作失败。', translator('zh-CN'))).toBe('操作失败。');
    expect(resolveUiErrorMessage({ error_code: 'provider.future_failure', message: 'private detail' }, 'Action failed.', translator('en'))).toBe('Action failed.');
  });

  it('localizes structured failed receipts as well as thrown API errors', () => {
    expect(resolveUiErrorMessage({ error_code: 'provider.auth_invalid', message: 'provider catalog request failed' }, '操作失败。', translator('zh-CN'))).toContain('供应商认证失败');
  });

  it('retains local Chinese validation and explicit English validation', () => {
    expect(resolveUiErrorMessage(new Error('请输入接口地址。'), '保存失败。')).toBe('请输入接口地址。');
    expect(resolveUiErrorMessage(new Error('Choose a supplier first.'), 'Could not save.')).toBe('Choose a supplier first.');
  });
});
