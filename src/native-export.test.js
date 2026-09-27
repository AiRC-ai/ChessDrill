import { afterEach, expect, it, vi } from 'vitest';
import { saveTextFile } from './native-export.js';

afterEach(() => vi.unstubAllGlobals());

it('sends progress backups to the Android document picker', () => {
  const postMessage = vi.fn();
  vi.stubGlobal('window', {ChessStudioNative:{postMessage}});
  saveTextFile('chessdrill-backup.json','{"version":2}','application/json');
  expect(JSON.parse(postMessage.mock.calls[0][0])).toEqual({
    action:'save',name:'chessdrill-backup.json',text:'{"version":2}',type:'application/json',
  });
});
