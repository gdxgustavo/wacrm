'use client';

import { useCan } from '@/hooks/use-can';

import { CustomFieldsSettings } from './custom-fields-settings';
import { SettingsPanelHead } from './settings-panel-head';
import { TagManager } from './tag-manager';

/**
 * "Fields & tags" section — merges the former Tags and Custom Fields
 * tabs. Tags are visible to everyone; the custom-fields catalogue is
 * account-wide config, so the card is admin-gated (mirroring the old
 * hidden-tab behaviour). `custom_fields` RLS rejects non-admin writes
 * regardless.
 */
export function FieldsAndTagsPanel() {
  const canEditSettings = useCan('edit-settings');

  return (
    <section className="animate-in fade-in-50 max-w-3xl space-y-4 duration-200">
      <SettingsPanelHead
        title="Campos e tags"
        description="Duas maneiras de organizar contatos: tags codificadas por cores para agrupamento rápido e campos personalizados para dados estruturados."
      />
      <TagManager />
      {canEditSettings ? <CustomFieldsSettings /> : null}
    </section>
  );
}
