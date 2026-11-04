import { beforeEach, expect, it, vi } from 'vitest';
import type { PortalSession } from '@/lib/portal-client';
import type { UseSessionReturn } from '@/hooks/useSession';

const harness = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, effects: [] as (() => void)[], mounted: false }));
const client = vi.hoisted(() => ({ getSession: vi.fn(), selectSite: vi.fn(), resetWriteIntentScope: vi.fn(),
  setWriteIntentContext: vi.fn(), logout: vi.fn(), verifySecondFactor: vi.fn(), verifyLoginCode: vi.fn() }));
vi.mock('@/lib/portal-client', () => ({ portalClient: client }));
vi.mock('react', () => ({
  createContext: () => ({ Provider: 'provider' }), createElement: (_type: unknown, props: unknown) => props,
  useCallback: (fn: unknown) => fn, useContext: () => undefined,
  useRef: (value: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.slots)) harness.slots[index] = { current: value };
    return harness.slots[index];
  },
  useState: (value: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.slots)) harness.slots[index] = value;
    return [harness.slots[index], (next: unknown) => { harness.slots[index] = typeof next === 'function' ? next(harness.slots[index]) : next; }];
  },
  useEffect: (effect: () => void) => { if (!harness.mounted) harness.effects.push(effect); },
}));
import { PortalSessionProvider } from '@/hooks/useSession';
function render(): UseSessionReturn {
  harness.cursor = 0;
  const result = PortalSessionProvider({ children: null }) as unknown as { value: UseSessionReturn };
  if (!harness.mounted) { harness.mounted = true; harness.effects.forEach((effect) => effect()); }
  return result.value;
}
const session = (email: string): PortalSession => ({ email, sites: [], selected_context: null, auth_mode: 'jwt',
  session: { state: 'active', transport: 'cookie', issued_at: new Date(Date.now() - 10000).toISOString(), expires_at: new Date(Date.now() + 3600000).toISOString(), revocable: true } });
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
function deferred() { let resolve!: (value: { data: PortalSession }) => void;
  const promise = new Promise<{ data: PortalSession }>((done) => { resolve = done; }); return { promise, resolve }; }
beforeEach(async () => {
  harness.slots = []; harness.effects = []; harness.cursor = 0; harness.mounted = false; vi.clearAllMocks();
  client.getSession.mockResolvedValue({ data: session('initial@example.test') });
  render(); await flush();
});
it('synchronously adopts a whitelisted management session without refresh or site selection', () => {
  const controller = render(), epoch = controller.getAuthenticationEpoch();
  const reads = client.getSession.mock.calls.length;
  const input = { ...session('replacement@example.test'), recovery_codes: ['drop'] };
  expect(controller.acceptManagementSession(input, epoch)).toBe(true);
  const next = render();
  expect(next.isAuthenticated).toBe(true); expect(next.isLoading).toBe(false);
  expect(next.getAuthenticationEpoch()).toBe(epoch + 1);
  expect('recovery_codes' in next.session!).toBe(false);
  expect(client.getSession).toHaveBeenCalledTimes(reads); expect(client.selectSite).not.toHaveBeenCalled();
});
it('retires an old session read and its automatic site-selection write', async () => {
  const pending = deferred(); client.getSession.mockReturnValueOnce(pending.promise);
  const controller = render(); const read = controller.refresh(); const epoch = controller.getAuthenticationEpoch();
  expect(controller.acceptManagementSession(session('replacement@example.test'), epoch)).toBe(true);
  pending.resolve({ data: { ...session('old@example.test'), sites: [{ site_id: 'old', status: 'active', name: '', site_url: '', platform_kind: 'wordpress' }] } });
  await read;
  expect(render().session?.email === 'replacement@example.test').toBe(true);
  expect(client.selectSite).not.toHaveBeenCalled();
});
it('retires an already pending selectSite response and rejects stale/cleared epochs', async () => {
  const pending = deferred(); client.selectSite.mockReturnValueOnce(pending.promise);
  const controller = render(); const select = controller.selectSite('old'); const epoch = controller.getAuthenticationEpoch();
  expect(controller.acceptManagementSession(session('replacement@example.test'), epoch)).toBe(true);
  pending.resolve({ data: session('old@example.test') }); await select;
  expect(render().session?.email === 'replacement@example.test').toBe(true);
  expect(controller.acceptManagementSession(session('late@example.test'), epoch)).toBe(false);
  render().clearSession();
  expect(controller.acceptManagementSession(session('late@example.test'), controller.getAuthenticationEpoch())).toBe(false);
});

it.each(['verifyLoginCode', 'verifySecondFactor'] as const)('retires late %s success after local logout', async (method) => {
  const pending = deferred(); client[method].mockReturnValueOnce(pending.promise);
  const controller = render();
  const request = method === 'verifyLoginCode' ? controller.verifyLoginCode('fixture@example.test', '123456')
    : controller.verifySecondFactor({ method: 'totp', code: '123456' });
  controller.clearSession();
  pending.resolve({ data: session('late@example.test') }); await request;
  expect(render().isAuthenticated).toBe(false); expect(render().session).toBeNull();
});
it('does not let an old logout completion erase a newer authentication', async () => {
  const pending = deferred(); client.logout.mockReturnValueOnce(pending.promise);
  const controller = render(); const logout = controller.logout();
  client.getSession.mockResolvedValueOnce({ data: session('new@example.test') });
  await controller.refresh();
  pending.resolve({ data: session('unused@example.test') }); await logout;
  expect(render().session?.email === 'new@example.test').toBe(true);
});
