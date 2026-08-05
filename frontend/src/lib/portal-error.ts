import { ApiError } from './errors';
import { formatDate } from './utils';

type PortalTranslator = (
  key: string,
  params?: Record<string, string>,
  fallback?: string
) => string;

function readErrorDetail(details: unknown, key: string): string {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return '';
  }
  const value = (details as Record<string, unknown>)[key];
  return typeof value === 'string' ? value.trim() : '';
}

function readPositiveErrorNumber(details: unknown, key: string): number {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return 0;
  }
  const value = Number((details as Record<string, unknown>)[key]);
  return Number.isFinite(value) && value > 0 ? Math.ceil(value) : 0;
}

export function formatPortalErrorReference(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return '';
  }
  return String(error.traceId || error.errorCode || '').trim();
}

export function formatPortalWriteErrorMessage(
  error: unknown,
  t: PortalTranslator,
  fallbackMessage: string
): string {
  if (
    error instanceof ApiError
    && (error.statusCode === 0 || error.errorCode.startsWith('client.'))
  ) {
    return t(
      'error.portal_write_outcome_unknown',
      undefined,
      'Cloud could not confirm whether this change completed. Check the current record before trying again.'
    );
  }
  return formatPortalErrorMessage(error, t, fallbackMessage);
}

export function formatPortalErrorMessage(
  error: unknown,
  t: PortalTranslator,
  fallbackMessage: string
): string {
  if (error instanceof ApiError) {
    switch (error.errorCode) {
      case 'portal.login_code_rate_limited':
      case 'portal.oauth_state_rate_limited':
      case 'portal.email_change_rate_limited': {
        const retryAfterSeconds = readPositiveErrorNumber(
          error.details,
          'retry_after_seconds'
        );
        if (retryAfterSeconds > 0) {
          return t(
            'error.portal_rate_limited_retry',
            { seconds: String(retryAfterSeconds) },
            `Too many requests. Try again in ${retryAfterSeconds} seconds.`
          );
        }
        return t(
          'error.portal_rate_limited',
          { minutes: '15' },
          'Too many portal requests were sent in a short window. Wait a few minutes and try again.'
        );
      }
      case 'auth.portal_login_code_invalid':
      case 'auth.portal_login_code_required':
      case 'auth.portal_email_change_code_invalid':
      case 'auth.portal_email_change_code_required':
        return t(
          'error.portal_login_code_invalid',
          undefined,
          'The verification code is invalid or expired. Request a new code and try again.'
        );
      case 'service.portal_email_change_same_email':
        return t(
          'portal.account.email_change_same_email',
          undefined,
          'This email is already your current login email.'
        );
      case 'service.portal_email_change_email_in_use':
        return t(
          'portal.account.email_change_email_in_use',
          undefined,
          'This email is already used by another Portal user.'
        );
      case 'auth.portal_session_required':
      case 'auth.portal_token_required':
        return t(
          'error.portal_sign_in_again',
          undefined,
          'Your portal session is missing or expired. Sign in again and reload this page.'
        );
      case 'auth.origin_required':
      case 'auth.origin_forbidden':
        return t(
          'error.portal_same_origin_required',
          undefined,
          'This browser request was rejected by same-origin protection. Reload the local portal page and try again.'
        );
      case 'service.portal_site_conflict':
      case 'service.site_account_binding_conflict':
        return t(
          'error.portal_site_owned_by_another_account',
          undefined,
          'This site is still connected to another account. Remove it from that Cloud account before trying to connect it here.'
        );
      case 'service.site_relink_cooldown_active': {
        const retryAfterAt = formatDate(readErrorDetail(error.details, 'retry_after_at'));
        return retryAfterAt
          ? t(
              'error.portal_site_relink_cooldown_active',
              { date: retryAfterAt },
              `This site cannot be connected to another account yet. Try again after ${retryAfterAt}. Free service and credits do not move with the site.`
            )
          : t(
              'error.portal_site_relink_cooldown_active_no_date',
              undefined,
              'This site cannot be connected to another account until its Cloud cooldown ends. Free service and credits do not move with the site.'
            );
      }
      case 'service.site_cross_account_relink_disabled':
        return t(
          'error.portal_site_cross_account_relink_disabled',
          undefined,
          'Cross-account site connections are currently unavailable. The same account may still reconnect this site.'
        );
      case 'service.site_relink_release_incomplete':
        return t(
          'error.portal_site_relink_release_incomplete',
          undefined,
          'Cloud could not confirm a complete site release. Reconnect with the previous account or contact support if the record looks wrong.'
        );
      default:
        return fallbackMessage;
    }
  }

  if (error instanceof Error) {
    const message = String(error.message || '').trim();
    return message || fallbackMessage;
  }

  return fallbackMessage;
}
