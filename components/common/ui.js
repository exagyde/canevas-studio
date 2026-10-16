'use client';
// Composants d'interface réutilisables : icône, menu contextuel, boîte de dialogue, notifications.
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { iconPrimitives } from '@/lib/icons/iconPaths';
// t (langue courante) et non useI18n : components/common/i18n.js importe ce module
import { t } from '@/lib/i18n';

// ---------------------------------------------------------------------------
// Icône
// ---------------------------------------------------------------------------
export function Icon({ name, size = 16, className = '', style, strokeWidth = 1.6, title, color }) {
  const prims = iconPrimitives(name) || [];
  return (
    <svg
      className={`ui-icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={color ? { color, ...style } : style}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {prims.map((p, i) => {
        const fillProps = p.fill ? { fill: 'currentColor', stroke: 'none' } : {};
        if (p.d) return <path key={i} d={p.d} {...fillProps} />;
        if (p.circle) return <circle key={i} cx={p.circle[0]} cy={p.circle[1]} r={p.circle[2]} {...fillProps} />;
        if (p.rect) return <rect key={i} x={p.rect[0]} y={p.rect[1]} width={p.rect[2]} height={p.rect[3]} rx={p.rect[4] || 0} {...fillProps} />;
        return null;
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Menu contextuel / déroulant
// ---------------------------------------------------------------------------
export function Menu({ anchor, items, onClose, align = 'start', minWidth }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: -9999, top: -9999 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !anchor) return;
    const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : anchor;
    const mw = el.offsetWidth;
    const mh = el.offsetHeight;
    let left = align === 'end' ? r.right - mw : r.left;
    let top = (r.bottom ?? r.top) + 4;
    if (r.width === 0 && r.height === 0) top = r.top;
    if (left + mw > window.innerWidth - 8) left = window.innerWidth - mw - 8;
    if (left < 8) left = 8;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, (r.top ?? top) - mh - 4);
    setPos({ left, top });
  }, [anchor, align, items]);

  useEffect(() => {
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose?.();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', onDown, true);
      window.addEventListener('keydown', onKey, true);
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="menu" ref={ref} style={{ ...pos, minWidth }} role="menu" onContextMenu={(e) => e.preventDefault()}>
      {items.filter(Boolean).map((it, i) => {
        if (it.sep) return <div key={i} className="menu-sep" />;
        if (it.title) return <div key={i} className="menu-title">{it.title}</div>;
        return (
          <button
            key={i}
            type="button"
            role="menuitem"
            className={`menu-item${it.danger ? ' danger' : ''}`}
            disabled={it.disabled}
            onClick={() => {
              onClose?.();
              it.onClick?.();
            }}
          >
            {it.icon ? <Icon name={it.icon} size={16} /> : <span style={{ width: 16 }} />}
            <span style={{ flex: 1, minWidth: 0 }}>{it.label}</span>
            {it.shortcut ? <span className="menu-shortcut">{it.shortcut}</span> : null}
            {it.checked ? <Icon name="Check" size={14} /> : null}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

/** Hook : ouvre un menu à partir d'un événement (clic ou clic droit) */
export function useMenu() {
  const [state, setState] = useState(null);
  const open = useCallback((e, items, opts = {}) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    const anchor = opts.atPointer ? { left: e.clientX, top: e.clientY, right: e.clientX, bottom: e.clientY, width: 0, height: 0 } : e.currentTarget;
    setState({ anchor, items, align: opts.align });
  }, []);
  const close = useCallback(() => setState(null), []);
  const element = state ? <Menu anchor={state.anchor} items={state.items} align={state.align} onClose={close} /> : null;
  return [open, element, close];
}

// ---------------------------------------------------------------------------
// Boîte de dialogue
// ---------------------------------------------------------------------------
export function Dialog({ title, onClose, children, footer, size = '', icon, closeOnBackdrop = true }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className={`dialog ${size}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <div className="dialog-header">
          {icon ? <Icon name={icon} size={22} /> : null}
          <h2 className="dialog-title">{title}</h2>
          <button className="icon-btn" type="button" onClick={onClose} aria-label={t('common.close')}>
            <Icon name="Cancel" />
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer ? <div className="dialog-footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Notifications (toasts)
// ---------------------------------------------------------------------------
let toasts = [];
const toastListeners = new Set();
function emitToasts() {
  for (const l of toastListeners) l();
}

export function toast(message, type = 'info', opts = {}) {
  const id = Math.random().toString(36).slice(2);
  toasts = [...toasts, { id, message, type, title: opts.title }];
  emitToasts();
  const timeout = opts.timeout ?? (type === 'error' ? 8000 : 3500);
  if (timeout > 0) setTimeout(() => dismissToast(id), timeout);
  return id;
}

export function dismissToast(id) {
  toasts = toasts.filter((t) => t.id !== id);
  emitToasts();
}

export function Toasts() {
  const list = useSyncExternalStore(
    (cb) => {
      toastListeners.add(cb);
      return () => toastListeners.delete(cb);
    },
    () => toasts,
    () => toasts,
  );
  const icons = { success: 'CheckmarkCircle', error: 'Error', warning: 'Warning', info: 'Info' };
  return (
    <div className="toasts" aria-live="polite">
      {list.map((item) => (
        <div key={item.id} className={`toast ${item.type}`}>
          <Icon name={icons[item.type] || 'Info'} size={18} className={`sev-${item.type === 'success' ? 'info' : item.type}`} />
          <div className="toast-body">
            {item.title ? <div className="toast-title">{item.title}</div> : null}
            <div>{item.message}</div>
          </div>
          <button className="icon-btn sm" type="button" onClick={() => dismissToast(item.id)} aria-label={t('common.close')}>
            <Icon name="Cancel" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Divers
// ---------------------------------------------------------------------------
export function Switch({ checked, onChange, label, disabled }) {
  return (
    <label className="switch" style={disabled ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange?.(e.target.checked)} disabled={disabled} />
      <span className="track" />
      {label ? <span>{label}</span> : null}
    </label>
  );
}

export function Spinner({ size = 16 }) {
  return <span className="spinner" style={{ width: size, height: size }} />;
}
