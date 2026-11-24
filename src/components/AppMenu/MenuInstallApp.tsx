import { useState } from 'react';
import { Dialog } from '@/components/modals/Dialog';
import { Z_LAYERS } from '@/components/zLayers';
import { useI18n } from '@/i18n';
import { showInstallPrompt, usePwaInstalled } from '@/utils/pwaInstall';
import { menuSurfaceButtonClassName, menuTextClassName } from './menuStyles';

export function MenuInstallApp() {
  const { t } = useI18n();
  const installed = usePwaInstalled((state) => state.installed);
  const [showInstructions, setShowInstructions] = useState(false);
  const [installing, setInstalling] = useState(false);
  if (installed) return null;

  const close = () => setShowInstructions(false);
  const install = async () => {
    setInstalling(true);
    const prompted = await showInstallPrompt();
    setInstalling(false);
    setShowInstructions(!prompted);
  };
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  return (
    <>
      <button
        type="button"
        className={`mb-6 ${menuSurfaceButtonClassName}`}
        disabled={installing}
        onClick={install}
      >
        <span className={menuTextClassName}>{t('Install CueForge')}</span>
      </button>
      {showInstructions && (
        <Dialog
          title={t('Install CueForge')}
          description={isIOS
            ? t('Open the browser’s Share menu and choose Add to Home Screen. If Open as Web App is shown, turn it on.')
            : t('Open the browser menu and choose Install app, Add to Home Screen, or Add to Dock if available.')}
          actions={[{ label: t('Close'), onClick: close, autoFocus: true }]}
          onClose={close}
          zIndex={Z_LAYERS.panelDialog}
        />
      )}
    </>
  );
}
