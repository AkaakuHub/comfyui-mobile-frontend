import { create } from 'zustand';

export interface ShareTarget {
  src: string;
  filename: string;
}

export type ShareStatus = 'shared' | 'cancelled' | 'failed';
type FileSave = {
  phase: 'loading' | 'ready' | 'sharing' | 'failed';
  files: File[];
  save: () => Promise<void>;
  close: () => void;
};

export const usePwaFileSave = create<{ request: FileSave | null }>(() => ({ request: null }));

export function isIOSStandalone(): boolean {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return ios && (
    ('standalone' in navigator && navigator.standalone === true)
    || (window.matchMedia?.('(display-mode: standalone)')?.matches ?? false)
  );
}

export function saveWithShareSheet(targets: ShareTarget[]): Promise<ShareStatus> {
  usePwaFileSave.getState().request?.close();
  return new Promise((resolve) => {
    const controller = new AbortController();
    const update = (phase: FileSave['phase'], files: File[] = []) => {
      usePwaFileSave.setState({ request: { phase, files, save, close } });
    };
    const finish = (status: ShareStatus) => {
      controller.abort();
      usePwaFileSave.setState({ request: null });
      resolve(status);
    };
    function close() {
      finish(usePwaFileSave.getState().request?.phase === 'failed' ? 'failed' : 'cancelled');
    }
    async function save() {
      const request = usePwaFileSave.getState().request;
      if (controller.signal.aborted || request?.phase !== 'ready') return;
      const { files } = request;
      update('sharing', files);
      try {
        await navigator.share({ files });
        if (!controller.signal.aborted) finish('shared');
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === 'AbortError') finish('cancelled');
        else update('failed');
      }
    }

    update('loading');
    void (async () => {
      try {
        const files: File[] = [];
        for (const { src, filename } of targets) {
          const url = new URL(src, location.href);
          if (url.origin !== location.origin && url.protocol !== 'data:') throw new Error('Invalid file origin');
          const response = await fetch(url, { signal: controller.signal, redirect: 'error' });
          if (!response.ok) throw new Error('File request failed');
          const blob = await response.blob();
          files.push(new File([blob], filename, { type: blob.type }));
        }
        if (controller.signal.aborted) return;
        if (!navigator.canShare?.({ files })) throw new Error('File sharing unavailable');
        update('ready', files);
      } catch {
        if (!controller.signal.aborted) update('failed');
      }
    })();
  });
}
