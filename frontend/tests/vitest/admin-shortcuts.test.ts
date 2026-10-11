import { describe, expect, it } from 'vitest';

import { getAdminCommandShortcutLabel } from '@/lib/admin-shortcuts';

describe('getAdminCommandShortcutLabel', () => {
  it('uses the command key label on Apple platforms', () => {
    expect(getAdminCommandShortcutLabel('MacIntel')).toBe('⌘K');
    expect(getAdminCommandShortcutLabel('iPhone')).toBe('⌘K');
  });

  it('uses the control key label on other platforms', () => {
    expect(getAdminCommandShortcutLabel('Win32')).toBe('Ctrl+K');
    expect(getAdminCommandShortcutLabel('Linux x86_64')).toBe('Ctrl+K');
  });
});
