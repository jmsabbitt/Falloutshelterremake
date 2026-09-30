// Export inside the phone app: a download link does nothing in Android's WebView or
// WKWebView, so the file is written to the app cache and handed to the share sheet.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const writes: { path: string; data: string }[] = [];
const shares: { title?: string; files?: string[] }[] = [];
let shareError: Error | null = null;

vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: {
    writeFile: async (o: { path: string; data: string }) => {
      writes.push(o);
      return { uri: `file:///cache/${o.path}` };
    },
  },
}));
vi.mock('@capacitor/share', () => ({
  Share: {
    share: async (o: { title?: string; files?: string[] }) => {
      if (shareError) throw shareError;
      shares.push(o);
      return {};
    },
  },
}));

const g = globalThis as Record<string, unknown>;
beforeEach(() => {
  writes.length = 0;
  shares.length = 0;
  shareError = null;
  g.Capacitor = { isNativePlatform: () => true };
});
afterEach(() => {
  delete g.Capacitor;
});

describe('export in the phone app', () => {
  it('writes the file to the cache and opens the share sheet with it', async () => {
    const { downloadFile } = await import('../src/client/storage');
    const res = await downloadFile('homestead-5.json', '{"a":1}');
    expect(res).toEqual({ ok: true });
    expect(writes).toEqual([expect.objectContaining({ path: 'homestead-5.json', data: '{"a":1}' })]);
    expect(shares).toEqual([{ title: 'homestead-5.json', files: ['file:///cache/homestead-5.json'] }]);
  });

  it('closing the share sheet is fine, other errors are reported', async () => {
    const { downloadFile } = await import('../src/client/storage');
    shareError = new Error('Share canceled');
    expect(await downloadFile('a.json', '{}')).toEqual({ ok: true });
    shareError = new Error('No app can handle this');
    expect(await downloadFile('a.json', '{}')).toEqual({ ok: false, reason: 'No app can handle this' });
  });
});
