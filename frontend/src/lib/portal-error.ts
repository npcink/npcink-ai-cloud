import { ApiError } from './errors';
import { formatDate } from './utils';

type PortalTranslator = (
  key: string,
  params?: Record<string, string>,
  fallback?: string
) => string;

function appendErrorCode(message: string, errorCode: string): string {
  const normalizedMessage = String(message || '').trim();
  const normalizedCode = String(errorCode || '').trim();
  if (!normalizedCode) {
    return normalizedMessage;
  }
  return normalizedMessage ? `${normalizedMessage} [${normalizedCode}]` : `[${normalizedCode}]`;
}

function readErrorDetail(details: unknown, key: string): string {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return '';
  }
  const value = (details as Record<string, unknown>)[key];
  return typeof value === 'string' ? value.trim() : '';
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
      case 'portal.email_change_rate_limited':
        return appendErrorCode(
          t(
            'error.portal_rate_limited',
            { minutes: '15' },
            'Too many portal requests were sent in a short window. Wait a few minutes and try again.'
          ),
          error.errorCode
        );
      case 'auth.portal_login_code_invalid':
      case 'auth.portal_login_code_required':
      case 'auth.portal_email_change_code_invalid':
      case 'auth.portal_email_change_code_required':
        return appendErrorCode(
          t(
            'error.portal_login_code_invalid',
            undefined,
            'The verification code is invalid or expired. Request a new code and try again.'
          ),
          error.errorCode
        );
      case 'service.portal_email_change_same_email':
        return appendErrorCode(
          t(
            'portal.account.email_change_same_email',
            undefined,
            'This email is already your current login email.'
          ),
          error.errorCode
        );
      case 'service.portal_email_change_email_in_use':
        return appendErrorCode(
          t(
            'portal.account.email_change_email_in_use',
            undefined,
            'This email is already used by another Portal user.'
          ),
          error.errorCode
        );
      case 'auth.portal_session_required':
      case 'auth.portal_token_required':
        return appendErrorCode(
          t(
            'error.portal_sign_in_again',
            undefined,
            'Your portal session is missing or expired. Sign in again and reload this page.'
          ),
          error.errorCode
        );
      case 'auth.origin_required':
      case 'auth.origin_forbidden':
        return appendErrorCode(
          t(
            'error.portal_same_origin_required',
            undefined,
            'This browser request was rejected by same-origin protection. Reload the local portal page and try again.'
          ),
          error.errorCode
        );
      case 'service.portal_site_conflict':
      case 'service.site_account_binding_conflict':
        return appendErrorCode(
          t(
            'error.portal_site_owned_by_another_account',
            undefined,
            'This site is still connected to another account. Remove it from that Cloud account before trying to connect it here.'
          ),
          error.errorCode
        );
      case 'service.site_relink_cooldown_active': {
        const retryAfterAt = formatDate(readErrorDetail(error.details, 'retry_after_at'));
        return appendErrorCode(
          retryAfterAt
            ? t(
                'error.portal_site_relink_cooldown_active',
                { date: retryAfterAt },
                `This site cannot be connected to another account yet. Try again after ${retryAfterAt}. Free service and credits do not move with the site.`
              )
            : t(
                'error.portal_site_relink_cooldown_active_no_date',
                undefined,
                'This site cannot be connected to another account until its Cloud cooldown ends. Free service and credits do not move with the site.'
              ),
          error.errorCode
        );
      }
      case 'service.site_cross_account_relink_disabled':
        return appendErrorCode(
          t(
            'error.portal_site_cross_account_relink_disabled',
            undefined,
            'Cross-account site connections are currently unavailable. The same account may still reconnect this site.'
          ),
          error.errorCode
        );
      case 'service.site_relink_release_incomplete':
        return appendErrorCode(
          t(
            'error.portal_site_relink_release_incomplete',
            undefined,
            'Cloud could not confirm a complete site release. Reconnect with the previous account or contact support if the record looks wrong.'
          ),
          error.errorCode
        );
      default:
        return appendErrorCode(error.message || fallbackMessage, error.errorCode);
    }
  }

  if (error instanceof Error) {
    const message = String(error.message || '').trim();
    return message || fallbackMessage;
  }

  return fallbackMessage;
}
