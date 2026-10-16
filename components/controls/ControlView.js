'use client';
// Rendu React des instances de contrôles (arbre calculé par lib/render/build.js).
import { memo, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/common/ui';
import { useI18n } from '@/components/common/i18n';
import { FxColor, FxEnum, isRecord } from '@/lib/fx/values';
import { toText as fxToText, evaluateSync, parseFormula } from '@/lib/fx/index';
import {
  cssColor,
  num,
  bool,
  enumKey,
  text,
  fontFamily,
  fontWeight,
  fontPx,
  textAlign,
  justifyFromAlign,
  verticalAlign,
  shadow,
  borderStyle,
  displayMode,
  radius,
  padding,
  imageUrl,
  MODERN_FONT,
  CLASSIC_FONT,
  isTransparent,
} from '@/lib/render/style';

// ---------------------------------------------------------------------------
// Aides
// ---------------------------------------------------------------------------

function g(inst, prop) {
  return inst.get(prop);
}

/** Valeur d'une propriété en texte (les dates suivent la langue de l'application émulée) */
function gt(inst, prop) {
  return text(inst.get(prop), inst.rt?.locale);
}

function borderCss(inst, fallbackColor = 'transparent') {
  const th = num(g(inst, 'BorderThickness'), 0);
  if (th <= 0) return {};
  const st = borderStyle(g(inst, 'BorderStyle'), 'solid');
  if (st === 'none') return {};
  return { border: `${th}px ${st} ${cssColor(g(inst, 'BorderColor'), fallbackColor)}` };
}

function textDecoration(inst) {
  const parts = [];
  if (bool(g(inst, 'Underline'))) parts.push('underline');
  if (bool(g(inst, 'Strikethrough'))) parts.push('line-through');
  return parts.join(' ') || undefined;
}

function displayText(item, inst) {
  if (item === null || item === undefined) return '';
  const locale = inst.rt?.locale;
  // ItemDisplayText évalué avec ThisItem = item
  const f = inst.node.properties?.ItemDisplayText;
  if (f && f !== '=') {
    const { ast } = parseFormula(f);
    if (ast) {
      try {
        const v = evaluateSync(ast, { ...inst.ctx(), scopes: [...inst.scopes, { kind: 'item', implicit: true, alias: null, rec: item }] });
        return text(v, locale);
      } catch {
        /* ignore */
      }
    }
  }
  if (!isRecord(item)) return text(item, locale);
  if ('Value' in item) return text(item.Value, locale);
  const ds = item[Object.getOwnPropertySymbols(item)[0]];
  if (ds?.primaryName && item[ds.primaryName] !== undefined) return text(item[ds.primaryName], locale);
  const k = Object.keys(item).find((x) => typeof item[x] === 'string') || Object.keys(item)[0];
  return k ? text(item[k], locale) : '';
}

function itemsOf(inst) {
  const v = inst.evalFormula('Items');
  if (Array.isArray(v)) return v;
  if (v === null || v === undefined) return [];
  return isRecord(v) ? [v] : [{ Value: v }];
}

function initials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

const AVATAR_COLORS = ['#0f6cbd', '#c239b3', '#038387', '#ca5010', '#8764b8', '#498205', '#986f0b', '#c50f1f', '#00666d', '#4f6bed'];

// Couleurs de la palette moderne à partir de BasePaletteColor
function paletteFrom(colorValue, fallback = '#0f6cbd') {
  const base = cssColor(colorValue, null);
  if (!base) return { base: fallback, hover: '#115ea3', pressed: '#0c3b5e' };
  const c = colorValue instanceof FxColor ? colorValue : null;
  if (!c) return { base, hover: base, pressed: base };
  const shade = (k) => `rgba(${Math.round(c.r * k)}, ${Math.round(c.g * k)}, ${Math.round(c.b * k)}, ${c.a})`;
  return { base, hover: shade(0.88), pressed: shade(0.72) };
}

// ---------------------------------------------------------------------------
// Vue d'une instance
// ---------------------------------------------------------------------------

export const InstView = memo(function InstView({ inst, rc }) {
  // textes par défaut des contrôles émulés : langue de l'interface (redessinés au changement de langue)
  const i18n = useI18n();
  if (!inst || !inst.visible || !inst.layout) return null;
  const l = inst.layout;
  const def = inst.def;
  const style = { left: l.x, top: l.y, width: l.w, height: l.h };
  const isFlatGroup = inst.flatGroup;
  const errors = inst.errors && rc.mode === 'edit' ? inst.errors : null;
  const selected = rc.selectedId === inst.node._id;
  const cls = `pa-ctl pa-${def.renderer}${selected ? ' is-selected' : ''}${isFlatGroup ? ' pa-flat' : ''}`;
  return (
    <div className={cls} style={isFlatGroup ? { left: 0, top: 0, width: l.w, height: l.h } : style} data-node-id={inst.node._id} data-inst-key={inst.key}>
      {renderControl(inst, rc, i18n)}
      {errors ? (
        <span className="pa-err-badge" title={Object.entries(errors).map(([k, v]) => i18n.t('catalog.errorEntry', { prop: k, message: v })).join('\n')}>
          !
        </span>
      ) : null}
    </div>
  );
});

function Children({ list, rc }) {
  return list.map((c) => <InstView key={c.key} inst={c} rc={rc} />);
}

function run(rc, inst, prop, e) {
  if (!rc.interactive) return;
  e?.stopPropagation?.();
  if (inst.formula(prop) && inst.formula(prop) !== '=') rc.run(inst, prop);
}

/** i18n : { t, rich, locale } de useI18n(), pour les textes par défaut des contrôles */
function renderControl(inst, rc, i18n) {
  const R = RENDERERS[inst.def.renderer] || RENDERERS.unknown;
  return R(inst, rc, i18n);
}

// ---------------------------------------------------------------------------
// Rendus
// ---------------------------------------------------------------------------

const RENDERERS = {
  none: () => null,

  group: (inst, rc) => <Children list={inst.children} rc={rc} />,

  container: (inst, rc) => {
    const fill = cssColor(g(inst, 'Fill'), 'transparent');
    const scrollX = enumKey(g(inst, 'LayoutOverflowX')) === 'scroll';
    const scrollY = enumKey(g(inst, 'LayoutOverflowY')) === 'scroll';
    const content = inst.content || { w: inst.layout.w, h: inst.layout.h };
    const st = {
      background: fill,
      borderRadius: radius(inst),
      boxShadow: shadow(g(inst, 'DropShadow')),
      overflowX: scrollX ? 'auto' : 'hidden',
      overflowY: scrollY ? 'auto' : 'hidden',
    };
    const border = borderCss(inst);
    return (
      <div className="pa-box" style={st}>
        <div className="pa-scroll-content" style={{ width: scrollX ? content.w : '100%', height: scrollY ? content.h : '100%' }}>
          <Children list={inst.children} rc={rc} />
        </div>
        {border.border ? <div className="pa-border" style={{ ...border, borderRadius: radius(inst) }} /> : null}
      </div>
    );
  },

  screen: (inst, rc) => <Children list={inst.children} rc={rc} />,

  gallery: (inst, rc, { t }) => {
    const horizontal = /horizontal/i.test(String(inst.node.head?.Variant || ''));
    const fill = cssColor(g(inst, 'Fill'), 'transparent');
    const content = inst.content || { w: inst.layout.w, h: inst.layout.h };
    const showScroll = bool(g(inst, 'ShowScrollbar'), true);
    const templateFormula = inst.node.properties?.TemplateFill;
    const selected = inst.get('Selected');
    const items = inst.items || [];
    const border = borderCss(inst);
    return (
      <div
        className={`pa-box pa-gallery-box${showScroll ? '' : ' no-scrollbar'}`}
        style={{ background: fill, overflowX: horizontal ? 'auto' : 'hidden', overflowY: horizontal ? 'hidden' : 'auto', ...border }}
      >
        <div className="pa-scroll-content" style={{ width: horizontal ? content.w : '100%', height: horizontal ? '100%' : content.h }}>
          {items.map((it) => {
            let bg;
            if (templateFormula && templateFormula !== '=') {
              const v = evalWithItem(inst, templateFormula, it);
              bg = cssColor(v, undefined);
            }
            const isSel = selected === it.record;
            return (
              <div
                key={it.key}
                className={`pa-gal-item${isSel ? ' is-current' : ''}`}
                style={{ left: it.layout.x, top: it.layout.y, width: it.layout.w, height: it.layout.h, background: bg }}
                onClick={(e) => {
                  if (!rc.interactive) return;
                  if (e.target.closest('.pa-clickable') && e.target.closest('.pa-gal-item') === e.currentTarget && e.target.closest('.pa-clickable') !== e.currentTarget) return;
                  rc.selectGalleryItem(inst, it.index, true);
                }}
              >
                <Children list={it.children} rc={rc} />
              </div>
            );
          })}
          {items.length === 0 && rc.mode === 'edit' ? (
            <div className="pa-empty-hint">
              <Icon name="Gallery" size={20} />
              <span>{t('catalog.emptyGallery')}</span>
            </div>
          ) : null}
          {inst.itemsTruncated ? <div className="pa-trunc">{t('catalog.galleryTruncated', { total: inst.itemsTruncated })}</div> : null}
        </div>
      </div>
    );
  },

  form: (inst, rc, { t }) => {
    const fill = cssColor(g(inst, 'Fill'), 'transparent');
    const content = inst.content || { w: inst.layout.w, h: inst.layout.h };
    const empty = !inst.children.length;
    return (
      <div className="pa-box" style={{ background: fill, overflowY: 'auto', overflowX: 'hidden', ...borderCss(inst) }}>
        <div className="pa-scroll-content" style={{ width: '100%', height: content.h }}>
          <Children list={inst.children} rc={rc} />
        </div>
        {empty && rc.mode === 'edit' ? (
          <div className="pa-empty-hint">
            <Icon name="Form" size={20} />
            <span>{t('catalog.emptyForm')}</span>
          </div>
        ) : null}
      </div>
    );
  },

  card: (inst, rc) => (
    <div className="pa-box" style={{ background: cssColor(g(inst, 'Fill'), 'transparent'), overflow: 'visible', ...borderCss(inst) }}>
      <Children list={inst.children} rc={rc} />
    </div>
  ),

  label: (inst, rc) => textControl(inst, rc, 'classic'),
  modernText: (inst, rc) => textControl(inst, rc, 'modern'),

  classicButton: (inst, rc) => {
    const dm = displayMode(g(inst, 'DisplayMode'));
    const disabled = dm === 'disabled';
    const fam = fontFamily(g(inst, 'Font'), CLASSIC_FONT);
    const pad = padding(inst);
    const st = {
      background: cssColor(g(inst, disabled ? 'DisabledFill' : 'Fill'), '#3860b2'),
      color: cssColor(g(inst, disabled ? 'DisabledColor' : 'Color'), '#fff'),
      borderRadius: radius(inst),
      fontFamily: fam,
      fontSize: fontPx(g(inst, 'Size'), 'classic', 15),
      fontWeight: fontWeight(g(inst, 'FontWeight'), 600),
      fontStyle: bool(g(inst, 'Italic')) ? 'italic' : undefined,
      textDecoration: textDecoration(inst),
      justifyContent: justifyFromAlign(g(inst, 'Align'), 'center'),
      alignItems: verticalAlign(g(inst, 'VerticalAlign'), 'center'),
      textAlign: textAlign(g(inst, 'Align'), 'center'),
      padding: `${pad.top}px ${pad.right}px ${pad.bottom}px ${pad.left}px`,
      '--hover-bg': cssColor(g(inst, 'HoverFill'), undefined),
      '--hover-fg': cssColor(g(inst, 'HoverColor'), undefined),
      '--pressed-bg': cssColor(g(inst, 'PressedFill'), undefined),
      ...borderCss(inst, 'rgba(0,18,107,1)'),
    };
    return (
      <button type="button" className={`pa-el pa-classic-btn pa-clickable${disabled ? ' is-disabled' : ''}`} style={st} tabIndex={rc.interactive ? 0 : -1} disabled={disabled && rc.interactive} onClick={(e) => run(rc, inst, 'OnSelect', e)}>
        <span className="pa-ellipsis-2">{gt(inst, 'Text')}</span>
      </button>
    );
  },

  modernButton: (inst, rc) => {
    const dm = displayMode(g(inst, 'DisplayMode'));
    const disabled = dm === 'disabled';
    let appearance = enumKey(g(inst, 'Appearance'), 'primary');
    const layout = enumKey(g(inst, 'Layout'), 'iconbefore');
    const iconName = gt(inst, 'Icon');
    const pal = paletteFrom(g(inst, 'BasePaletteColor'));
    const fontColor = cssColor(g(inst, 'FontColor'), null);
    const fill = cssColor(g(inst, 'Fill'), null);
    const size = fontPx(g(inst, 'Size'), 'modern', 14) || 14;
    const pad = padding(inst);
    const fw = fontWeight(g(inst, 'FontWeight'), 600);
    let st = {
      borderRadius: radius(inst),
      fontFamily: fontFamily(g(inst, 'Font'), MODERN_FONT),
      fontSize: size,
      fontWeight: fw,
      justifyContent: justifyFromAlign(g(inst, 'Align'), 'center'),
      padding: `${pad.top}px ${pad.right}px ${pad.bottom}px ${pad.left}px`,
      '--pal': pal.base,
      '--pal-hover': pal.hover,
      '--pal-pressed': pal.pressed,
    };
    const iconOnly = layout === 'icononly' || layout === 'iconOnly';
    const showText = !iconOnly;
    const showIcon = !!iconName && layout !== 'textonly';
    if (appearance === 'primary') st = { ...st, background: fill || 'var(--pal)', color: fontColor || '#fff', border: '1px solid transparent' };
    else if (appearance === 'secondary') st = { ...st, background: fill || '#fff', color: fontColor || '#242424', border: '1px solid #d1d1d1' };
    else if (appearance === 'outline') st = { ...st, background: fill || 'transparent', color: fontColor || '#242424', border: '1px solid #d1d1d1' };
    else st = { ...st, background: fill || 'transparent', color: fontColor || '#242424', border: '1px solid transparent' };
    const bc = cssColor(g(inst, 'BorderColor'), null);
    const bt = num(g(inst, 'BorderThickness'), 0);
    if (bc && inst.isExplicit('BorderColor') && bt > 0) st.border = `${bt}px solid ${bc}`;
    const iconSize = Math.max(14, Math.min(size + 6, 28));
    return (
      <button
        type="button"
        className={`pa-el pa-modern-btn appearance-${appearance}${disabled ? ' is-disabled' : ''} pa-clickable`}
        style={st}
        tabIndex={rc.interactive ? 0 : -1}
        disabled={disabled && rc.interactive}
        onClick={(e) => run(rc, inst, 'OnSelect', e)}
      >
        {showIcon && layout !== 'iconafter' ? <Icon name={iconName} size={iconSize} strokeWidth={enumKey(g(inst, 'IconStyle')) === 'filled' ? 2.2 : 1.6} /> : null}
        {showText ? <span className="pa-ellipsis">{gt(inst, 'Text')}</span> : null}
        {showIcon && layout === 'iconafter' ? <Icon name={iconName} size={iconSize} /> : null}
      </button>
    );
  },

  modernTextInput: (inst, rc) => textInput(inst, rc, 'modern'),
  classicTextInput: (inst, rc) => textInput(inst, rc, 'classic'),

  modernCombobox: (inst, rc) => <ComboBox inst={inst} rc={rc} />,
  modernDropdown: (inst, rc) => <DropDown inst={inst} rc={rc} family="modern" />,
  classicDropdown: (inst, rc) => <DropDown inst={inst} rc={rc} family="classic" />,
  listBox: (inst, rc) => <ListBox inst={inst} rc={rc} />,

  modernCheckbox: (inst, rc) => checkbox(inst, rc, 'modern'),
  classicCheckbox: (inst, rc) => checkbox(inst, rc, 'classic'),
  modernToggle: (inst, rc) => toggle(inst, rc, 'modern'),
  classicToggle: (inst, rc) => toggle(inst, rc, 'classic'),

  radio: (inst, rc) => {
    const items = itemsOf(inst);
    const sel = inst.get('Selected');
    const horizontal = enumKey(g(inst, 'Layout')) === 'horizontal';
    const color = cssColor(g(inst, 'Color') ?? g(inst, 'FontColor'), '#242424');
    return (
      <div className="pa-radio" style={{ flexDirection: horizontal ? 'row' : 'column', color, fontSize: fontPx(g(inst, 'Size'), inst.def.family, inst.def.family === 'classic' ? 13 : 14) }}>
        {items.map((it, i) => (
          <label key={i} className="pa-radio-item">
            <input
              className="pa-el"
              type="radio"
              name={inst.key}
              checked={sel === it || (sel && displayText(sel, inst) === displayText(it, inst))}
              readOnly={!rc.interactive}
              tabIndex={rc.interactive ? 0 : -1}
              onChange={() => rc.interactive && rc.setSelection(inst, [it], 'OnChange')}
            />
            <span>{displayText(it, inst)}</span>
          </label>
        ))}
      </div>
    );
  },

  slider: (inst, rc) => {
    const min = num(g(inst, 'Min'), 0);
    const max = num(g(inst, 'Max'), 100);
    const v = num(inst.get('Value'), 0);
    return (
      <div className="pa-slider">
        <input
          className="pa-el"
          type="range"
          min={min}
          max={max}
          value={v}
          tabIndex={rc.interactive ? 0 : -1}
          style={{ accentColor: cssColor(g(inst, 'ValueFill'), '#3860b2') }}
          onChange={(e) => rc.interactive && rc.setState(inst, { value: Number(e.target.value) }, 'OnChange')}
        />
        <span className="pa-slider-val">{v}</span>
      </div>
    );
  },

  rating: (inst, rc) => {
    const max = Math.max(1, Math.min(20, num(g(inst, 'Max'), 5)));
    const v = num(inst.get('Value'), 0);
    const color = cssColor(g(inst, 'RatingFill'), '#3860b2');
    return (
      <div className="pa-rating" style={{ color }}>
        {Array.from({ length: max }, (_, i) => (
          <button key={i} type="button" className="pa-el pa-star" tabIndex={-1} onClick={() => rc.interactive && rc.setState(inst, { value: i + 1 }, 'OnChange')}>
            <Icon name={i < v ? 'StarFilled' : 'Star'} size={Math.min(inst.layout.h - 4, 28)} />
          </button>
        ))}
      </div>
    );
  },

  datePicker: (inst, rc, { t }) => {
    const d = inst.get('SelectedDate');
    const val = d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
    const iso = val ? `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(2, '0')}-${String(val.getDate()).padStart(2, '0')}` : '';
    const classic = inst.def.family === 'classic';
    return (
      <div className={`pa-input-wrap ${classic ? 'classic' : 'appearance-outline'}`} style={{ borderRadius: radius(inst), ...(classic ? borderCss(inst, '#6580bb') : {}) }}>
        {rc.interactive ? (
          <input
            className="pa-el pa-input"
            type="date"
            value={iso}
            onChange={(e) => {
              const [y, m, dd] = e.target.value.split('-').map(Number);
              rc.setState(inst, { date: e.target.value ? new Date(y, m - 1, dd) : null }, 'OnChange');
            }}
          />
        ) : (
          <span className="pa-input-text">{val ? val.toLocaleDateString(rc.locale) : <span className="pa-placeholder">{gt(inst, 'Placeholder') || t('catalog.selectDate')}</span>}</span>
        )}
        <Icon name="Calendar" size={16} className="pa-input-icon" />
      </div>
    );
  },

  tabList: (inst, rc) => {
    const items = itemsOf(inst);
    const sel = inst.get('Selected');
    return (
      <div className="pa-tablist">
        {items.map((it, i) => {
          const active = sel === it || (sel && displayText(sel, inst) === displayText(it, inst));
          return (
            <button key={i} type="button" className={`pa-el pa-tab${active ? ' is-active' : ''}`} tabIndex={-1} onClick={() => rc.interactive && rc.setSelection(inst, [it], 'OnChange')}>
              {displayText(it, inst)}
            </button>
          );
        })}
      </div>
    );
  },

  progress: (inst) => {
    const max = num(g(inst, 'Max'), 100) || 100;
    const v = Math.max(0, Math.min(1, num(g(inst, 'Value'), 0) / max));
    return (
      <div className="pa-progress">
        <div className="pa-progress-bar" style={{ width: `${v * 100}%`, background: cssColor(g(inst, 'BarColor'), '#0f6cbd') }} />
      </div>
    );
  },

  spinner: (inst) => {
    const s = Math.min(inst.layout.w, inst.layout.h) * 0.6;
    return (
      <div className="pa-spinner-wrap">
        <span className="pa-spinner" style={{ width: s, height: s, borderTopColor: cssColor(g(inst, 'SpinnerColor'), '#0f6cbd') }} />
        {gt(inst, 'Label') ? <span>{gt(inst, 'Label')}</span> : null}
      </div>
    );
  },

  avatar: (inst, rc) => {
    const name = gt(inst, 'Name') || rc.userName;
    const img = imageUrl(g(inst, 'Image'));
    const s = Math.min(inst.layout.w, inst.layout.h);
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const bg = AVATAR_COLORS[h % AVATAR_COLORS.length];
    return (
      <div className="pa-avatar pa-clickable" style={{ width: s, height: s, background: img ? `center/cover url("${img}")` : bg, fontSize: s * 0.4 }} onClick={(e) => run(rc, inst, 'OnSelect', e)} title={name}>
        {img ? null : initials(name)}
      </div>
    );
  },

  badge: (inst) => (
    <div className="pa-badge" style={{ background: cssColor(g(inst, 'Fill'), '#0f6cbd'), color: cssColor(g(inst, 'FontColor'), '#fff') }}>
      {gt(inst, 'Content')}
    </div>
  ),

  link: (inst, rc) => (
    <a
      className="pa-el pa-link"
      href={gt(inst, 'Url') || undefined}
      target="_blank"
      rel="noreferrer"
      tabIndex={-1}
      style={{ fontSize: fontPx(g(inst, 'Size'), 'modern', 14) }}
      onClick={(e) => {
        if (!rc.interactive) e.preventDefault();
        else run(rc, inst, 'OnSelect', e);
      }}
    >
      {gt(inst, 'Text')}
    </a>
  ),

  infoButton: (inst) => (
    <div className="pa-info-btn" title={gt(inst, 'Content')}>
      <Icon name="Info" size={Math.min(inst.layout.h - 8, 20)} />
    </div>
  ),

  html: (inst, rc, { t }) => {
    const html = gt(inst, 'HtmlText');
    const pad = padding(inst);
    const fam = fontFamily(g(inst, 'Font'), CLASSIC_FONT);
    const size = fontPx(g(inst, 'Size'), 'classic', 13);
    const color = cssColor(g(inst, 'Color'), '#323130');
    const doc = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:${pad.top}px ${pad.right}px ${pad.bottom}px ${pad.left}px;font-family:${fam.replace(/"/g, "'")};font-size:${size}px;color:${color};word-wrap:break-word;}img{max-width:100%;}</style></head><body>${html}</body></html>`;
    return (
      <div className="pa-box" style={{ background: cssColor(g(inst, 'Fill'), 'transparent'), ...borderCss(inst) }}>
        <iframe className="pa-el pa-html" title={inst.name} sandbox="" srcDoc={doc} tabIndex={-1} />
        {!html && rc.mode === 'edit' ? <div className="pa-empty-hint small">{t('catalog.emptyHtml')}</div> : null}
      </div>
    );
  },

  image: (inst, rc) => {
    const url = imageUrl(g(inst, 'Image'));
    const pos = enumKey(g(inst, 'ImagePosition'), 'fit');
    const size = pos === 'fill' ? 'cover' : pos === 'stretch' ? '100% 100%' : pos === 'tile' ? 'auto' : pos === 'center' ? 'auto' : 'contain';
    const pad = padding(inst);
    return (
      <div
        className="pa-box pa-clickable"
        onClick={(e) => run(rc, inst, 'OnSelect', e)}
        style={{
          background: cssColor(g(inst, 'Fill'), 'transparent'),
          borderRadius: radius(inst),
          padding: `${pad.top}px ${pad.right}px ${pad.bottom}px ${pad.left}px`,
          opacity: 1 - num(g(inst, 'Transparency'), 0),
          ...borderCss(inst),
        }}
      >
        {url ? (
          <div className="pa-img" style={{ backgroundImage: `url("${url}")`, backgroundSize: size, backgroundRepeat: pos === 'tile' ? 'repeat' : 'no-repeat' }} />
        ) : (
          <div className="pa-img-placeholder">
            <Icon name="Image" size={Math.max(16, Math.min(40, inst.layout.h / 3))} />
          </div>
        )}
      </div>
    );
  },

  shape: (inst, rc) => {
    const circle = inst.def.shape === 'circle';
    const fill = cssColor(g(inst, 'Fill'), '#3860b2');
    return (
      <div
        className={`pa-box pa-shape${inst.formula('OnSelect') && inst.formula('OnSelect') !== '=' ? ' pa-clickable' : ''}`}
        style={{ background: fill, borderRadius: circle ? '50%' : radius(inst), ...borderCss(inst), '--hover-bg': cssColor(g(inst, 'HoverFill'), undefined) }}
        onClick={(e) => run(rc, inst, 'OnSelect', e)}
      />
    );
  },

  classicIcon: (inst, rc) => {
    const icon = g(inst, 'Icon');
    const name = icon instanceof FxEnum ? icon.name : text(icon);
    const color = cssColor(g(inst, 'Color'), '#3860b2');
    const pad = padding(inst);
    const s = Math.max(8, Math.min(inst.layout.w - pad.left - pad.right, inst.layout.h - pad.top - pad.bottom));
    return (
      <div
        className="pa-icon-box pa-clickable"
        style={{ color, background: cssColor(g(inst, 'Fill'), 'transparent'), transform: num(g(inst, 'Rotation')) ? `rotate(${num(g(inst, 'Rotation'))}deg)` : undefined, ...borderCss(inst) }}
        onClick={(e) => run(rc, inst, 'OnSelect', e)}
      >
        <Icon name={name} size={s} strokeWidth={1.8} />
      </div>
    );
  },

  modernIcon: (inst, rc) => {
    const name = gt(inst, 'Icon');
    const color = cssColor(g(inst, 'IconColor') ?? g(inst, 'Color'), '#424242');
    const s = Math.max(8, Math.min(inst.layout.w, inst.layout.h));
    const filled = enumKey(g(inst, 'IconStyle')) === 'filled';
    return (
      <div className="pa-icon-box pa-clickable" style={{ color, background: cssColor(g(inst, 'Fill'), 'transparent') }} onClick={(e) => run(rc, inst, 'OnSelect', e)}>
        <Icon name={name} size={s} strokeWidth={filled ? 2.2 : 1.6} />
      </div>
    );
  },

  timer: (inst, rc) => {
    const elapsed = num(inst.get('Value'), 0);
    const s = Math.floor(elapsed / 1000);
    const fmt = `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    return (
      <button type="button" className="pa-el pa-timer pa-clickable" tabIndex={-1} style={{ background: cssColor(g(inst, 'Fill'), '#3860b2'), color: cssColor(g(inst, 'Color'), '#fff'), fontSize: fontPx(g(inst, 'Size'), 'classic', 21) }} onClick={(e) => run(rc, inst, 'OnSelect', e)}>
        <Icon name="Timer" size={18} /> {fmt}
        {rc.timerRunning?.(inst) ? <span className="pa-timer-dot" /> : null}
      </button>
    );
  },

  dataTable: (inst, rc, { t }) => {
    const rows = itemsOf(inst).slice(0, 100);
    const colNodes = (inst.node.children || []).filter((c) => /column|field/i.test(c.head?.Control || ''));
    let cols = colNodes.map((c) => ({ name: c.name, field: String(c.properties?.FieldName || '').replace(/^="?|"$/g, ''), title: String(c.properties?.FieldDisplayName || c.properties?.HeaderText || c.name).replace(/^="?|"$/g, '') }));
    if (!cols.length && rows[0] && isRecord(rows[0])) cols = Object.keys(rows[0]).slice(0, 8).map((k) => ({ name: k, field: k, title: k }));
    const sel = inst.get('Selected');
    return (
      <div className="pa-box pa-datatable" style={borderCss(inst, '#d1d1d1')}>
        <table>
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.name}>{c.title}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={sel === r ? 'is-current' : ''} onClick={() => rc.interactive && rc.setState(inst, { selectedIndex: i }, 'OnSelect')}>
                {cols.map((c) => (
                  <td key={c.name}>{text(isRecord(r) ? r[c.field] ?? getAny(r, c.field) : r, rc.locale)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <div className="pa-empty-hint small">{t('catalog.noData')}</div> : null}
      </div>
    );
  },

  richText: (inst, rc) => {
    const html = gt(inst, 'HtmlText');
    return (
      <div className="pa-richtext">
        <div className="pa-richtext-toolbar">
          <b>B</b> <i>I</i> <u>U</u>
        </div>
        <div
          className="pa-el pa-richtext-body"
          contentEditable={rc.interactive}
          suppressContentEditableWarning
          dangerouslySetInnerHTML={{ __html: sanitize(html) }}
          onBlur={(e) => rc.interactive && rc.setState(inst, { text: e.currentTarget.innerHTML }, 'OnChange')}
        />
      </div>
    );
  },

  media: (inst) => (
    <div className="pa-placeholder-box">
      <Icon name="Media" size={24} />
      <span>{inst.node.head?.Control?.split('@')[0]}</span>
    </div>
  ),

  component: (inst, rc, { rich }) => {
    const root = inst.componentRoot;
    if (root) {
      const fill = cssColor(root.get('Fill'), 'transparent');
      return (
        <div className="pa-box" style={{ background: fill, overflow: 'hidden' }}>
          <Children list={root.children} rc={rc} />
        </div>
      );
    }
    if (rc.mode !== 'edit') return null;
    return (
      <div className="pa-placeholder-box component">
        <Icon name="Component" size={20} />
        <span>
          {inst.componentCycle
            ? rich('catalog.componentCycle', { name: inst.node.head?.ComponentName || '?', path: inst.componentCycle.join(' → ') }, { b: (c) => <b>{c}</b> })
            : rich('catalog.componentMissing', { name: inst.node.head?.ComponentName || '?' }, { b: (c) => <b>{c}</b> })}
        </span>
      </div>
    );
  },

  unknown: (inst, rc, { t }) => (
    <div className="pa-placeholder-box unknown">
      <Icon name="QuestionMark" size={18} />
      <span>{inst.node.head?.Control || t('catalog.untypedControl')}</span>
      {inst.children?.length ? <Children list={inst.children} rc={rc} /> : null}
    </div>
  ),
};

function getAny(rec, field) {
  const k = Object.keys(rec).find((x) => x.toLowerCase() === String(field).toLowerCase());
  return k ? rec[k] : null;
}

function sanitize(html) {
  return String(html || '')
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
}

function evalWithItem(inst, formula, it) {
  const { ast } = parseFormula(formula);
  if (!ast) return null;
  try {
    return evaluateSync(ast, {
      ...inst.ctx(),
      scopes: [...inst.scopes, { kind: 'item', implicit: true, alias: null, rec: it.record }],
      itemInfo: { gallery: inst, index: it.index, record: it.record },
    });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Textes
// ---------------------------------------------------------------------------

function textControl(inst, rc, family) {
  const modern = family === 'modern';
  const fam = fontFamily(g(inst, 'Font'), modern ? MODERN_FONT : CLASSIC_FONT);
  const weightProp = modern && inst.isExplicit('Weight') ? 'Weight' : 'FontWeight';
  const colorV = modern ? (inst.isExplicit('FontColor') || !inst.isExplicit('Color') ? g(inst, 'FontColor') : g(inst, 'Color')) : g(inst, 'Color');
  const pad = padding(inst);
  const wrap = bool(g(inst, 'Wrap'), true);
  const align = g(inst, 'Align');
  const st = {
    background: cssColor(g(inst, 'Fill'), 'transparent'),
    color: cssColor(colorV, modern ? '#242424' : '#323130'),
    fontFamily: fam,
    fontSize: fontPx(g(inst, 'Size'), family, modern ? 14 : 13),
    fontWeight: fontWeight(g(inst, weightProp), 400),
    fontStyle: bool(g(inst, 'Italic')) ? 'italic' : undefined,
    textDecoration: textDecoration(inst),
    textAlign: textAlign(align, 'left'),
    justifyContent: verticalAlign(g(inst, 'VerticalAlign'), modern ? 'flex-start' : 'center'),
    padding: `${pad.top}px ${pad.right}px ${pad.bottom}px ${pad.left}px`,
    borderRadius: radius(inst),
    lineHeight: modern ? 1.35 : num(g(inst, 'LineHeight'), 1.2) || 1.2,
    ...borderCss(inst),
  };
  const clickable = inst.formula('OnSelect') && inst.formula('OnSelect') !== '=';
  return (
    <div className={`pa-text${clickable ? ' pa-clickable' : ''}`} style={st} onClick={clickable ? (e) => run(rc, inst, 'OnSelect', e) : undefined}>
      <span className={wrap ? 'pa-text-wrap' : 'pa-text-nowrap'}>{gt(inst, 'Text')}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Saisies
// ---------------------------------------------------------------------------

function textInput(inst, rc, family) {
  const modern = family === 'modern';
  const value = gt(inst, modern ? 'Value' : 'Text');
  const dm = displayMode(g(inst, 'DisplayMode'));
  const appearance = modern ? enumKey(g(inst, 'Appearance'), 'outline') : 'classic';
  const typeKey = enumKey(g(inst, 'Type'));
  const mode = enumKey(g(inst, 'Mode'));
  const multiline = mode === 'multiline';
  const password = typeKey === 'password' || mode === 'password';
  const search = typeKey === 'search';
  const placeholder = gt(inst, modern ? 'Placeholder' : 'HintText');
  const pad = padding(inst);
  const fam = fontFamily(g(inst, 'Font'), modern ? MODERN_FONT : CLASSIC_FONT);
  const st = {
    borderRadius: radius(inst),
    background: cssColor(g(inst, 'Fill'), '#fff'),
    fontFamily: fam,
    fontSize: fontPx(g(inst, 'Size'), family, modern ? 14 : 13) || 14,
    color: cssColor(g(inst, modern ? 'FontColor' : 'Color'), '#242424'),
    fontWeight: fontWeight(g(inst, 'FontWeight'), 400),
    ...(modern ? {} : { padding: `0 ${pad.right}px 0 ${pad.left}px` }),
  };
  if (!modern) Object.assign(st, borderCss(inst, '#6580bb'));
  else {
    const bc = cssColor(g(inst, 'BorderColor'), null);
    if (bc && inst.isExplicit('BorderColor')) st['--border-c'] = bc;
  }
  const invalid = modern && /error/i.test(gt(inst, 'ValidationState'));
  const commonProps = {
    className: 'pa-el pa-input',
    value,
    placeholder,
    readOnly: !rc.interactive || dm !== 'edit',
    tabIndex: rc.interactive ? 0 : -1,
    onChange: (e) => rc.setState(inst, { text: e.target.value }, null),
    onBlur: () => rc.interactive && rc.fireChange(inst),
    onKeyDown: (e) => {
      if (e.key === 'Enter' && !multiline) rc.fireChange(inst);
    },
  };
  return (
    <div className={`pa-input-wrap appearance-${appearance}${dm === 'disabled' ? ' is-disabled' : ''}${invalid ? ' is-invalid' : ''}`} style={st}>
      {search ? <Icon name="Search" size={16} className="pa-input-icon left" /> : null}
      {multiline ? <textarea {...commonProps} /> : <input {...commonProps} type={password ? 'password' : 'text'} />}
    </div>
  );
}

function checkbox(inst, rc, family) {
  const modern = family === 'modern';
  const checked = !!inst.get(modern ? 'Checked' : 'Value');
  const label = gt(inst, modern ? 'Label' : 'Text');
  const color = cssColor(g(inst, modern ? 'FontColor' : 'Color'), '#242424');
  const size = fontPx(g(inst, 'Size'), family, modern ? 14 : 13);
  const mark = cssColor(g(inst, 'CheckmarkFill'), modern ? '#0f6cbd' : '#3860b2');
  return (
    <label className="pa-check" style={{ color, fontSize: size }}>
      <span className={`pa-check-box${checked ? ' is-checked' : ''}`} style={{ '--mark': mark }}>
        {checked ? <Icon name="Check" size={12} strokeWidth={2.4} /> : null}
      </span>
      <input
        className="pa-el sr-only"
        type="checkbox"
        checked={checked}
        tabIndex={rc.interactive ? 0 : -1}
        onChange={(e) => rc.interactive && rc.setState(inst, { checked: e.target.checked }, e.target.checked ? 'OnCheck' : 'OnUncheck', ['OnChange', 'OnSelect'])}
      />
      <span className="pa-ellipsis">{label}</span>
    </label>
  );
}

function toggle(inst, rc, family) {
  const modern = family === 'modern';
  const checked = !!inst.get(modern ? 'Checked' : 'Value');
  const label = modern ? gt(inst, 'Label') : bool(g(inst, 'ShowLabel'), true) ? gt(inst, checked ? 'TrueText' : 'FalseText') : '';
  const on = modern ? '#0f6cbd' : cssColor(g(inst, 'TrueFill'), '#3860b2');
  const off = modern ? '#fff' : cssColor(g(inst, 'FalseFill'), '#808285');
  const dm = displayMode(g(inst, 'DisplayMode'));
  return (
    <label className={`pa-toggle${dm === 'disabled' ? ' is-disabled' : ''}`} style={{ fontSize: fontPx(g(inst, 'Size'), family, 14), color: cssColor(g(inst, 'FontColor') ?? g(inst, 'Color'), '#242424') }}>
      <input
        className="pa-el sr-only"
        type="checkbox"
        checked={checked}
        tabIndex={rc.interactive ? 0 : -1}
        onChange={(e) => rc.interactive && dm === 'edit' && rc.setState(inst, { checked: e.target.checked }, e.target.checked ? 'OnCheck' : 'OnUncheck', ['OnChange', 'OnSelect'])}
      />
      <span className={`pa-toggle-track${checked ? ' is-on' : ''}${modern ? ' modern' : ''}`} style={{ '--on': on, '--off': off }}>
        <span className="pa-toggle-knob" />
      </span>
      {label ? <span className="pa-ellipsis">{label}</span> : null}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Listes
// ---------------------------------------------------------------------------

function DropDown({ inst, rc, family }) {
  const items = itemsOf(inst);
  const sel = inst.get('Selected');
  const modern = family === 'modern';
  const shown = sel ? displayText(sel, inst) : '';
  const pad = padding(inst);
  const st = {
    borderRadius: radius(inst),
    background: cssColor(g(inst, 'Fill'), '#fff'),
    fontSize: fontPx(g(inst, 'Size'), family, modern ? 14 : 13) || 14,
    fontFamily: fontFamily(g(inst, 'Font'), modern ? MODERN_FONT : CLASSIC_FONT),
    color: cssColor(g(inst, modern ? 'FontColor' : 'Color'), '#242424'),
    ...(modern ? {} : { ...borderCss(inst, '#6580bb'), paddingLeft: pad.left || 10 }),
  };
  const idx = sel ? items.findIndex((x) => x === sel || displayText(x, inst) === shown) : -1;
  return (
    <div className={`pa-input-wrap pa-dropdown ${modern ? 'appearance-outline' : 'classic'}`} style={st}>
      {rc.interactive ? (
        <select
          className="pa-el pa-select"
          value={idx}
          onChange={(e) => {
            const i = Number(e.target.value);
            rc.setSelection(inst, i >= 0 ? [items[i]] : [], 'OnChange');
          }}
        >
          {modern || bool(g(inst, 'AllowEmptySelection')) || idx < 0 ? <option value={-1}>{gt(inst, 'Placeholder') || ''}</option> : null}
          {items.map((it, i) => (
            <option key={i} value={i}>
              {displayText(it, inst)}
            </option>
          ))}
        </select>
      ) : (
        <span className="pa-input-text">{shown || <span className="pa-placeholder">{gt(inst, 'Placeholder')}</span>}</span>
      )}
      <span className="pa-chevron" style={modern ? undefined : { background: cssColor(g(inst, 'ChevronBackground'), '#3860b2'), color: cssColor(g(inst, 'ChevronFill'), '#fff') }}>
        <Icon name="ChevronDown" size={14} strokeWidth={modern ? 1.6 : 2.2} />
      </span>
    </div>
  );
}

function ComboBox({ inst, rc }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);
  const items = itemsOf(inst);
  const selected = inst.get('SelectedItems') || [];
  const multi = bool(g(inst, 'SelectMultiple'), inst.def.id === 'ClassicComboBox');
  const placeholder = gt(inst, 'InputTextPlaceholder');
  const classic = inst.def.family === 'classic';
  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  const isSel = (it) => selected.some((s) => s === it || displayText(s, inst) === displayText(it, inst));
  const toggleItem = (it) => {
    let next;
    if (multi) next = isSel(it) ? selected.filter((s) => !(s === it || displayText(s, inst) === displayText(it, inst))) : [...selected, it];
    else next = [it];
    rc.setSelection(inst, next, 'OnChange');
    if (!multi) setOpen(false);
  };
  const filtered = q ? items.filter((it) => displayText(it, inst).toLowerCase().includes(q.toLowerCase())) : items;
  const st = {
    borderRadius: radius(inst),
    background: cssColor(g(inst, 'Fill'), '#fff'),
    fontSize: fontPx(g(inst, 'Size'), 'modern', 14) || 14,
    color: cssColor(g(inst, 'FontColor'), '#242424'),
    ...(classic ? borderCss(inst, '#6580bb') : {}),
  };
  const invalid = /error/i.test(gt(inst, 'ValidationState'));
  return (
    <div ref={ref} className={`pa-input-wrap pa-combobox ${classic ? 'classic' : 'appearance-outline'}${invalid ? ' is-invalid' : ''}`} style={st} onClick={() => rc.interactive && setOpen(true)}>
      <div className="pa-combo-values">
        {selected.length ? (
          multi ? (
            selected.map((s, i) => (
              <span key={i} className="pa-chip">
                {displayText(s, inst)}
                {rc.interactive ? (
                  <button
                    type="button"
                    className="pa-el pa-chip-x"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleItem(s);
                    }}
                  >
                    ×
                  </button>
                ) : null}
              </span>
            ))
          ) : (
            <span className="pa-input-text">{displayText(selected[0], inst)}</span>
          )
        ) : (
          <span className="pa-placeholder">{placeholder}</span>
        )}
      </div>
      <span className="pa-chevron">
        <Icon name="ChevronDown" size={14} />
      </span>
      {open ? (
        <div className="pa-popup" onClick={(e) => e.stopPropagation()}>
          <input className="pa-popup-search" autoFocus placeholder={placeholder || t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="pa-popup-list">
            {filtered.slice(0, 300).map((it, i) => (
              <button key={i} type="button" className={`pa-popup-item${isSel(it) ? ' is-selected' : ''}`} onClick={() => toggleItem(it)}>
                {multi ? <span className={`pa-check-box sm${isSel(it) ? ' is-checked' : ''}`}>{isSel(it) ? <Icon name="Check" size={10} strokeWidth={2.4} /> : null}</span> : null}
                <span>{displayText(it, inst)}</span>
              </button>
            ))}
            {!filtered.length ? <div className="pa-popup-empty">{t('catalog.noItems')}</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ListBox({ inst, rc }) {
  const items = itemsOf(inst);
  const selected = inst.get('SelectedItems') || [];
  const multi = bool(g(inst, 'SelectMultiple'), true);
  const isSel = (it) => selected.some((s) => s === it || displayText(s, inst) === displayText(it, inst));
  return (
    <div className="pa-listbox" style={borderCss(inst, '#6580bb')}>
      {items.map((it, i) => (
        <button
          key={i}
          type="button"
          className={`pa-el pa-listbox-item${isSel(it) ? ' is-selected' : ''}`}
          tabIndex={-1}
          onClick={() => {
            if (!rc.interactive) return;
            const next = multi ? (isSel(it) ? selected.filter((s) => s !== it) : [...selected, it]) : [it];
            rc.setSelection(inst, next, 'OnChange');
          }}
        >
          {displayText(it, inst)}
        </button>
      ))}
    </div>
  );
}

export { fxToText };
