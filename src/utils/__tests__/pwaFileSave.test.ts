import { afterEach, describe, expect, it, vi } from 'vitest';
import { shareOrDownloadFile } from '@/utils/downloads';
import { usePwaFileSave } from '@/utils/pwaFileSave';

describe('installed iPhone file saving', () => {
  afterEach(() => {
    usePwaFileSave.getState().request?.close();
    vi.unstubAllGlobals();
  });

  it('prepares the original file before the action that opens the share sheet', async () => {
    const share = vi.fn<(data: ShareData) => Promise<void>>().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { userAgent: 'iPhone', standalone: true, share, canShare: () => true });
    const blob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => blob }));

    const result = shareOrDownloadFile('/api/view?filename=result.png', 'result.png');
    await vi.waitFor(() => expect(usePwaFileSave.getState().request?.phase).toBe('ready'));
    expect(share).not.toHaveBeenCalled();
    await usePwaFileSave.getState().request?.save();

    expect(await result).toEqual({ route: 'share', status: 'shared' });
    const file = share.mock.calls[0]?.[0].files?.[0];
    expect(file).toMatchObject({ name: 'result.png', type: 'image/png', size: blob.size });
  });

  it('lets the user cancel while the file is being prepared', async () => {
    vi.stubGlobal('navigator', { userAgent: 'iPhone', standalone: true });
    const fetchFile = vi.fn<typeof fetch>().mockReturnValue(new Promise(() => {}));
    vi.stubGlobal('fetch', fetchFile);
    const result = shareOrDownloadFile('/api/view?filename=result.png', 'result.png');
    usePwaFileSave.getState().request?.close();

    expect(await result).toEqual({ route: 'share', status: 'cancelled' });
    expect(fetchFile.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
});
