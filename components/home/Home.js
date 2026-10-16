'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, Dialog, Toasts, toast, useMenu } from '@/components/common/ui';
import { useI18n, LanguageButton } from '@/components/common/i18n';
import { listProjects, loadProject, saveProject, deleteProject } from '@/lib/storage/db';
import { createProject } from '@/lib/project/model';
import { readInputFiles, importEntries, exportProjectZip, downloadBlob } from '@/lib/project/io';
import { safeFileName } from '@/lib/project/model';
import { GuideDialog, WelcomeDialog, onboardingSeen, markOnboardingSeen } from '@/components/help/Guide';

/** Formats d'écran proposés pour une application vide */
const sizePresets = (t) =>
  [
    { id: 'tablet', name: t('home.presetTablet'), w: 1366, h: 768 },
    { id: 'hd', name: t('home.presetHd'), w: 1920, h: 1080 },
    { id: 'tablet43', name: t('home.presetTablet43'), w: 1024, h: 768 },
    { id: 'phone', name: t('home.presetPhone'), w: 640, h: 1136 },
    { id: 'custompage', name: t('home.presetCustomPage'), w: 1366, h: 480 },
  ].map((s) => ({ ...s, label: `${s.name} (${s.w} × ${s.h})` }));

export default function Home() {
  const { t, formatDate } = useI18n();
  const router = useRouter();
  const [projects, setProjects] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const [openMenu, menuEl] = useMenu();

  const refresh = useCallback(async () => {
    try {
      setProjects(await listProjects());
    } catch (e) {
      toast(t('home.storageUnavailable', { message: e.message }), 'error');
      setProjects([]);
    }
  }, [t]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Premier lancement dans ce navigateur : accueil de prise en main
  useEffect(() => {
    if (!onboardingSeen('welcome')) setDialog({ type: 'welcome' });
  }, []);
  const closeWelcome = (next = null) => {
    markOnboardingSeen('welcome');
    setDialog(next);
  };

  const open = (id) => router.push(`/studio/${id}`);

  const dateText = (s) => {
    if (!s) return '';
    try {
      return formatDate(s, { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return s;
    }
  };

  const createBlank = async ({ name, preset }) => {
    const p = createProject(name || t('project.newAppName'));
    const presets = sizePresets(t);
    const sz = presets.find((s) => s.id === preset) || presets[0];
    p.settings = { ...p.settings, width: sz.w, height: sz.h };
    await saveProject(p);
    open(p.id);
  };

  const importFiles = async (files, name) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const { entries, meta } = await readInputFiles(files);
      if (!entries.length) {
        toast(t('home.noYamlFound'), 'warning');
        return;
      }
      const { project, report } = importEntries(null, entries, meta);
      const failed = report.filter((r) => !r.ok);
      if (!project.screens.length) {
        toast(t('home.importImpossible', { details: failed.map((f) => `${f.file} — ${f.message}`).join(' | ') }), 'error', { timeout: 12000 });
        return;
      }
      project.name = name || meta?.name || (files.length === 1 ? files[0].name.replace(/\.(zip|ya?ml)$/i, '') : t('project.importedName'));
      await saveProject(project);
      if (failed.length) toast(t('home.filesSkipped', { count: failed.length, files: failed.map((f) => f.file).join(', ') }), 'warning', { timeout: 9000 });
      toast(t('home.projectImported', { name: project.name, count: project.screens.length }), 'success');
      open(project.id);
    } catch (e) {
      toast(t('home.importError', { message: e.message }), 'error');
    } finally {
      setBusy(false);
    }
  };

  const importPasted = async (text, name) => {
    await importFiles([{ name: t('home.pastedFileName'), text }], name || t('home.pastedName'));
  };


  const duplicate = async (id) => {
    const p = await loadProject(id);
    if (!p) return;
    const copy = { ...structuredClone(p), id: createProject().id, name: t('home.copyName', { name: p.name }), createdAt: new Date().toISOString() };
    await saveProject(copy);
    refresh();
  };

  const exportZip = async (id) => {
    const p = await loadProject(id);
    if (!p) return;
    const blob = await exportProjectZip(p);
    downloadBlob(blob, `${safeFileName(p.name)}.zip`);
  };

  const rename = async (id, name) => {
    const p = await loadProject(id);
    if (!p) return;
    await saveProject({ ...p, name });
    refresh();
  };

  const remove = async (id) => {
    await deleteProject(id);
    toast(t('home.projectDeleted'), 'info');
    refresh();
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) importFiles(files);
  };

  return (
    <div
      className="home"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOver(false);
      }}
      onDrop={onDrop}
    >
      <header className="home-header">
        <div className="home-brand">
          <span className="brand-mark">
            <Icon name="Component" size={18} />
          </span>
          <div>
            <div className="brand-title">Canevas Studio</div>
            <div className="brand-sub">{t('home.brandSub')}</div>
          </div>
        </div>
        <div className="home-header-actions">
          <button className="btn btn-sm home-lang" type="button" onClick={() => setDialog({ type: 'guide' })} title={t('help.guideTitle')}>
            <Icon name="QuestionMark" size={16} /> {t('help.guideButton')}
          </button>
          <LanguageButton className="btn btn-sm home-lang" />
        </div>
      </header>

      <main className="home-main">
        <section className="home-hero">
          <h1>{t('home.heroTitle')}</h1>
          <p>{t('home.heroText')}</p>
          <div className="home-actions">
            <button className="action-card" type="button" onClick={() => setDialog({ type: 'new' })}>
              <Icon name="Add" size={24} />
              <span className="ac-title">{t('home.blankApp')}</span>
              <span className="ac-sub">{t('home.blankAppSub')}</span>
            </button>
            <button className="action-card" type="button" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Icon name="ArrowImport" size={24} />
              <span className="ac-title">{t('home.importFiles')}</span>
              <span className="ac-sub">{t('home.importFilesSub')}</span>
            </button>
            <button className="action-card" type="button" onClick={() => setDialog({ type: 'paste' })}>
              <Icon name="Paste" size={24} />
              <span className="ac-title">{t('home.pasteYaml')}</span>
              <span className="ac-sub">{t('home.pasteYamlSub')}</span>
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".zip,.yml,.yaml,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              importFiles([...e.target.files]);
              e.target.value = '';
            }}
          />
        </section>

        <section className="home-list">
          <div className="home-list-header">
            <h2>{t('home.myApps')}</h2>
            {busy ? <span className="spinner" /> : null}
          </div>
          {projects === null ? (
            <div className="empty-state">
              <span className="spinner" />
            </div>
          ) : projects.length === 0 ? (
            <div className="empty-state">
              <Icon name="Folder" size={40} />
              <div>{t('home.emptyTitle')}</div>
              <div className="small">{t('home.emptyText')}</div>
            </div>
          ) : (
            <table className="project-table">
              <thead>
                <tr>
                  <th>{t('home.name')}</th>
                  <th>{t('home.colScreens')}</th>
                  <th>{t('home.colData')}</th>
                  <th>{t('home.colSize')}</th>
                  <th>{t('home.colModified')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id} onDoubleClick={() => open(p.id)}>
                    <td>
                      <button className="project-name" type="button" onClick={() => open(p.id)}>
                        <span className="project-icon">
                          <Icon name="Screen" size={16} />
                        </span>
                        {p.name}
                      </button>
                    </td>
                    <td className="muted" title={p.screens.join(', ')}>
                      {p.screens.length} — {p.screens.slice(0, 3).join(', ')}
                      {p.screens.length > 3 ? '…' : ''}
                    </td>
                    <td className="muted">
                      {t('home.tablesCount', { count: p.dataSources })}, {t('home.flowsCount', { count: p.flows })}
                    </td>
                    <td className="muted">
                      {p.width} × {p.height}
                    </td>
                    <td className="muted">{dateText(p.updatedAt)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="icon-btn"
                        type="button"
                        aria-label={t('home.actions')}
                        onClick={(e) =>
                          openMenu(e, [
                            { label: t('home.open'), icon: 'Open', onClick: () => open(p.id) },
                            { label: t('common.rename'), icon: 'Edit', onClick: () => setDialog({ type: 'rename', id: p.id, name: p.name }) },
                            { label: t('common.duplicate'), icon: 'Copy', onClick: () => duplicate(p.id) },
                            { label: t('home.exportZip'), icon: 'ArrowDownload', onClick: () => exportZip(p.id) },
                            { sep: true },
                            { label: t('common.delete'), icon: 'Delete', danger: true, onClick: () => setDialog({ type: 'delete', id: p.id, name: p.name }) },
                          ], { align: 'end' })
                        }
                      >
                        <Icon name="More" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>

      {dragOver ? (
        <div className="drop-overlay">
          <Icon name="ArrowUpload" size={40} />
          <div>{t('home.dropHint')}</div>
        </div>
      ) : null}

      {dialog?.type === 'welcome' ? <WelcomeDialog onClose={() => closeWelcome()} onOpenGuide={() => closeWelcome({ type: 'guide' })} /> : null}
      {dialog?.type === 'guide' ? <GuideDialog onClose={() => setDialog(null)} /> : null}
      {dialog?.type === 'new' ? <NewProjectDialog onClose={() => setDialog(null)} onCreate={createBlank} /> : null}
      {dialog?.type === 'paste' ? <PasteDialog onClose={() => setDialog(null)} onImport={importPasted} /> : null}
      {dialog?.type === 'rename' ? (
        <RenameDialog
          initial={dialog.name}
          onClose={() => setDialog(null)}
          onRename={(n) => {
            rename(dialog.id, n);
            setDialog(null);
          }}
        />
      ) : null}
      {dialog?.type === 'delete' ? (
        <Dialog
          title={t('home.deleteTitle')}
          onClose={() => setDialog(null)}
          footer={
            <>
              <button className="btn" type="button" onClick={() => setDialog(null)}>
                {t('common.cancel')}
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => {
                  remove(dialog.id);
                  setDialog(null);
                }}
              >
                {t('common.delete')}
              </button>
            </>
          }
        >
          <p>{t('home.deleteText', { name: dialog.name })}</p>
        </Dialog>
      ) : null}
      {menuEl}
      <Toasts />
    </div>
  );
}

function NewProjectDialog({ onClose, onCreate }) {
  const { t } = useI18n();
  const [name, setName] = useState(() => t('project.newAppName'));
  const [preset, setPreset] = useState('tablet');
  return (
    <Dialog
      title={t('home.newAppTitle')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-primary" type="button" onClick={() => onCreate({ name, preset })}>
            {t('home.create')}
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="np-name">{t('home.name')}</label>
        <input id="np-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <div className="field">
        <label>{t('home.format')}</label>
        <div className="preset-grid">
          {sizePresets(t).map((s) => (
            <button key={s.id} type="button" className={`preset${preset === s.id ? ' is-active' : ''}`} onClick={() => setPreset(s.id)}>
              <span className="preset-box" style={{ aspectRatio: `${s.w} / ${s.h}` }} />
              <span>{s.label}</span>
            </button>
          ))}
        </div>
      </div>
    </Dialog>
  );
}

function PasteDialog({ onClose, onImport }) {
  const { t, rich } = useI18n();
  const [text, setText] = useState('');
  const [name, setName] = useState(() => t('home.pastedName'));
  return (
    <Dialog
      title={t('home.pasteTitle')}
      size="wide"
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-primary" type="button" disabled={!text.trim()} onClick={() => onImport(text, name)}>
            {t('home.createProject')}
          </button>
        </>
      }
    >
      <p className="muted small" style={{ marginTop: 0 }}>
        {rich('home.pasteHelp', null, { b: (c) => <b>{c}</b>, code: (c) => <code>{c}</code> })}
      </p>
      <div className="field">
        <label htmlFor="pd-name">{t('home.projectName')}</label>
        <input id="pd-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <textarea className="textarea mono" rows={18} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Screens:\n  Screen1:\n    Properties:\n      Fill: =Color.White\n    Children:\n      - ...'} autoFocus />
    </Dialog>
  );
}

function RenameDialog({ initial, onClose, onRename }) {
  const { t } = useI18n();
  const [name, setName] = useState(initial);
  return (
    <Dialog
      title={t('home.renameTitle')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-primary" type="button" disabled={!name.trim()} onClick={() => onRename(name.trim())}>
            {t('common.rename')}
          </button>
        </>
      }
    >
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus onKeyDown={(e) => e.key === 'Enter' && name.trim() && onRename(name.trim())} />
    </Dialog>
  );
}
