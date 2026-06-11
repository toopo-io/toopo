'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type JSX, useState } from 'react';
import { authClient } from '../../lib/auth-client';
import type { WorkspaceSummary } from '../../lib/workspaces/workspace';
import { workspaceGlyph } from '../../lib/workspaces/workspace';

interface WorkspacePickerProps {
  readonly workspaces: readonly WorkspaceSummary[];
  readonly activeId: string | null;
}

/**
 * The sidebar workspace switcher (ADR-0028). Lists the workspaces the caller
 * belongs to; choosing one sets it active via the organization plugin and
 * refreshes the server tree so the breadcrumb and scope follow.
 */
export function WorkspacePicker({ workspaces, activeId }: WorkspacePickerProps): JSX.Element {
  const t = useTranslations('AppShell');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const active = workspaces.find((workspace) => workspace.id === activeId) ?? workspaces[0] ?? null;

  if (active === null) {
    return <p className="px-2.5 py-2 text-sm text-muted-foreground">{t('noWorkspace')}</p>;
  }

  const select = async (id: string): Promise<void> => {
    setOpen(false);
    if (id === active.id) {
      return;
    }
    await authClient.organization.setActive({ organizationId: id });
    router.refresh();
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-md border border-border px-2.5 py-2 text-left hover:border-line-strong"
      >
        <WorkspaceGlyph name={active.name} />
        <span className="flex-1 truncate font-semibold text-sm">{active.name}</span>
        <span className="text-muted-foreground text-xs" aria-hidden="true">
          ▾
        </span>
      </button>
      {open ? (
        <ul className="absolute top-[calc(100%+4px)] right-0 left-0 z-40 rounded-lg border border-line-strong bg-popover p-1 shadow-lg">
          {workspaces.map((workspace) => (
            <li key={workspace.id}>
              <button
                type="button"
                onClick={() => void select(workspace.id)}
                aria-current={workspace.id === active.id ? 'true' : undefined}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-accent"
              >
                <WorkspaceGlyph name={workspace.name} />
                <span className="truncate font-semibold text-[13px]">{workspace.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function WorkspaceGlyph({ name }: { name: string }): JSX.Element {
  return (
    <span className="grid size-4.5 place-items-center rounded-[5px] bg-primary font-bold text-[10px] text-primary-foreground">
      {workspaceGlyph(name)}
    </span>
  );
}
