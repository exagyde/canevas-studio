'use client';
import { useMemo, useRef, useState } from 'react';
import { Dialog, Icon, toast } from '@/components/common/ui';
import { useI18n } from '@/components/common/i18n';
import { useStudio } from './context';
import { parsePaYaml } from '@/lib/pa/yaml';
import { readInputFiles, importEntries } from '@/lib/project/io';

/** Import d'écrans dans le projet courant (collage ou fichiers) */
export function ImportDialog({ onClose }) {
  const s = useStudio();
  const { t } = useI18n();
  const [tab, setTab] = useState('paste');
  const [text, setText] = useState('');
  const [mode, setMode] = useState('replace');
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const parsed = useMemo(() => (text.trim() ? parsePaYaml(text) : null), [text]);

  const doPaste = () => {
    if (!parsed) return;
    if (parsed.errors.length) return;
    const ok = s.pasteText(text, { replace: mode === 'replace' });
    if (ok) onClose();
  };

  const doFiles = async (files) => {
    setBusy(true);
    try {
      const { entries, meta } = await readInputFiles(files);
      const r = importEntries(s.getProject(), entries, meta, { mode });
      s.update(r.project);
      setReport(r.report);
      const n = r.report.filter((x) => x.ok).length;
      toast(t('studio.filesImported', { count: n }), n ? 'success' : 'warning');
    } catch (e) {
      toast(t('studio.importError', { message: e.message }), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={t('studio.importScreens')}
      size="wide"
      onClose={onClose}
      footer={
        <>
          <label className="row small">
            <input type="checkbox" checked={mode === 'replace'} onChange={(e) => setMode(e.target.checked ? 'replace' : 'add')} />
            {t('studio.replaceSameName')}
          </label>
          <span className="spacer" />
          <button className="btn" type="button" onClick={onClose}>
            {t('common.close')}
          </button>
          {tab === 'paste' ? (
            <button className="btn btn-primary" type="button" disabled={!parsed || parsed.errors.length > 0 || parsed.kind === 'empty'} onClick={doPaste}>
              {t('studio.import')}
            </button>
          ) : null}
        </>
      }
    >
      <div className="tabs" style={{ padding: 0, marginBottom: 12 }}>
        <button className={`tab${tab === 'paste' ? ' is-active' : ''}`} type="button" onClick={() => setTab('paste')}>
          {t('studio.pasteYaml')}
        </button>
        <button className={`tab${tab === 'files' ? ' is-active' : ''}`} type="button" onClick={() => setTab('files')}>
          {t('studio.filesTab')}
        </button>
      </div>
      {tab === 'paste' ? (
        <>
          <textarea
            className="textarea mono"
            rows={16}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('studio.importPlaceholder')}
            autoFocus
          />
          {parsed ? (
            <div style={{ marginTop: 8 }}>
              {parsed.errors.length ? (
                <div className="message-bar error">
                  <Icon name="Error" size={16} />
                  <div>
                    {parsed.errors.slice(0, 5).map((e, i) => (
                      <div key={i}>{t('studio.lineColError', { line: e.line, col: e.col, message: e.message })}</div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="message-bar success">
                  <Icon name="CheckmarkCircle" size={16} />
                  <div>
                    {t('studio.yamlValidSummary', {
                      summary:
                        parsed.kind === 'controls'
                          ? t('studio.controlsToInsert', { count: parsed.controls.length })
                          : [
                              parsed.screens.length ? t('studio.screensList', { count: parsed.screens.length, names: parsed.screens.map((x) => x.name).join(', ') }) : '',
                              parsed.app ? 'App' : '',
                              parsed.components.length ? t('studio.componentsCount', { count: parsed.components.length }) : '',
                            ]
                              .filter(Boolean)
                              .join(' · ') || t('studio.noRecognizedContent'),
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div
            className="drop-zone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              doFiles([...e.dataTransfer.files]);
            }}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? <span className="spinner" /> : <Icon name="ArrowUpload" size={32} />}
            <div>{t('studio.dropHint')}</div>
            <div className="muted small">{t('studio.dropHintMore')}</div>
          </div>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".zip,.yml,.yaml,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              doFiles([...e.target.files]);
              e.target.value = '';
            }}
          />
          {report ? (
            <ul className="import-report">
              {report.map((r, i) => (
                <li key={i} className={r.ok ? 'ok' : 'ko'}>
                  <Icon name={r.ok ? 'CheckmarkCircle' : 'Error'} size={14} />
                  <b>{r.file}</b> — {r.message}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </Dialog>
  );
}
