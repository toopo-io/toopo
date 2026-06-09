'use client';

import { Button } from '@toopo/ui/components/button';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { type JSX, useState } from 'react';
import { Env } from '../../../../env';
import { authClient } from '../../../lib/auth-client';

export function AccountActions(): JSX.Element {
  const t = useTranslations('Auth.account');
  const locale = useLocale();
  const router = useRouter();
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleExport = async (): Promise<void> => {
    setIsExporting(true);
    setExportError(null);
    try {
      const response = await fetch(`${Env.NEXT_PUBLIC_API_URL}/v1/user/data-export`, {
        credentials: 'include',
      });
      if (!response.ok) {
        setExportError(t('export.error'));
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'toopo-data-export.json';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch {
      setExportError(t('export.error'));
    } finally {
      setIsExporting(false);
    }
  };

  const handleDelete = async (): Promise<void> => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch(`${Env.NEXT_PUBLIC_API_URL}/v1/user/me`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) {
        setDeleteError(t('delete.error'));
        setIsDeleting(false);
        return;
      }
      await authClient.signOut();
      router.push(`/${locale}/`);
      router.refresh();
    } catch {
      setDeleteError(t('delete.error'));
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 border-t pt-4">
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{t('export.title')}</h3>
        <p className="text-xs text-muted-foreground">{t('export.description')}</p>
        <Button
          type="button"
          variant="outline"
          onClick={handleExport}
          disabled={isExporting}
          className="self-start"
        >
          {isExporting ? t('export.exporting') : t('export.button')}
        </Button>
        {exportError !== null ? (
          <p className="text-xs text-destructive" role="alert">
            {exportError}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-destructive">{t('delete.title')}</h3>
        <p className="text-xs text-muted-foreground">{t('delete.description')}</p>
        {showDeleteConfirm ? (
          <div className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
            <p className="text-sm font-medium text-destructive">{t('delete.confirmTitle')}</p>
            <p className="text-xs text-muted-foreground">{t('delete.confirmBody')}</p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
              >
                {t('delete.cancel')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? t('delete.deleting') : t('delete.confirmButton')}
              </Button>
            </div>
            {deleteError !== null ? (
              <p className="text-xs text-destructive" role="alert">
                {deleteError}
              </p>
            ) : null}
          </div>
        ) : (
          <Button
            type="button"
            variant="destructive"
            onClick={() => setShowDeleteConfirm(true)}
            className="self-start"
          >
            {t('delete.button')}
          </Button>
        )}
      </div>
    </div>
  );
}
