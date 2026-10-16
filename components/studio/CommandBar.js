'use client';
import { useState } from 'react';
import { useStudio } from './context';
import { Icon, useMenu, toast } from '@/components/common/ui';
import { useI18n, languageMenuItems } from '@/components/common/i18n';
import { screenYaml, controlsYaml, componentsYaml, findNode, safeFileName } from '@/lib/project/model';
import { serializeScreens } from '@/lib/pa/yaml';
import { copyText, downloadText, exportProjectZip, downloadBlob } from '@/lib/project/io';
import { ImportDialog } from './dialogs';

export default function CommandBar() {
  const s = useStudio();
  const { t, locale, setLocale } = useI18n();
  const [openMenu, menuEl] = useMenu();
  const [importOpen, setImportOpen] = useState(false);
  const { project, screen } = s;

  const copyScreen = async () => {
    if (!screen) return;
    const ok = await copyText(screenYaml(screen));
    toast(ok ? t('studio.screenYamlCopiedHint', { name: screen.name }) : t('common.copyFailed'), ok ? 'success' : 'error', { timeout: 6000 });
  };

  const copyControl = async () => {
    const f = findNode(project, s.selectedId);
    if (f?.kind !== 'control') {
      toast(t('studio.selectControlFirst'), 'warning');
      return;
    }
    const ok = await copyText(controlsYaml([f.node]));
    toast(ok ? t('studio.controlYamlCopied', { name: f.node.name }) : t('common.copyFailed'), ok ? 'success' : 'error');
  };

  const exportMenu = (e) =>
    openMenu(
      e,
      [
        { label: t('studio.copyScreenYaml'), icon: 'Copy', onClick: copyScreen },
        { label: t('studio.copySelectedControlYaml'), icon: 'Copy', onClick: copyControl },
        { label: t('studio.copyAllScreens'), icon: 'Copy', onClick: async () => toast((await copyText(serializeScreens(project.screens))) ? t('studio.allScreensCopied') : t('common.copyFailed'), 'success') },
        project.components?.length
          ? { label: t('studio.copyComponents'), icon: 'Component', onClick: async () => toast((await copyText(componentsYaml(project.components))) ? t('studio.componentsCopied') : t('common.copyFailed'), 'success') }
          : null,
        { sep: true },
        { label: t('studio.downloadScreen'), icon: 'ArrowDownload', onClick: () => screen && downloadText(screenYaml(screen), `${safeFileName(screen.name)}.pa.yaml`) },
        {
          label: t('studio.exportProject'),
          icon: 'ArrowExport',
          onClick: async () => {
            const blob = await exportProjectZip(project);
            downloadBlob(blob, `${safeFileName(project.name)}.zip`);
          },
        },
      ],
      { align: 'end' },
    );

  const newScreenMenu = (e) =>
    openMenu(e, [
      { label: t('studio.importPasteYaml'), icon: 'ArrowImport', onClick: () => setImportOpen(true) },
      { label: t('studio.blankScreen'), icon: 'Screen', onClick: () => s.addScreen() },
      { label: t('studio.duplicateCurrentScreen'), icon: 'Copy', onClick: () => screen && s.addScreen({ duplicateOf: screen._id }) },
    ]);

  const moreMenu = (e) =>
    openMenu(e, [
      { label: t('studio.appSettings'), icon: 'Settings', onClick: () => s.setLeftPanel('settings') },
      { label: t('studio.appYamlMenu'), icon: 'Apps', onClick: () => s.showYaml('app') },
      { sep: true },
      { label: t('studio.resetRuntimeState'), icon: 'ArrowSync', onClick: () => s.rt.resetState() },
      { label: t('studio.runAppOnStart'), icon: 'Play', onClick: () => s.rt.runAppOnStart() },
      { label: t('studio.runScreenOnVisible'), icon: 'Play', onClick: () => screen && s.rt.runScreenBehavior(screen.name, 'OnVisible') },
      { sep: true },
      ...languageMenuItems(locale, setLocale, t('common.language')),
    ]);

  const saveLabel = { saved: t('studio.saveSaved'), dirty: t('studio.saveDirty'), saving: t('studio.saveSaving'), error: t('common.error') }[s.saveState];
  const sum = s.issueSummary;

  return (
    <header className="cmdbar">
      <button className="cmd" type="button" onClick={s.goHome} title={t('studio.backToAppListTitle')}>
        <Icon name="ArrowLeft" />
        <span>{t('studio.previous')}</span>
      </button>
      <span className="cmd-sep" />
      <button className="cmd icon-only" type="button" onClick={s.undo} disabled={!s.canUndo} title={t('studio.undoTitle')}>
        <Icon name="ArrowUndo" />
      </button>
      <button className="cmd icon-only" type="button" onClick={s.redo} disabled={!s.canRedo} title={t('studio.redoTitle')}>
        <Icon name="ArrowRedo" />
      </button>
      <span className="cmd-sep" />
      <button
        className="cmd"
        type="button"
        data-tour="paste"
        title={t('studio.pasteYamlTitle')}
        onClick={async () => {
          try {
            s.pasteText(await navigator.clipboard.readText());
          } catch {
            setImportOpen(true);
          }
        }}
      >
        <Icon name="Paste" />
        <span>{t('studio.pasteYaml')}</span>
      </button>
      <button className="cmd" type="button" onClick={newScreenMenu}>
        <Icon name="Screen" />
        <span>{t('studio.newScreen')}</span>
        <Icon name="ChevronDown" size={12} />
      </button>
      <button className="cmd hide-narrow" type="button" onClick={() => s.setLeftPanel('data')}>
        <Icon name="Database" />
        <span>{t('studio.data')}</span>
      </button>
      <button className="cmd icon-only" type="button" onClick={moreMenu} title={t('studio.moreCommands')}>
        <Icon name="More" />
      </button>

      <span className="spacer" />

      <span className={`save-state ${s.saveState}`} title={t('studio.autoSaveTitle')}>
        {s.saveState === 'saving' ? <span className="spinner" /> : <Icon name={s.saveState === 'error' ? 'Warning' : 'Save'} size={14} />}
        {saveLabel}
      </span>
      <button className={`cmd${s.leftPanel === 'issues' ? ' is-active' : ''}`} type="button" title={t('studio.appChecker')} onClick={() => s.setLeftPanel(s.leftPanel === 'issues' ? null : 'issues')}>
        <Icon name="Stethoscope" />
        {sum.error ? <span className="badge error">{sum.error}</span> : null}
        {sum.warning ? <span className="badge warning">{sum.warning}</span> : null}
        {!sum.error && !sum.warning ? <Icon name="CheckmarkCircle" size={14} className="sev-ok" /> : null}
      </button>
      <button className="cmd icon-only" type="button" onClick={s.startPreview} title={t('studio.previewAppTitle')}>
        <Icon name="Play" />
      </button>
      <button className={`cmd${s.aiOpen ? ' is-active' : ''}`} type="button" onClick={() => s.setAiOpen(!s.aiOpen)} title={t('studio.aiAssistant')}>
        <Icon name="Sparkle" />
        <span className="hide-narrow">{t('studio.aiAssistant')}</span>
      </button>
      <button className="cmd icon-only" type="button" data-tour="help" onClick={s.openGuide} title={t('help.guideTitle')} aria-label={t('help.guideTitle')}>
        <Icon name="QuestionMark" />
      </button>
      <span className="cmd-sep" />
      <div className="split-btn" data-tour="copy">
        <button className="btn btn-primary" type="button" onClick={copyScreen} title={t('studio.copyForPowerAppsTitle')}>
          <Icon name="Copy" size={16} />
          {t('studio.copyForPowerApps')}
        </button>
        <button className="btn btn-primary split-chevron" type="button" onClick={exportMenu} aria-label={t('studio.moreExportOptions')}>
          <Icon name="ChevronDown" size={14} />
        </button>
      </div>

      {importOpen ? <ImportDialog onClose={() => setImportOpen(false)} /> : null}
      {menuEl}
    </header>
  );
}

/** Icône de l'arborescence selon le type de contrôle du catalogue */
export function iconForInsert(icon) {
  const map = {
    container: 'Container',
    hcontainer: 'HorizontalContainer',
    vcontainer: 'VerticalContainer',
    gallery: 'Gallery',
    hgallery: 'HorizontalGallery',
    form: 'Form',
    button: 'Button',
    text: 'TextT',
    textinput: 'TextInput',
    combobox: 'ComboBox',
    dropdown: 'Dropdown',
    checkbox: 'Checkbox',
    toggle: 'Toggle',
    radio: 'RadioButton',
    calendar: 'DatePicker',
    number: 'TextInput',
    star: 'Star',
    person: 'Avatar',
    spinner: 'Spinner',
    progress: 'Progress',
    tabs: 'Tabs',
    info: 'Info',
    link: 'Link',
    badge: 'Badge',
    table: 'Table',
    add: 'AddCircle',
    rectangle: 'Rectangle',
    circle: 'Circle',
    image: 'Image',
    html: 'Html',
    timer: 'Timer',
    slider: 'Slider',
    list: 'List',
    media: 'Media',
    component: 'Component',
    card: 'Card',
    group: 'Group',
  };
  return map[icon] || 'Box';
}
