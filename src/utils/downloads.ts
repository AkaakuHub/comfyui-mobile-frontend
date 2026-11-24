import { canSaveFile, canSaveToPhotosInNativeApp, saveToPhotosInNativeApp } from '@/utils/nativeSave';
import { isIOSStandalone, saveWithShareSheet, type ShareStatus, type ShareTarget } from '@/utils/pwaFileSave';

export type DownloadOutcome =
  | { route: 'photos'; ok: boolean }
  | { route: 'downloads'; started: boolean }
  | { route: 'share'; status: ShareStatus };

export async function shareOrDownloadFile(src: string, filename: string): Promise<DownloadOutcome> {
  if (!canSaveFile(filename)) return { route: 'downloads', started: false };
  const native = saveToPhotosInNativeApp(src, filename);
  if (native) return { route: 'photos', ok: await native };
  if (isIOSStandalone()) return { route: 'share', status: await saveWithShareSheet([{ src, filename }]) };

  const link = document.createElement('a');
  try {
    link.href = src;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    return { route: 'downloads', started: true };
  } catch (err) {
    console.error('Failed to save file:', err);
    return { route: 'downloads', started: false };
  } finally {
    link.remove();
  }
}

export async function downloadImage(
  src: string,
  filename = 'image.png',
  onDownloaded?: (src: string) => void,
) {
  const outcome = await shareOrDownloadFile(src, filename);
  if (didHandOff(outcome)) onDownloaded?.(src);
}

function didHandOff(outcome: DownloadOutcome): boolean {
  if (outcome.route === 'photos') return outcome.ok;
  if (outcome.route === 'share') return outcome.status === 'shared';
  return outcome.started;
}

// Derive a download filename from a ComfyUI asset URL: the `filename` query
// param (how /view and the thumbnail/preview endpoints name files), else the
// last path segment. Falls back to 'image.png' only if neither is present.
export function filenameFromSrc(src: string): string {
  try {
    const url = new URL(src, window.location.origin);
    const fromQuery = url.searchParams.get('filename');
    if (fromQuery) return fromQuery.split('/').pop() || fromQuery;
    // data:/blob: URLs have no meaningful path segment — use the default name.
    if (url.protocol === 'data:' || url.protocol === 'blob:') return 'image.png';
    const last = url.pathname.split('/').pop();
    if (last) return decodeURIComponent(last);
  } catch {
    // not a parseable URL — fall through to the default
  }
  return 'image.png';
}

export async function downloadBatch(sources: string[], onDownloaded?: (src: string) => void) {
  await shareOrDownloadBatch(
    sources.map((src) => ({ src, filename: filenameFromSrc(src) })),
    onDownloaded,
  );
}

export async function shareOrDownloadBatch(
  targets: ShareTarget[],
  onCompleted?: (src: string) => void,
): Promise<void> {
  if (targets.length === 0) return;
  if (isIOSStandalone() && !canSaveToPhotosInNativeApp()) {
    if (await saveWithShareSheet(targets) === 'shared') {
      for (const { src } of targets) onCompleted?.(src);
    }
    return;
  }
  for (const { src, filename } of targets) await downloadImage(src, filename, onCompleted);
}

export type { ShareTarget };
