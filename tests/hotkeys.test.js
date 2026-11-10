import { test, expect } from 'vitest';
import { hotkeyAction } from '../src/debug/hotkeys.js';

test('hotkeyAction maps dev keys and ignores game keys', () => {
  expect(hotkeyAction('KeyC')).toBe('chase');
  expect(hotkeyAction('KeyR')).toBe('restart');
  expect(hotkeyAction('Backquote')).toBe('panel');
  expect(hotkeyAction('KeyA')).toBeNull();
  expect(hotkeyAction('Space')).toBeNull();
});
