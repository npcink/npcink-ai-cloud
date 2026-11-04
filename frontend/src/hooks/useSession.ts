'use client';

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  portalClient,
  type PortalAuthenticationResult,
  type PortalSecondFactorRequired,
  type PortalSecondFactorSubmission,
  type PortalSession,
  type Site,
} from '@/lib/portal-client';
import { ApiError } from '@/lib/errors';
import { parseManagementSession } from '@/lib/portal-totp-client';
import {
  parsePortalSecondFactorFailure,
  parsePortalSecondFactorFromError,
  parsePortalSecondFactorRequired,
  parsePortalSecondFactorStatus,
} from '@/lib/portal-auth-wire';

export interface SessionState {
  session: PortalSession | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: Error | null;
  sessionInvalid: boolean;
  /** A restricted challenge is not an authenticated session. */
  secondFactor: PortalSecondFactorRequired | null;
  /** Lifecycle confidence for the cookie-bound challenge projection. */
  secondFactorResolution: 'active' | 'terminal' | 'unknown' | null;
}

export interface UseSessionReturn extends SessionState {
  requestLoginCode: (email: string) => Promise<{
    code?: string;
    resendCooldownSeconds: number;
  }>;
  verifyLoginCode: (email: string, code: string, options?: { rememberMe?: boolean }) => Promise<PortalAuthenticationResult>;
  verifyRegistrationResult: (result: PortalAuthenticationResult) => Promise<PortalAuthenticationResult>;
  verifySecondFactor: (payload: PortalSecondFactorSubmission) => Promise<PortalAuthenticationResult>;
  logout: () => Promise<void>;
  clearSession: () => void;
  selectSite: (siteId: string) => Promise<void>;
  refresh: () => Promise<void>;
  getAuthenticationEpoch: () => number;
  acceptManagementSession: (session: PortalSession, expectedEpoch: number) => boolean;
}

const SessionContext = createContext<UseSessionReturn | undefined>(undefined);

/**
 * Session 管理 Hook
 * 处理 Portal 认证、Session 刷新、站点选择等
 */
function useSessionController(): UseSessionReturn {
  const [state, setState] = useState<SessionState>({
    session: null,
    isLoading: true,
    isAuthenticated: false,
    error: null,
    sessionInvalid: false,
    secondFactor: null,
    secondFactorResolution: null,
  });
  const sessionRequestVersionRef = useRef(0);
  const authenticationEpochRef = useRef(0);
  const currentSessionRef = useRef<PortalSession | null>(null);
  const sessionLoadPromiseRef = useRef<Promise<void> | null>(null);

  /**
   * 加载 Session
   */
  const loadSession = useCallback((): Promise<void> => {
    if (sessionLoadPromiseRef.current) return sessionLoadPromiseRef.current;
    authenticationEpochRef.current += 1;
    const requestVersion = ++sessionRequestVersionRef.current;
    setState((previous) => ({
      ...previous,
      isLoading: !previous.session,
      error: null,
      sessionInvalid: false,
    }));
    const loadPromise = (async () => {
      try {
        const response = await portalClient.getSession();
        // A revoke/clear can finish while this read is pending. Retire it
        // before it mutates refs or starts an automatic site-selection write.
        if (requestVersion !== sessionRequestVersionRef.current) return;
        const challenge = parsePortalSecondFactorRequired(response.data);
        if (challenge) {
          if (currentSessionRef.current) portalClient.resetWriteIntentScope();
          currentSessionRef.current = null;
          if (requestVersion === sessionRequestVersionRef.current) {
            setState({
              session: null,
              isLoading: false,
              isAuthenticated: false,
              error: null,
              sessionInvalid: false,
              secondFactor: challenge,
              secondFactorResolution: 'active',
            });
          }
          return;
        }
        let nextSession = response.data as PortalSession;
        portalClient.setWriteIntentContext(nextSession.selected_context?.site.site_id || null);
        const activeSites = nextSession.sites.filter((site) => site.status === 'active');
        if (!nextSession.selected_context && activeSites.length === 1) {
          try {
            const selected = await portalClient.selectSite(activeSites[0].site_id);
            nextSession = selected.data;
          } catch {
            // Keep the authenticated session usable if automatic context
            // selection is temporarily unavailable. The site can still be
            // selected explicitly from the workspace.
          }
        }
        if (requestVersion !== sessionRequestVersionRef.current) return;
        portalClient.setWriteIntentContext(nextSession.selected_context?.site.site_id || null);
        currentSessionRef.current = nextSession;
        setState({
          session: nextSession,
          isLoading: false,
          isAuthenticated: true,
          error: null,
          sessionInvalid: false,
          secondFactor: null,
          secondFactorResolution: null,
        });
      } catch (error) {
        // An obsolete failure must not bootstrap a challenge for a newer
        // session (or for the signed-out login page).
        if (requestVersion !== sessionRequestVersionRef.current) return;
        const normalizedError = error instanceof Error
          ? error
          : new Error('Failed to load session');
        const sessionInvalid = error instanceof ApiError && (
          error.statusCode === 401
          || error.errorCode === 'auth.portal_session_required'
          || error.errorCode === 'auth.portal_session_expired'
          || error.errorCode === 'auth.portal_token_required'
        );
        let challenge = parsePortalSecondFactorFromError(error);
        const initialChallengeFailure = parsePortalSecondFactorFailure(error);
        let challengeResolution: 'active' | 'terminal' | 'unknown' | null = challenge
          ? 'active'
          : initialChallengeFailure.disposition === 'terminal'
            ? 'terminal'
            : null;
        const transportFailure = error instanceof ApiError && (
          error.statusCode === 0
          || error.statusCode >= 500
          || error.errorCode.startsWith('client.')
        );
        const shouldBootstrapChallenge = sessionInvalid
          || (transportFailure && !currentSessionRef.current);
        if (!challenge && shouldBootstrapChallenge) {
          // A full document navigation keeps only the HttpOnly challenge
          // cookie. Recover its public metadata through the dedicated status
          // projection before rendering the challenge page.
          try {
            const statusResponse = await portalClient.getSecondFactorStatus();
            const status = parsePortalSecondFactorStatus(statusResponse.data);
            challenge = status.challenge;
            if (challenge) {
              challengeResolution = 'active';
            } else if (
              status.challenge_status === 'expired'
              || status.challenge_status === 'consumed'
              || status.challenge_status === 'attempt_limit'
              || status.challenge_status === 'missing'
            ) {
              challengeResolution = 'terminal';
            } else {
              // A successful but incomplete projection is not proof that the
              // HttpOnly challenge is gone. Keep the result explicitly unknown.
              challengeResolution = 'unknown';
            }
          } catch (statusError) {
            // A status transport failure is uncertain. Keep the existing
            // session-invalid result and never infer completion or clear a
            // still-valid challenge from a missing response.
            const statusFailure = parsePortalSecondFactorFailure(statusError);
            if (statusFailure.disposition === 'retryable' && statusFailure.challenge) {
              challenge = statusFailure.challenge;
              challengeResolution = 'active';
            } else if (statusFailure.disposition === 'terminal') {
              challengeResolution = 'terminal';
            } else if (challengeResolution !== 'terminal') {
              challengeResolution = 'unknown';
            }
          }
        }
        if (requestVersion === sessionRequestVersionRef.current) {
          if (sessionInvalid || challengeResolution === 'terminal' || (challenge && currentSessionRef.current)) {
            portalClient.resetWriteIntentScope();
          }
          setState((previous) => {
            if (challenge) {
              currentSessionRef.current = null;
              return {
                session: null,
                isLoading: false,
                isAuthenticated: false,
                error: null,
                sessionInvalid: false,
                secondFactor: challenge,
                secondFactorResolution: 'active',
              };
            }
            if (!sessionInvalid && previous.session) {
              currentSessionRef.current = previous.session;
              return {
                ...previous,
                isLoading: false,
                isAuthenticated: true,
                error: normalizedError,
                sessionInvalid: false,
                secondFactor: previous.secondFactor,
                secondFactorResolution: previous.secondFactorResolution,
              };
            }
            currentSessionRef.current = null;
            return {
              session: null,
              isLoading: false,
              isAuthenticated: false,
              error: normalizedError,
              sessionInvalid,
              secondFactor: challengeResolution === 'terminal' ? null : previous.secondFactor,
              secondFactorResolution: challengeResolution === 'terminal'
                ? 'terminal'
                : challengeResolution ?? previous.secondFactorResolution,
            };
          });
        }
        throw normalizedError;
      } finally {
        if (requestVersion === sessionRequestVersionRef.current) {
          sessionLoadPromiseRef.current = null;
        }
      }
    })();
    sessionLoadPromiseRef.current = loadPromise;
    return loadPromise;
  }, []);

  /**
   * 请求邮箱验证码
   */
  const requestLoginCode = useCallback(async (email: string): Promise<{
    code?: string;
    resendCooldownSeconds: number;
  }> => {
    try {
      const response = await portalClient.requestLoginCode({ email });
      return {
        code: response.data?.code,
        resendCooldownSeconds: response.data?.resend_cooldown_seconds || 0,
      };
    } catch (error) {
      throw error instanceof Error ? error : new Error('Failed to request login code');
    }
  }, []);

  const acceptAuthenticationResult = useCallback(async (
    result: PortalAuthenticationResult
  ): Promise<PortalAuthenticationResult> => {
    authenticationEpochRef.current += 1;
    portalClient.resetWriteIntentScope();
    const challenge = parsePortalSecondFactorRequired(result);
    if (challenge) {
      sessionRequestVersionRef.current += 1;
      sessionLoadPromiseRef.current = null;
      currentSessionRef.current = null;
      setState({
        session: null,
        isLoading: false,
        isAuthenticated: false,
        error: null,
        sessionInvalid: false,
        secondFactor: challenge,
        secondFactorResolution: 'active',
      });
      return challenge;
    }
    sessionRequestVersionRef.current += 1;
    sessionLoadPromiseRef.current = null;
    await loadSession();
    return result;
  }, [loadSession]);

  /**
   * 验证邮箱验证码
   */
  const verifyLoginCode = useCallback(async (
    email: string,
    code: string,
    options: { rememberMe?: boolean } = {}
  ): Promise<PortalAuthenticationResult> => {
    try {
      const epoch = ++authenticationEpochRef.current;
      const response = await portalClient.verifyLoginCode({ email, code, remember_me: Boolean(options.rememberMe) });
      if (epoch !== authenticationEpochRef.current) return response.data;
      return await acceptAuthenticationResult(response.data);
    } catch (error) {
      throw error instanceof Error ? error : new Error('Failed to verify login code');
    }
  }, [acceptAuthenticationResult]);

  const verifyRegistrationResult = useCallback(async (
    result: PortalAuthenticationResult
  ): Promise<PortalAuthenticationResult> => acceptAuthenticationResult(result), [acceptAuthenticationResult]);

  const verifySecondFactor = useCallback(async (
    payload: PortalSecondFactorSubmission
  ): Promise<PortalAuthenticationResult> => {
    const epoch = ++authenticationEpochRef.current;
    try {
      const response = await portalClient.verifySecondFactor(payload);
      if (epoch !== authenticationEpochRef.current) return response.data;
      return await acceptAuthenticationResult(response.data);
    } catch (error) {
      if (epoch !== authenticationEpochRef.current) throw error instanceof Error ? error : new Error('Authentication request retired');
      const failure = parsePortalSecondFactorFailure(error);
      if (failure.disposition === 'terminal') {
        authenticationEpochRef.current += 1;
        portalClient.resetWriteIntentScope();
        sessionRequestVersionRef.current += 1;
        sessionLoadPromiseRef.current = null;
        currentSessionRef.current = null;
        setState((previous) => ({
          ...previous,
          session: null,
          isLoading: false,
          isAuthenticated: false,
          error: null,
          sessionInvalid: true,
          secondFactor: null,
          secondFactorResolution: 'terminal',
        }));
      } else if (failure.disposition === 'retryable' && failure.challenge) {
        setState((previous) => ({
          ...previous,
          secondFactor: failure.challenge,
          secondFactorResolution: 'active',
          isAuthenticated: false,
          session: null,
        }));
      } else if (failure.disposition === 'unknown') {
        setState((previous) => ({ ...previous, secondFactorResolution: 'unknown' }));
      }
      throw error instanceof Error ? error : new Error('Failed to verify second factor');
    }
  }, [acceptAuthenticationResult]);

  // Local cleanup only: callers must establish or explain the remote outcome.
  const clearSession = useCallback((): void => {
    authenticationEpochRef.current += 1;
    portalClient.resetWriteIntentScope();
    sessionRequestVersionRef.current += 1;
    sessionLoadPromiseRef.current = null;
    currentSessionRef.current = null;
    setState({
      session: null,
      isLoading: false,
      isAuthenticated: false,
      error: null,
      sessionInvalid: false,
      secondFactor: null,
      secondFactorResolution: null,
    });
  }, []);

  /**
   * 登出
   */
  const logout = useCallback(async (): Promise<void> => {
    clearSession();
    const epoch = authenticationEpochRef.current;
    sessionRequestVersionRef.current += 1;
    sessionLoadPromiseRef.current = null;
    currentSessionRef.current = null;
    try {
      await portalClient.logout();
    } catch (error) {
      // 忽略登出错误
    }
    if (epoch !== authenticationEpochRef.current) return;
    portalClient.resetWriteIntentScope();
    setState({
      session: null,
      isLoading: false,
      isAuthenticated: false,
      error: null,
      sessionInvalid: false,
      secondFactor: null,
      secondFactorResolution: null,
    });
  }, [clearSession]);

  /**
   * 选择站点
   */
  const selectSite = useCallback(async (siteId: string): Promise<void> => {
    authenticationEpochRef.current += 1;
    const requestVersion = ++sessionRequestVersionRef.current;
    sessionLoadPromiseRef.current = null;
    try {
      const response = await portalClient.selectSite(siteId);
      if (requestVersion !== sessionRequestVersionRef.current) return;
      portalClient.setWriteIntentContext(response.data.selected_context?.site.site_id || null);
      currentSessionRef.current = response.data;
      setState((prev) => ({
        ...prev,
        session: response.data,
        secondFactor: null,
        secondFactorResolution: null,
      }));
    } catch (error) {
      throw error instanceof Error ? error : new Error('Failed to select site');
    }
  }, []);

  /**
   * 刷新 Session
   */
  const refresh = useCallback(async (): Promise<void> => {
    await loadSession();
  }, [loadSession]);

  const getAuthenticationEpoch = useCallback(() => authenticationEpochRef.current, []);
  const acceptManagementSession = useCallback((value: PortalSession, expectedEpoch: number): boolean => {
    if (!currentSessionRef.current || expectedEpoch !== authenticationEpochRef.current) return false;
    let session: PortalSession;
    try { session = parseManagementSession(value); } catch { return false; }
    authenticationEpochRef.current += 1;
    sessionRequestVersionRef.current += 1;
    sessionLoadPromiseRef.current = null;
    portalClient.resetWriteIntentScope();
    portalClient.setWriteIntentContext(session.selected_context?.site.site_id || null);
    currentSessionRef.current = session;
    setState({ session, isLoading: false, isAuthenticated: true, error: null,
      sessionInvalid: false, secondFactor: null, secondFactorResolution: null });
    return true;
  }, []);

  // 初始加载
  useEffect(() => {
    void loadSession().catch(() => undefined);
  }, [loadSession]);

  return {
    ...state,
    requestLoginCode,
    verifyLoginCode,
    verifyRegistrationResult,
    verifySecondFactor,
    logout,
    clearSession,
    selectSite,
    refresh,
    getAuthenticationEpoch,
    acceptManagementSession,
  };
}

export function PortalSessionProvider({ children }: { children: ReactNode }) {
  const session = useSessionController();

  return createElement(SessionContext.Provider, { value: session }, children);
}

export function useSession(): UseSessionReturn {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a PortalSessionProvider');
  }
  return context;
}

/**
 * 获取当前选中的站点
 */
export function useSelectedSite(): Site | null {
  const { session } = useSession();
  return session?.selected_context?.site || null;
}

/**
 * 获取可用的站点列表
 */
export function useSites(): Site[] {
  const { session } = useSession();
  if (!session) return [];
  return session.sites;
}

export default useSession;
