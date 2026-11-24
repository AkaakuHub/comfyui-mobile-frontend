import { create } from 'zustand';

interface InstallPrompt extends Event {
  prompt(): Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let pendingPrompt: InstallPrompt | undefined;

export const usePwaInstalled = create<{ installed: boolean }>(() => ({
  installed: (window.matchMedia?.('(display-mode: standalone)')?.matches ?? false)
    || ('standalone' in navigator && navigator.standalone === true),
}));

window.addEventListener('beforeinstallprompt', (event) => {
  if ('prompt' in event && typeof event.prompt === 'function') {
    event.preventDefault();
    pendingPrompt = event as InstallPrompt;
  }
});

window.addEventListener('appinstalled', () => {
  pendingPrompt = undefined;
  usePwaInstalled.setState({ installed: true });
});

export async function showInstallPrompt(): Promise<boolean> {
  const prompt = pendingPrompt;
  if (!prompt) return false;
  pendingPrompt = undefined;
  try {
    const { outcome } = await prompt.prompt();
    if (outcome === 'accepted') usePwaInstalled.setState({ installed: true });
    return true;
  } catch {
    return false;
  }
}
