import { Dialog } from './Dialog';
import { Z_LAYERS } from '@/components/zLayers';
import { useI18n } from '@/i18n';
import { usePwaFileSave } from '@/utils/pwaFileSave';

export function PwaFileSaveDialog() {
  const request = usePwaFileSave((state) => state.request);
  const { t } = useI18n();
  if (!request) return null;

  const title = request.phase === 'failed' ? t('Download failed.')
    : request.phase === 'loading' ? t('Downloading…') : t('Save');
  return (
    <Dialog
      title={title}
      onClose={request.close}
      actions={request.phase === 'failed'
        ? [{ label: t('Close'), onClick: request.close, autoFocus: true }]
        : [
          { label: t('Cancel'), onClick: request.close },
          { label: t('Save'), onClick: request.save, disabled: request.phase !== 'ready', variant: 'primary' },
        ]}
      zIndex={Z_LAYERS.panelDialog}
    />
  );
}
