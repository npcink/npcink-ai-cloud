export type AsyncOperationStatus = 'idle' | 'running' | 'success' | 'failed';

export type AsyncOperationState = {
  status: AsyncOperationStatus;
  key: string;
  error: string;
};

export const IDLE_ASYNC_OPERATION: AsyncOperationState = {
  status: 'idle',
  key: '',
  error: '',
};

export function asyncOperationRunning(
  state: AsyncOperationState,
  key = ''
): boolean {
  return state.status === 'running' && (!key || state.key === key);
}

export function startAsyncOperation(key = ''): AsyncOperationState {
  return { status: 'running', key, error: '' };
}

export function succeedAsyncOperation(key = ''): AsyncOperationState {
  return { status: 'success', key, error: '' };
}

export function failAsyncOperation(error: string, key = ''): AsyncOperationState {
  return { status: 'failed', key, error };
}
