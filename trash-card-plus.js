/*!
 * Abfall-Karte (Trash Card Plus) für Home Assistant
 * https://github.com/Kohle93/Trash-Card-Plus
 *
 * Basiert auf "TrashCard" von Florian Triebel (idaho)
 * https://github.com/idaho/hassio-trash-card – Apache License 2.0
 * Kalender-Logik übernommen, Darstellung und Editor neu geschrieben.
 */

const CARD_VERSION = '1.0.0';
const CARD_TYPE = 'trash-card-plus';
const EDITOR_TYPE = 'trash-card-plus-editor';

/* ------------------------------------------------------------------ */
/*  Farben                                                            */
/* ------------------------------------------------------------------ */

// Standardwerte der HA-Farbpalette (für Kontrastberechnung & Fallback)
const HA_COLORS = {
  red: [244, 67, 54], pink: [233, 30, 99], purple: [146, 107, 199], 'deep-purple': [110, 65, 171],
  indigo: [63, 81, 181], blue: [33, 150, 243], 'light-blue': [3, 169, 244], cyan: [0, 188, 212],
  teal: [0, 150, 136], green: [76, 175, 80], 'light-green': [139, 195, 74], lime: [205, 220, 57],
  yellow: [255, 235, 59], amber: [255, 193, 7], orange: [255, 152, 0], 'deep-orange': [255, 111, 34],
  brown: [121, 85, 72], 'light-grey': [189, 189, 189], grey: [158, 158, 158], 'dark-grey': [96, 96, 96],
  'blue-grey': [96, 125, 139], black: [0, 0, 0], white: [255, 255, 255],
};

const THEME_BG = 'var(--ha-card-background, var(--card-background-color, #fff))';

const parseHex = (hex) => {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}/i.test(h)) return null;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};

// Liefert { css, rgb } für Farbwerte aus dem Farbpicker ([r,g,b]), Hex-Codes,
// HA-Farbnamen ("red", "deep-purple", "primary") oder beliebigen CSS-Farben.
const colorInfo = (value) => {
  if (Array.isArray(value) && value.length >= 3) {
    const rgb = value.slice(0, 3).map((v) => Number(v) || 0);
    return { css: `rgb(${rgb.join(',')})`, rgb };
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const v = value.trim();
  if (v.startsWith('#')) {
    const rgb = parseHex(v);
    return rgb ? { css: `rgb(${rgb.join(',')})`, rgb } : { css: v, rgb: null };
  }
  if (v === 'primary' || v === 'accent') return { css: `var(--${v}-color)`, rgb: null };
  if (v === 'disabled') return { css: 'var(--disabled-text-color, #9e9e9e)', rgb: [158, 158, 158] };
  if (HA_COLORS[v]) return { css: `rgb(var(--rgb-${v}, ${HA_COLORS[v].join(',')}))`, rgb: HA_COLORS[v] };
  const m = v.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  if (m) return { css: v, rgb: [Number(m[1]), Number(m[2]), Number(m[3])] };
  return { css: v, rgb: null };
};

const withAlpha = (css, pct) => {
  const p = Math.max(0, Math.min(100, Number(pct)));
  if (p >= 100) return css;
  if (p <= 0) return 'transparent';
  return `color-mix(in srgb, ${css} ${p}%, transparent)`;
};

const luminance = ([r, g, b]) => {
  const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrastText = (rgb) => (rgb && luminance(rgb) > 0.45 ? '#1c1c1c' : '#ffffff');

/* ------------------------------------------------------------------ */
/*  Texte der Karte                                                   */
/* ------------------------------------------------------------------ */

const CARD_STRINGS = {
  de: {
    days: 'Tage', day: 'Tag', until: 'bis', empty: 'Keine Abholung in den nächsten {n} Tagen',
    demo: 'Vorschau mit Beispielterminen', no_calendar: 'Bitte im Editor einen Kalender auswählen.',
    not_found: 'Kalender nicht gefunden', ongoing: 'läuft',
  },
  en: {
    days: 'days', day: 'day', until: 'until', empty: 'No collection in the next {n} days',
    demo: 'Preview with sample dates', no_calendar: 'Please select a calendar in the editor.',
    not_found: 'Calendar not found', ongoing: 'ongoing',
  },
};
const langOf = (hass) => (hass?.locale?.language || hass?.language || 'de');
const cardStr = (hass, key) => {
  const l = langOf(hass).split('-')[0];
  return (CARD_STRINGS[l] || CARD_STRINGS.en)[key] ?? CARD_STRINGS.en[key];
};

/* ------------------------------------------------------------------ */
/*  Standard-Abfallarten                                              */
/* ------------------------------------------------------------------ */

const defaultItems = (lang = 'de') => {
  const de = !lang || lang.startsWith('de');
  return [
    { label: de ? 'Restmüll' : 'Residual waste', pattern: de ? 'rest' : 'residual, waste', icon: 'mdi:trash-can', color: [117, 117, 117] },
    { label: de ? 'Biomüll' : 'Organic', pattern: de ? 'bio' : 'organic, bio', icon: 'mdi:leaf', color: [121, 85, 72] },
    { label: de ? 'Papier' : 'Paper', pattern: de ? 'papier' : 'paper', icon: 'mdi:newspaper-variant-outline', color: [33, 150, 243] },
    { label: de ? 'Gelber Sack' : 'Recycling', pattern: de ? 'gelb, wertstoff' : 'recycl, plastic', icon: 'mdi:recycle', color: [255, 193, 7] },
    { label: de ? 'Sonstiges' : 'Other', icon: 'mdi:dump-truck', color: [156, 39, 176], fallback: true },
  ];
};

/* ------------------------------------------------------------------ */
/*  Konfiguration                                                     */
/* ------------------------------------------------------------------ */

const DEFAULTS = {
  next_days: 14,
  refresh_rate: 60,
  drop_todayevents_from: '10:00:00',
  event_grouping: true,
  hide_when_empty: true,
  layout: 'tiles',
  orientation: 'horizontal',
  columns: 2,
  alignment: 'left',
  show_label: true,
  container: 'none',
  container_bg_mode: 'theme',
  container_bg_opacity: 100,
  date_format: 'smart',
  relative_words: 'today_tomorrow',
  countdown: 'badge',
  show_time: true,
  df_weekday: 'short',
  df_day: '2-digit',
  df_month: '2-digit',
  df_year: 'none',
  // Design (Standard für alle Abfallarten, pro Abfallart überschreibbar)
  bg_mode: 'tinted',
  bg_opacity: 18,
  bg_gradient: false,
  blur: 0,
  icon_color_mode: 'auto',
  icon_bg_mode: 'accent',
  icon_bg_opacity: 20,
  icon_shape: 'circle',
  icon_size: 24,
  text_color_mode: 'auto',
  label_size: 15,
  date_size: 13,
  countdown_size: 12,
  border_mode: 'none',
  border_width: 1,
  radius: 14,
  shadow: 'theme',
  padding: 12,
  gap: 8,
  highlight: 'glow',
  highlight_days: 0,
  future_opacity: 100,
};

// Diese Schlüssel können pro Abfallart überschrieben werden
const ITEM_STYLE_KEYS = [
  'bg_mode', 'bg_color', 'bg_opacity', 'bg_gradient', 'icon_color_mode', 'icon_color',
  'icon_bg_mode', 'icon_bg_color', 'icon_bg_opacity', 'icon_shape', 'text_color_mode', 'text_color',
  'border_mode', 'border_color', 'border_width', 'shadow', 'highlight',
];

const LEGACY_TYPE_LABELS = { organic: 'Biomüll', paper: 'Papier', recycle: 'Gelber Sack', waste: 'Restmüll', others: 'Sonstiges' };

// Übernimmt Konfigurationen der Original-TrashCard, damit YAML weiterverwendet werden kann.
const migrateConfig = (config) => {
  const cfg = { ...config };
  if (!cfg.items && Array.isArray(cfg.pattern)) {
    cfg.items = cfg.pattern.map((p) => {
      const it = {
        label: p.label || LEGACY_TYPE_LABELS[p.type] || p.pattern || 'Termin',
        icon: p.icon,
        color: typeof p.color === 'string' && HA_COLORS[p.color] ? HA_COLORS[p.color] : p.color,
      };
      if (p.pattern) it.pattern = p.pattern;
      if (p.pattern_exact) it.pattern_exact = true;
      if (p.picture) it.picture = p.picture;
      if (p.type === 'others') it.fallback = true;
      return it;
    });
    delete cfg.pattern;
    if (cfg.items_per_row && !cfg.columns) cfg.columns = cfg.items_per_row;
    if (cfg.card_style === 'chip') cfg.layout = 'chips';
    else if (cfg.card_style === 'icon') cfg.layout = 'icons';
    else if (['vertical', 'horizontal', 'default'].includes(cfg.layout)) {
      cfg.orientation = cfg.layout === 'vertical' ? 'vertical' : 'horizontal';
      cfg.layout = 'tiles';
    }
    if (cfg.day_style === 'counter') cfg.date_format = 'countdown';
    if (cfg.day_style === 'weekday') cfg.date_format = 'weekday_long';
    if (cfg.day_style === 'default') cfg.date_format = 'weekday_long_date';
    if (cfg.color_mode === 'background') { cfg.bg_mode = 'accent'; cfg.bg_opacity = 100; }
    if (cfg.color_mode === 'icon') cfg.bg_mode = 'theme';
    if (cfg.with_label === false) cfg.show_label = false;
    if (cfg.alignment_style) cfg.alignment = cfg.alignment_style;
    if (cfg.hide_time_range) cfg.show_time = false;
    ['items_per_row', 'card_style', 'day_style', 'day_style_format', 'color_mode', 'with_label', 'alignment_style', 'hide_time_range', 'full_size', 'fill_container', 'debug'].forEach((k) => delete cfg[k]);
  }
  return cfg;
};

/* ------------------------------------------------------------------ */
/*  Datumslogik                                                       */
/* ------------------------------------------------------------------ */

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const daysBetween = (from, to) =>
  Math.round((Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) - Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) / 86400000);

const isAfterTime = (now, hhmmss) => {
  const [h = 0, m = 0, s = 0] = String(hhmmss || '00:00:00').split(':').map(Number);
  return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() >= h * 3600 + m * 60 + s;
};

const capitalize = (s) => (s ? s.charAt(0).toLocaleUpperCase() + s.slice(1) : s);

const DATE_PRESETS = {
  weekday_date: { weekday: 'short', day: '2-digit', month: '2-digit' },
  weekday_long_date: { weekday: 'long', day: 'numeric', month: 'long' },
  date_short: { day: '2-digit', month: '2-digit' },
  date_numeric: { day: '2-digit', month: '2-digit', year: 'numeric' },
  date_medium: { day: 'numeric', month: 'short' },
  date_long: { day: 'numeric', month: 'long', year: 'numeric' },
  weekday_long: { weekday: 'long' },
  weekday_short: { weekday: 'short' },
};
const DATE_FORMAT_KEYS = ['smart', 'weekday_date', 'weekday_long_date', 'date_short', 'date_numeric', 'date_medium', 'date_long', 'weekday_long', 'weekday_short', 'countdown', 'weekday_countdown', 'custom'];

const customDateOptions = (cfg) => {
  const o = {};
  if (cfg.df_weekday && cfg.df_weekday !== 'none') o.weekday = cfg.df_weekday;
  o.day = cfg.df_day || '2-digit';
  if (cfg.df_month && cfg.df_month !== 'none') o.month = cfg.df_month;
  if (cfg.df_year && cfg.df_year !== 'none') o.year = cfg.df_year;
  return o;
};

const fmtDate = (date, lang, opts) => {
  try { return new Intl.DateTimeFormat(lang, opts).format(date); } catch (e) { return date.toLocaleDateString(); }
};
const relWord = (days, lang) => {
  try { return capitalize(new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }).format(days, 'day')); } catch (e) { return `${days}`; }
};
const countdownLong = (days, lang) => relWord(Math.max(0, days), lang);
const countdownShort = (days, lang, hass) => {
  if (days <= 1) return relWord(Math.max(0, days), lang);
  return `${days} ${cardStr(hass, 'days')}`;
};

// Text der Datumszeile eines Termins
const dateText = (entry, cfg, hass) => {
  const lang = langOf(hass);
  const d = Math.max(0, entry.days);
  const fmt = cfg.date_format || DEFAULTS.date_format;
  let text;
  const rel = cfg.relative_words || DEFAULTS.relative_words;
  const useRel = fmt === 'smart' || (rel !== 'none' && !['countdown'].includes(fmt));
  if (useRel && (d <= 1 || (d === 2 && rel === 'all'))) {
    text = relWord(d, lang);
  } else if (fmt === 'smart') {
    text = d < 7 ? fmtDate(entry.start, lang, { weekday: 'long' }) : fmtDate(entry.start, lang, DATE_PRESETS.weekday_date);
  } else if (fmt === 'countdown') {
    text = countdownLong(d, lang);
  } else if (fmt === 'weekday_countdown') {
    const cdl = countdownLong(d, lang);
    text = `${fmtDate(entry.start, lang, { weekday: 'long' })} · ${cdl.charAt(0).toLocaleLowerCase()}${cdl.slice(1)}`;
  } else if (fmt === 'custom') {
    text = fmtDate(entry.start, lang, customDateOptions(cfg));
  } else {
    text = fmtDate(entry.start, lang, DATE_PRESETS[fmt] || DATE_PRESETS.weekday_date);
  }
  if (!entry.allDay && cfg.show_time !== false) {
    const t = { hour: '2-digit', minute: '2-digit' };
    text += ` · ${fmtDate(entry.start, lang, t)}–${fmtDate(entry.end, lang, t)}`;
  }
  return text;
};

/* ------------------------------------------------------------------ */
/*  Kalender-Ereignisse                                               */
/* ------------------------------------------------------------------ */

const parseDateOnly = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

const normaliseEvent = (raw) => {
  const allDay = Boolean(raw.start && 'date' in raw.start && raw.start.date);
  const start = allDay ? parseDateOnly(raw.start.date) : new Date(raw.start.dateTime);
  const end = raw.end ? (allDay ? parseDateOnly(raw.end.date) : new Date(raw.end.dateTime)) : addDays(start, 1);
  return {
    start, end, allDay,
    summary: raw.summary || '',
    location: raw.location || '',
    uid: raw.uid || '',
    recurrence_id: raw.recurrence_id || null,
    entity: raw.entity,
  };
};

const patternList = (item) => String(item.pattern || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const matchesItem = (item, summary) => {
  const pats = patternList(item);
  if (!pats.length) return false;
  const s = summary.toLowerCase().trim();
  return pats.some((p) => (item.pattern_exact ? s === p : s.includes(p)));
};

// Aus Rohdaten die anzuzeigenden Einträge berechnen
const computeEntries = (rawEvents, cfg, now = new Date()) => {
  const items = cfg.items || [];
  const today = startOfDay(now);
  const maxStart = addDays(today, (cfg.next_days ?? DEFAULTS.next_days) + 1);
  const dropAfter = isAfterTime(now, cfg.drop_todayevents_from ?? DEFAULTS.drop_todayevents_from);
  const location = (cfg.location || '').toLowerCase().trim();
  const fallbackIdx = items.findIndex((i) => i.fallback);

  const events = rawEvents.map(normaliseEvent)
    .filter((e) => !Number.isNaN(e.start.getTime()))
    .filter((e) => {
      if (location && !e.location.toLowerCase().includes(location)) return false;
      if (e.start >= maxStart) return false;
      if (cfg.only_all_day_events && !e.allDay) return false;
      if (e.allDay) {
        if (e.end <= now) return false;
        if (daysBetween(today, e.start) === 0 && dropAfter) return false;
        return true;
      }
      return e.end >= now;
    })
    .sort((a, b) => a.start - b.start);

  const entries = [];
  events.forEach((ev) => {
    let idxs = items.map((it, i) => (!it.fallback && matchesItem(it, ev.summary) ? i : -1)).filter((i) => i >= 0);
    if (!idxs.length) {
      if (cfg.filter_events || fallbackIdx < 0) return;
      idxs = [fallbackIdx];
    }
    idxs.forEach((i) => {
      const item = items[i];
      if (item.hidden) return;
      entries.push({ ...ev, itemIndex: i, item, days: daysBetween(today, ev.start) });
    });
  });

  let result = entries;
  if (cfg.event_grouping !== false) {
    const seen = new Set();
    result = entries.filter((e) => {
      const key = e.item.fallback ? `fb:${(e.recurrence_id || e.summary).toLowerCase()}` : `i:${e.itemIndex}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  if (cfg.max_items > 0) result = result.slice(0, cfg.max_items);
  return result;
};

const demoEntries = (cfg) => {
  const today = startOfDay(new Date());
  const offsets = [0, 1, 3, 6, 9, 13, 16, 20];
  return (cfg.items || []).filter((it) => !it.hidden).map((item, n) => {
    const start = addDays(today, offsets[n % offsets.length]);
    return {
      start, end: addDays(start, 1), allDay: true, summary: item.label, entity: null,
      itemIndex: cfg.items.indexOf(item), item, days: offsets[n % offsets.length],
    };
  }).slice(0, cfg.max_items > 0 ? cfg.max_items : undefined);
};

/* ------------------------------------------------------------------ */
/*  Stil-Berechnung                                                   */
/* ------------------------------------------------------------------ */

const pick = (item, cfg, key) => {
  const v = item?.[key];
  if (v !== undefined && v !== null && v !== '' && v !== 'inherit') {
    if (v === 'on') return true;
    if (v === 'off') return false;
    return v;
  }
  return cfg[key] ?? DEFAULTS[key];
};

const SHADOWS = {
  none: 'none',
  theme: 'var(--ha-card-box-shadow, none)',
  soft: '0 2px 8px rgba(0,0,0,.12)',
  strong: '0 6px 20px rgba(0,0,0,.28)',
};
const SHAPES = { circle: '50%', rounded: '30%', square: '6px', none: '0' };

const itemVars = (item, cfg) => {
  const s = {};
  ITEM_STYLE_KEYS.forEach((k) => { s[k] = pick(item, cfg, k); });
  const accent = colorInfo(item.color) || colorInfo('primary');
  const op = Number(s.bg_opacity);
  const vars = {};

  // Hintergrund
  let bg = 'transparent';
  let strongRgb = null; // rgb eines kräftigen Hintergrunds (für Kontrast)
  let strong = false;
  const bgInfo = s.bg_mode === 'custom' ? (colorInfo(s.bg_color) || colorInfo([255, 255, 255])) : accent;
  if (s.bg_mode === 'theme') {
    bg = withAlpha(THEME_BG, op);
  } else if (s.bg_mode === 'tinted') {
    const tint = s.bg_gradient
      ? `linear-gradient(135deg, ${withAlpha(accent.css, op)} 0%, ${withAlpha(accent.css, Math.round(op * 0.15))} 100%)`
      : `linear-gradient(${withAlpha(accent.css, op)}, ${withAlpha(accent.css, op)})`;
    bg = `${tint}, ${THEME_BG}`;
  } else if (s.bg_mode === 'accent' || s.bg_mode === 'custom') {
    bg = s.bg_gradient
      ? `linear-gradient(135deg, ${withAlpha(bgInfo.css, op)} 0%, ${withAlpha(`color-mix(in srgb, ${bgInfo.css} 62%, black)`, op)} 100%)`
      : withAlpha(bgInfo.css, op);
    strong = op >= 55;
    strongRgb = bgInfo.rgb;
  }
  vars['--tcp-bg'] = bg;

  // Text
  let text = 'var(--primary-text-color)';
  if (s.text_color_mode === 'custom' && colorInfo(s.text_color)) text = colorInfo(s.text_color).css;
  else if (s.text_color_mode === 'auto' && strong) text = strongRgb ? contrastText(strongRgb) : '#ffffff';
  vars['--tcp-text'] = text;
  vars['--tcp-text2'] = `color-mix(in srgb, ${text} 72%, transparent)`;

  // Icon-Hintergrund
  let iconBg = 'transparent';
  let iconBgStrongRgb = null;
  if (s.icon_bg_mode === 'accent' || s.icon_bg_mode === 'custom') {
    const ib = s.icon_bg_mode === 'custom' ? (colorInfo(s.icon_bg_color) || accent) : accent;
    iconBg = withAlpha(ib.css, s.icon_bg_opacity);
    if (Number(s.icon_bg_opacity) >= 55) iconBgStrongRgb = ib.rgb || [0, 0, 0];
  } else if (s.icon_bg_mode === 'theme') {
    iconBg = withAlpha(THEME_BG, s.icon_bg_opacity);
  }
  vars['--tcp-ibg'] = iconBg;
  vars['--tcp-ishape'] = SHAPES[s.icon_shape] || '50%';

  // Icon-Farbe
  let icon = accent.css;
  if (s.icon_color_mode === 'custom' && colorInfo(s.icon_color)) icon = colorInfo(s.icon_color).css;
  else if (s.icon_color_mode === 'text') icon = text;
  else if (s.icon_color_mode === 'auto') {
    if (iconBgStrongRgb) icon = contrastText(iconBgStrongRgb);
    else if (strong && s.bg_mode === 'accent') icon = text;
    else icon = accent.css;
  }
  vars['--tcp-icolor'] = icon;

  // Rahmen & Schatten
  const bw = Number(s.border_width) || 0;
  let border = 'none';
  if (s.border_mode === 'accent') border = `${bw}px solid ${accent.css}`;
  else if (s.border_mode === 'custom') border = `${bw}px solid ${(colorInfo(s.border_color) || accent).css}`;
  else if (s.border_mode === 'theme') border = `${bw}px solid var(--divider-color, rgba(127,127,127,.3))`;
  vars['--tcp-border'] = border;
  vars['--tcp-shadow'] = SHADOWS[s.shadow] || SHADOWS.theme;

  // Badge (Countdown)
  if (strong && (s.bg_mode === 'accent' || (s.bg_mode === 'custom' && bgInfo === accent))) {
    vars['--tcp-badge-bg'] = `color-mix(in srgb, ${text} 22%, transparent)`;
    vars['--tcp-badge-text'] = text;
  } else {
    vars['--tcp-badge-bg'] = accent.css;
    vars['--tcp-badge-text'] = accent.rgb ? contrastText(accent.rgb) : '#fff';
  }
  vars['--tcp-accent'] = accent.css;

  return { vars, highlight: s.highlight };
};

const styleString = (vars) => Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const pictureUrl = (url, hass) => {
  if (!url) return null;
  try { return hass?.hassUrl ? hass.hassUrl(url) : url; } catch (e) { return url; }
};

/* ------------------------------------------------------------------ */
/*  HTML eines Eintrags                                               */
/* ------------------------------------------------------------------ */

const renderEntry = (entry, cfg, hass, index = 0) => {
  const layout = cfg.layout || DEFAULTS.layout;
  const { item } = entry;
  const { vars, highlight } = itemVars(item, cfg);
  const d = Math.max(0, entry.days);
  const hlDays = Number(cfg.highlight_days ?? DEFAULTS.highlight_days);
  const isHl = d <= hlDays && highlight && highlight !== 'none';
  const futureOp = Number(cfg.future_opacity ?? DEFAULTS.future_opacity);
  if (!isHl && futureOp < 100 && d > hlDays) vars['--tcp-op'] = futureOp / 100;

  // Auffang-Einträge zeigen den Kalendertitel (z. B. „Sperrmüll“) statt „Sonstiges“
  const label = (cfg.use_summary || item.fallback) && entry.summary ? entry.summary : (item.label || entry.summary);
  const date = dateText(entry, cfg, hass);
  const cdMode = cfg.countdown || DEFAULTS.countdown;
  const lang = langOf(hass);
  let cd = '';
  if (cdMode === 'badge') cd = countdownShort(d, lang, hass);
  if (cdMode === 'line') cd = countdownLong(d, lang);
  if (cd && date.toLowerCase().startsWith(cd.toLowerCase())) cd = '';

  const pic = pictureUrl(item.picture, hass);
  const iconHtml = `<div class="icon">${pic ? `<img src="${esc(pic)}" alt="">` : `<ha-icon icon="${esc(item.icon || 'mdi:trash-can')}"></ha-icon>`}</div>`;
  const cls = ['item', `lay-${layout}`, isHl ? `hl-${highlight}` : ''];
  const showLabel = cfg.show_label !== false;
  const attrs = `class="${cls.join(' ')} ${layout === 'tiles' ? `o-${cfg.orientation || DEFAULTS.orientation}` : ''}" style="${esc(styleString(vars))}" data-idx="${index}" title="${esc(entry.summary)}"`;

  if (layout === 'chips') {
    return `<div ${attrs}>${iconHtml}<span class="txt">${showLabel ? `<b>${esc(label)}</b>` : ''}<span class="date">${esc(date)}</span></span>${cd ? `<span class="badge">${esc(cd)}</span>` : ''}</div>`;
  }
  if (layout === 'icons') {
    const badge = cdMode === 'none' ? date : countdownShort(d, lang, hass);
    return `<div ${attrs}>${iconHtml}${showLabel ? `<div class="label">${esc(label)}</div>` : ''}<span class="badge">${esc(badge)}</span></div>`;
  }
  if (layout === 'list') {
    return `<div ${attrs}>${iconHtml}<div class="info">${showLabel ? `<div class="label">${esc(label)}</div>` : ''}<div class="date">${esc(date)}${cdMode === 'line' && cd ? ` · ${esc(cd)}` : ''}</div></div>${cdMode === 'badge' && cd ? `<span class="badge">${esc(cd)}</span>` : ''}</div>`;
  }
  // Kacheln: Badge sitzt in der Datumszeile und bricht bei schmalen Kacheln um
  return `<div ${attrs}>${iconHtml}<div class="info">${showLabel ? `<div class="label">${esc(label)}</div>` : ''}<div class="meta"><span class="date">${esc(date)}</span>${cdMode === 'badge' && cd ? `<span class="badge">${esc(cd)}</span>` : ''}</div>${cdMode === 'line' && cd ? `<div class="date sub">${esc(cd)}</div>` : ''}</div></div>`;
};

const layoutVars = (cfg) => {
  const v = {
    '--tcp-isize': `${cfg.icon_size ?? (cfg.layout === 'icons' ? 40 : DEFAULTS.icon_size)}px`,
    '--tcp-lsize': `${cfg.label_size ?? DEFAULTS.label_size}px`,
    '--tcp-dsize': `${cfg.date_size ?? DEFAULTS.date_size}px`,
    '--tcp-cdsize': `${cfg.countdown_size ?? DEFAULTS.countdown_size}px`,
    '--tcp-radius': `${cfg.radius ?? DEFAULTS.radius}px`,
    '--tcp-pad': `${cfg.padding ?? DEFAULTS.padding}px`,
    '--tcp-gap': `${cfg.gap ?? DEFAULTS.gap}px`,
    ...(Number(cfg.blur) > 0 ? { '--tcp-bf': `blur(${cfg.blur}px)` } : {}),
    '--tcp-justify': { left: 'flex-start', center: 'center', right: 'flex-end', space: 'space-between' }[cfg.alignment || 'left'],
  };
  return v;
};

const CARD_CSS = `
  :host { display:block; }
  .wrap { box-sizing:border-box; }
  .wrap.boxed { padding: var(--tcp-pad); border-radius: var(--ha-card-border-radius, 12px); }
  ha-card.wrap.boxed { overflow:hidden; }
  .wrap.boxed.custom-bg { background: transparent !important; position: relative; isolation: isolate; }
  .wrap.boxed.custom-bg::before { content: ''; position: absolute; inset: 0; z-index: -1; border-radius: inherit;
    background: var(--tcp-cbg); backdrop-filter: var(--tcp-cbf, none); -webkit-backdrop-filter: var(--tcp-cbf, none); }
  .title { display:flex; align-items:center; gap:8px; font-size: calc(var(--tcp-lsize) + 2px); font-weight:600; margin:0 2px calc(var(--tcp-gap) + 4px); color: var(--primary-text-color); }
  .title ha-icon { --mdc-icon-size: 22px; color: var(--primary-color); }
  .items { display:grid; gap: var(--tcp-gap); }
  .items.lay-tiles, .items.lay-icons { grid-template-columns: repeat(var(--tcp-cols, 1), minmax(0, 1fr)); }
  .items.lay-icons.auto { grid-template-columns: repeat(auto-fit, minmax(max(64px, calc(var(--tcp-isize) * 2)), 1fr)); }
  .items.lay-list { grid-template-columns: 1fr; }
  .items.lay-chips { display:flex; flex-wrap:wrap; justify-content: var(--tcp-justify); }

  .item { position:relative; isolation:isolate; box-sizing:border-box; color: var(--tcp-text);
    border: var(--tcp-border); border-radius: var(--tcp-radius); box-shadow: var(--tcp-shadow);
    opacity: var(--tcp-op, 1); cursor:pointer; transition: transform .15s ease, box-shadow .25s ease; min-width:0; }
  /* Hintergrund + Glas-Effekt auf eigener Ebene, damit Unschärfe keine Kind-Elemente stört */
  .item::before { content:''; position:absolute; inset:0; z-index:-1; border-radius: inherit; background: var(--tcp-bg);
    backdrop-filter: var(--tcp-bf, none); -webkit-backdrop-filter: var(--tcp-bf, none); pointer-events:none; }
  .item:active { transform: scale(.98); }
  .icon { flex:0 0 auto; display:flex; align-items:center; justify-content:center;
    width: calc(var(--tcp-isize) * 1.7); height: calc(var(--tcp-isize) * 1.7);
    border-radius: var(--tcp-ishape); background: var(--tcp-ibg); color: var(--tcp-icolor); --mdc-icon-size: var(--tcp-isize); }
  .icon img { width: calc(var(--tcp-isize) * 1.25); height: calc(var(--tcp-isize) * 1.25); object-fit: contain; }
  .info { min-width:0; flex:1; display:flex; flex-direction:column; gap:2px; }
  .label { font-size: var(--tcp-lsize); font-weight:600; line-height:1.25; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .date { font-size: var(--tcp-dsize); color: var(--tcp-text2); line-height:1.3; }
  .badge { flex:0 0 auto; font-size: var(--tcp-cdsize); font-weight:600; padding:0.25em 0.75em; border-radius:999px;
    background: var(--tcp-badge-bg); color: var(--tcp-badge-text); white-space:nowrap; line-height:1.4; }

  .lay-tiles.item { display:flex; align-items:center; gap:12px; padding: var(--tcp-pad); }
  .lay-tiles.o-vertical { flex-direction:column; text-align:center; justify-content:center; gap:8px; }
  .lay-tiles.o-vertical .info { align-items:center; width:100%; }
  .lay-tiles.o-vertical .label { max-width:100%; }
  .meta { display:flex; flex-wrap:wrap; align-items:center; gap:4px 8px; }
  .lay-tiles.o-vertical .meta { justify-content:center; }
  .meta .badge { padding:0.17em 0.65em; }

  .lay-list.item { display:flex; align-items:center; gap:12px; padding: calc(var(--tcp-pad) * .7) var(--tcp-pad); }
  .lay-list .info { flex-direction:row; align-items:center; justify-content:space-between; gap:10px; }
  .lay-list .date { text-align:right; white-space:nowrap; }

  .lay-chips.item { display:inline-flex; align-items:center; gap:8px; padding:4px 10px 4px 4px; border-radius:999px; }
  .lay-chips .icon { width: calc(var(--tcp-isize) * 1.35); height: calc(var(--tcp-isize) * 1.35); --mdc-icon-size: calc(var(--tcp-isize) * .8); }
  .lay-chips .txt { display:flex; gap:6px; align-items:baseline; font-size: var(--tcp-dsize); white-space:nowrap; }
  .lay-chips .txt b { font-size: var(--tcp-dsize); }
  .lay-chips .badge { padding:0.17em 0.65em; }

  .lay-icons.item { display:flex; flex-direction:column; align-items:center; gap:6px; padding: var(--tcp-pad) 4px; text-align:center; }
  .lay-icons .label { font-size: var(--tcp-dsize); max-width:100%; }

  .hl-glow { box-shadow: 0 0 0 1.5px var(--tcp-accent), 0 0 16px 0 color-mix(in srgb, var(--tcp-accent) 55%, transparent) !important; }
  .hl-border { box-shadow: inset 0 0 0 2px var(--tcp-accent), var(--tcp-shadow) !important; }
  .hl-pulse { animation: tcp-pulse 2.2s ease-in-out infinite; }
  .hl-scale { transform: scale(1.03); z-index:1; box-shadow: 0 6px 18px color-mix(in srgb, var(--tcp-accent) 40%, transparent) !important; }
  .hl-scale:active { transform: scale(1); }
  @keyframes tcp-pulse {
    0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--tcp-accent) 60%, transparent), var(--tcp-shadow); }
    50% { box-shadow: 0 0 0 7px color-mix(in srgb, var(--tcp-accent) 0%, transparent), var(--tcp-shadow); }
  }
  @media (prefers-reduced-motion: reduce) { .hl-pulse { animation:none; box-shadow: 0 0 0 2px var(--tcp-accent); } }

  .note { font-size:11px; color: var(--secondary-text-color); text-align:center; margin-top:6px; opacity:.8; }
  .empty { padding: 14px; color: var(--secondary-text-color); text-align:center; font-size: var(--tcp-dsize); }
  .warn { padding: 12px 14px; border-radius: 12px; background: color-mix(in srgb, var(--warning-color, #ffa600) 15%, transparent); color: var(--primary-text-color); font-size: 14px; }
`;

/* ------------------------------------------------------------------ */
/*  Karte                                                             */
/* ------------------------------------------------------------------ */

class TrashCardPlus extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._raw = [];
    this._loaded = false;
    this._lastFetch = 0;
    this._fetchKey = '';
    this._fetchToken = 0;
    this._entries = [];
    this.shadowRoot.addEventListener('click', (ev) => this._onClick(ev));
  }

  static getConfigElement() { return document.createElement(EDITOR_TYPE); }

  static getStubConfig(hass) {
    const cal = Object.keys(hass?.states || {}).filter((e) => e.startsWith('calendar.'));
    const trash = cal.find((e) => /m(ü|ue)ll|abfall|trash|waste|garbage|abfuhr/i.test(e)) || cal[0];
    return {
      entities: trash ? [trash] : [],
      layout: 'tiles',
      columns: 2,
      items: defaultItems(langOf(hass)),
    };
  }

  setConfig(config) {
    if (!config) throw new Error('Ungültige Konfiguration');
    const cfg = migrateConfig(config);
    if (!Array.isArray(cfg.items)) cfg.items = defaultItems('de');
    if (cfg.entities && !Array.isArray(cfg.entities)) cfg.entities = [cfg.entities];
    if (cfg.entity && !cfg.entities) cfg.entities = [cfg.entity];
    this._config = cfg;
    const key = JSON.stringify([cfg.entities || [], cfg.next_days ?? DEFAULTS.next_days]);
    if (key !== this._fetchKey) {
      this._fetchKey = key;
      this._loaded = false;
      this._fetch();
    }
    this._update();
  }

  set hass(hass) {
    const first = !this._hass;
    const oldLang = this._hass ? langOf(this._hass) : null;
    this._hass = hass;
    if (first || !this._loaded && !this._fetching) this._fetch();
    else if (oldLang !== langOf(hass)) this._update();
  }

  get hass() { return this._hass; }

  set editMode(v) { this._editMode = v; this._update(); }
  get editMode() { return this._editMode; }
  set preview(v) { this._preview = v; this._update(); }
  get preview() { return this._preview; }

  connectedCallback() {
    this._timer = setInterval(() => this._tick(), 60 * 1000);
    if (this._config) this._update();
  }

  disconnectedCallback() { clearInterval(this._timer); }

  _tick() {
    if (!this._config) return;
    const refresh = Math.max(5, Number(this._config.refresh_rate ?? DEFAULTS.refresh_rate)) * 60000;
    if (Date.now() - this._lastFetch > refresh || this._fetchedDay !== dayKey(new Date())) this._fetch();
    else this._update();
  }

  async _fetch() {
    if (!this._hass || !this._config) return;
    const entities = (this._config.entities || []).filter(Boolean);
    if (!entities.length) { this._raw = []; this._loaded = true; this._update(); return; }
    const token = ++this._fetchToken;
    this._fetching = true;
    const start = startOfDay(new Date());
    const end = addDays(start, (this._config.next_days ?? DEFAULTS.next_days) + 2);
    const q = `start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;
    const results = await Promise.all(entities.map((ent) =>
      this._hass.callApi('GET', `calendars/${ent}?${q}`)
        .then((list) => (list || []).map((e) => ({ ...e, entity: ent })))
        .catch((err) => { console.warn(`[${CARD_TYPE}] ${ent}:`, err); return []; })));
    if (token !== this._fetchToken) return;
    this._fetching = false;
    this._raw = results.flat();
    this._loaded = true;
    this._lastFetch = Date.now();
    this._fetchedDay = dayKey(new Date());
    this._update();
  }

  _isEditing() {
    if (this._preview || this._editMode) return true;
    // Im Karten-Editor-Dialog (Vorschau)
    let el = this;
    for (let i = 0; i < 12 && el; i += 1) {
      el = el.parentNode || el.host;
      if (el && el.tagName && /^(HUI-CARD-PREVIEW|HUI-CARD-ELEMENT-EDITOR|HUI-DIALOG-EDIT-CARD)$/.test(el.tagName)) return true;
    }
    return false;
  }

  _setVisible(visible) {
    if (this._visible === visible) return;
    this._visible = visible;
    this.style.display = visible ? '' : 'none';
    this.toggleAttribute('hidden', !visible);
    this.dispatchEvent(new CustomEvent('card-visibility-changed', { detail: { value: visible }, bubbles: true, composed: true }));
  }

  _update() {
    if (!this._config) return;
    const cfg = this._config;
    const hass = this._hass;
    const editing = this._isEditing();
    const hasEntities = (cfg.entities || []).filter(Boolean).length > 0;
    let entries = this._loaded ? computeEntries(this._raw, cfg) : [];
    let demo = false;
    if (editing && (!hasEntities || (this._loaded && !entries.length))) { entries = demoEntries(cfg); demo = true; }
    this._entries = entries;

    let content = '';
    if (!hasEntities && !editing) {
      content = `<div class="warn">${esc(cardStr(hass, 'no_calendar'))}</div>`;
    } else if (!entries.length) {
      if (!this._loaded) { this.shadowRoot.innerHTML = `<style>${CARD_CSS}</style>`; return; }
      if (cfg.hide_when_empty !== false && !editing) { this._setVisible(false); this.shadowRoot.innerHTML = ''; return; }
      content = `<div class="empty">${esc(cfg.empty_text || cardStr(hass, 'empty').replace('{n}', cfg.next_days ?? DEFAULTS.next_days))}</div>`;
    } else {
      const layout = cfg.layout || DEFAULTS.layout;
      let cols = Number(cfg.columns ?? DEFAULTS.columns);
      if (layout === 'icons') cols = cfg.columns ? Math.min(cols, entries.length) : 0;
      if (layout === 'tiles') cols = Math.max(1, Math.min(cols, entries.length || 1));
      content = `<div class="items lay-${layout}${cols ? '' : ' auto'}" style="--tcp-cols:${cols}">${entries.map((e, i) => renderEntry(e, cfg, hass, i)).join('')}</div>`;
      if (demo) content += `<div class="note">${esc(cardStr(hass, 'demo'))}</div>`;
    }
    this._setVisible(true);

    const boxed = (cfg.container || DEFAULTS.container) === 'card';
    const lv = layoutVars(cfg);
    let wrapClass = 'wrap';
    if (boxed) {
      wrapClass += ' boxed';
      const mode = cfg.container_bg_mode || DEFAULTS.container_bg_mode;
      const op = cfg.container_bg_opacity ?? DEFAULTS.container_bg_opacity;
      if (mode !== 'theme' || op < 100 || cfg.container_blur) {
        wrapClass += ' custom-bg';
        lv['--tcp-cbg'] = mode === 'none' ? 'transparent'
          : mode === 'custom' ? withAlpha((colorInfo(cfg.container_bg_color) || colorInfo([255, 255, 255])).css, op)
            : withAlpha(THEME_BG, op);
        if (Number(cfg.container_blur) > 0) lv['--tcp-cbf'] = `blur(${cfg.container_blur}px)`;
      }
    }
    const title = cfg.title ? `<div class="title">${cfg.title_icon ? `<ha-icon icon="${esc(cfg.title_icon)}"></ha-icon>` : ''}<span>${esc(cfg.title)}</span></div>` : '';
    const tag = boxed ? 'ha-card' : 'div';
    this.shadowRoot.innerHTML = `<style>${CARD_CSS}</style><${tag} class="${wrapClass}" style="${esc(styleString(lv))}">${title}${content}</${tag}>`;
  }

  _onClick(ev) {
    const el = ev.composedPath().find((n) => n.dataset && n.dataset.idx !== undefined);
    if (!el) return;
    const entry = this._entries[Number(el.dataset.idx)];
    if (!entry || !entry.entity) return;
    const action = this._config.tap_action || { action: 'more-info' };
    if (action.action === 'none') return;
    this.dispatchEvent(new CustomEvent('hass-action', {
      detail: { config: { entity: entry.entity, tap_action: action }, action: 'tap' },
      bubbles: true, composed: true,
    }));
  }

  getCardSize() {
    const n = this._entries?.length || 1;
    const layout = this._config?.layout || DEFAULTS.layout;
    if (layout === 'chips' || layout === 'icons') return 1 + (this._config?.title ? 1 : 0);
    const cols = layout === 'list' ? 1 : (this._config?.columns || DEFAULTS.columns);
    return Math.ceil(n / cols) + (this._config?.title ? 1 : 0);
  }

  getGridOptions() {
    return { columns: 12, min_columns: 3 };
  }
}

/* ------------------------------------------------------------------ */
/*  Editor – Texte                                                    */
/* ------------------------------------------------------------------ */

const EDITOR_STRINGS = {
  de: {
    tabs: { calendar: 'Kalender', display: 'Anzeige', date: 'Datum', design: 'Design', items: 'Abfallarten' },
    intro: {
      calendar: 'Aus welchem Kalender kommen die Abholtermine und welcher Zeitraum wird angezeigt?',
      display: 'Grundlayout der Karte. Farben und Transparenz findest du im Tab „Design“.',
      date: 'Wähle einfach, wie das Datum aussehen soll – die Vorschau zeigt sofort das Ergebnis.',
      design: 'Standard-Design für alle Abfallarten. Jede Abfallart kann das im Tab „Abfallarten“ individuell überschreiben.',
      items: 'Jede Abfallart hat ihr eigenes Symbol, ihre eigene Farbe und optional ein komplett eigenes Design.',
    },
    groups: {
      bg: 'Hintergrund & Transparenz', icon: 'Symbol', text: 'Text', frame: 'Rahmen, Form & Abstände',
      highlight: 'Hervorhebung (heute / morgen)', container: 'Umgebende Karte & Titel', layout: 'Layout',
      recognition: 'Erkennung im Kalender', look: 'Symbol & Farbe', item_bg: 'Hintergrund', item_text: 'Text & Rahmen',
      behaviour: 'Verhalten', period: 'Zeitraum', filter: 'Filter', custom_format: 'Eigenes Format',
    },
    fields: {
      entities: 'Kalender', next_days: 'Tage in die Zukunft', max_items: 'Maximale Anzahl Einträge (0 = alle)',
      event_grouping: 'Nur nächsten Termin je Abfallart', filter_events: 'Nur erkannte Abfallarten anzeigen',
      only_all_day_events: 'Nur ganztägige Termine', location: 'Nur Termine mit diesem Ort',
      drop_todayevents_from: 'Heutige Abholung ausblenden ab', refresh_rate: 'Kalender neu laden alle (Minuten)',
      hide_when_empty: 'Karte ausblenden, wenn keine Termine', empty_text: 'Text, wenn keine Termine',
      layout: 'Darstellung', orientation: 'Anordnung', columns: 'Spalten', alignment: 'Ausrichtung',
      show_label: 'Bezeichnung anzeigen', use_summary: 'Kalendertitel statt Bezeichnung verwenden',
      container: 'Rahmen', title: 'Titel (optional)', title_icon: 'Titel-Symbol',
      container_bg_mode: 'Hintergrund der Karte', container_bg_color: 'Farbe der Karte', container_bg_opacity: 'Deckkraft der Karte',
      container_blur: 'Unschärfe hinter der Karte (Glas-Effekt)', tap_action: 'Aktion beim Antippen',
      date_format: 'Datumsformat', df_weekday: 'Wochentag', df_day: 'Tag', df_month: 'Monat', df_year: 'Jahr',
      relative_words: '„Heute“ / „Morgen“ statt Datum', countdown: 'Countdown („in 3 Tagen“)', show_time: 'Uhrzeit bei Terminen mit Uhrzeit',
      bg_mode: 'Hintergrund', bg_color: 'Hintergrundfarbe', bg_opacity: 'Deckkraft / Farbstärke', bg_gradient: 'Farbverlauf',
      blur: 'Unschärfe dahinter (Glas-Effekt)', icon_color_mode: 'Symbolfarbe', icon_color: 'Eigene Symbolfarbe',
      icon_bg_mode: 'Symbol-Hintergrund', icon_bg_color: 'Eigene Farbe Symbol-Hintergrund', icon_bg_opacity: 'Deckkraft Symbol-Hintergrund',
      icon_shape: 'Form Symbol-Hintergrund', icon_size: 'Symbolgröße', text_color_mode: 'Textfarbe', text_color: 'Eigene Textfarbe',
      label_size: 'Schriftgröße Bezeichnung', date_size: 'Schriftgröße Datum', countdown_size: 'Größe Countdown-Badge', border_mode: 'Rahmen', border_color: 'Rahmenfarbe',
      border_width: 'Rahmenstärke', radius: 'Eckenradius', shadow: 'Schatten', padding: 'Innenabstand', gap: 'Abstand zwischen Einträgen',
      highlight: 'Hervorhebung', highlight_days: 'Hervorheben', future_opacity: 'Deckkraft späterer Termine',
      label: 'Bezeichnung', pattern: 'Suchbegriffe im Kalendertitel', pattern_exact: 'Titel muss exakt übereinstimmen',
      fallback: 'Auffang für alle nicht erkannten Termine', hidden: 'Diese Abfallart nicht anzeigen', color: 'Farbe der Abfallart',
      icon: 'Symbol', picture: 'Bild statt Symbol (URL)',
    },
    helpers: {
      pattern: 'Mehrere Begriffe mit Komma trennen, z. B. „rest, grau“. Groß-/Kleinschreibung egal.',
      picture: 'Bild nach /config/www legen und /local/dateiname.png eintragen.',
      drop_todayevents_from: 'Ganztägige Termine von heute verschwinden ab dieser Uhrzeit.',
      location: 'Praktisch, wenn ein Kalender mehrere Adressen enthält.',
      fallback: 'Termine, die zu keiner anderen Abfallart passen, bekommen dieses Aussehen.',
      bg_opacity: 'Bei „Theme + Farbton“ ist das die Stärke des Farbtons.',
      future_opacity: 'Termine, die nicht hervorgehoben sind, werden blasser dargestellt.',
    },
    opt: {
      layout: { tiles: 'Kacheln', list: 'Liste', chips: 'Chips (kompakt)', icons: 'Symbole mit Countdown' },
      orientation: { horizontal: 'Symbol links, Text rechts', vertical: 'Symbol oben, Text darunter' },
      alignment: { left: 'Links', center: 'Mittig', right: 'Rechts', space: 'Verteilt' },
      container: { none: 'Einzelne Einträge (ohne umgebende Karte)', card: 'In einer Karte zusammengefasst' },
      container_bg_mode: { theme: 'Theme-Hintergrund', custom: 'Eigene Farbe', none: 'Transparent' },
      relative_words: { none: 'Aus – immer das Format oben', today_tomorrow: 'Heute / Morgen', all: 'Heute / Morgen / Übermorgen' },
      countdown: { none: 'Nicht anzeigen', badge: 'Als Badge rechts', line: 'Als eigene Zeile' },
      df_weekday: { none: 'Kein Wochentag' }, df_month: { none: 'Kein Monat' }, df_year: { none: 'Kein Jahr' },
      bg_mode: { theme: 'Karten-Hintergrund (Theme)', tinted: 'Theme + Farbton der Abfallart', accent: 'Farbe der Abfallart', custom: 'Eigene Farbe', none: 'Transparent (kein Hintergrund)' },
      icon_color_mode: { auto: 'Automatisch', accent: 'Farbe der Abfallart', text: 'Wie Textfarbe', custom: 'Eigene Farbe' },
      icon_bg_mode: { none: 'Keiner', accent: 'Farbe der Abfallart', theme: 'Karten-Hintergrund', custom: 'Eigene Farbe' },
      icon_shape: { circle: 'Kreis', rounded: 'Abgerundet', square: 'Eckig' },
      text_color_mode: { auto: 'Automatisch (guter Kontrast)', theme: 'Theme-Textfarbe', custom: 'Eigene Farbe' },
      border_mode: { none: 'Kein Rahmen', accent: 'Farbe der Abfallart', theme: 'Dezent (Theme)', custom: 'Eigene Farbe' },
      shadow: { theme: 'Wie Theme', none: 'Kein Schatten', soft: 'Weich', strong: 'Kräftig' },
      highlight: { none: 'Keine', glow: 'Leuchten', pulse: 'Pulsieren', border: 'Farbiger Rahmen', scale: 'Etwas größer' },
      highlight_days: { 0: 'Nur heute', 1: 'Heute und morgen' },
      bg_gradient: { on: 'An', off: 'Aus' },
      date_format: {
        smart: 'Automatisch', weekday_date: 'Wochentag kurz + Datum', weekday_long_date: 'Wochentag + Datum ausgeschrieben',
        date_short: 'Tag.Monat', date_numeric: 'Datum mit Jahr', date_medium: 'Tag + Monat kurz', date_long: 'Datum ausgeschrieben',
        weekday_long: 'Nur Wochentag', weekday_short: 'Nur Wochentag kurz', countdown: 'Countdown', weekday_countdown: 'Wochentag + Countdown',
        custom: 'Eigenes Format zusammenstellen …',
      },
    },
    inherit: 'Standard',
    preview: 'Vorschau', example: 'Termin', back: 'Zurück', edit_item: 'Abfallart bearbeiten',
    add_item: 'Abfallart hinzufügen', move_up: 'Nach oben', move_down: 'Nach unten', edit: 'Bearbeiten', delete: 'Löschen',
    recognizes: 'Erkennt', no_pattern: 'Kein Suchbegriff – wird nie erkannt', fallback_short: 'Auffang für alle anderen Termine', hidden_short: 'ausgeblendet',
    new_item: 'Neue Abfallart', load_defaults: 'Standard-Abfallarten laden',
    found_title: 'Gefundene Termine im Kalender (nächste 60 Tage)', found_none: 'Keine Termine gefunden.',
    found_unmatched: 'nicht erkannt', found_add: 'Als Abfallart anlegen', found_loading: 'Lade Kalender …',
    date_rows: ['Abholung heute', 'Abholung morgen', 'Abholung übermorgen', 'In 5 Tagen', 'In 12 Tagen'],
  },
  en: {
    tabs: { calendar: 'Calendar', display: 'Display', date: 'Date', design: 'Design', items: 'Waste types' },
    intro: {
      calendar: 'Which calendar contains the collection dates and which period should be shown?',
      display: 'Basic layout of the card. Colors and transparency are in the “Design” tab.',
      date: 'Simply pick how the date should look – the preview updates instantly.',
      design: 'Default design for all waste types. Each waste type can override it in the “Waste types” tab.',
      items: 'Each waste type has its own icon, color and optionally a completely individual design.',
    },
    groups: {
      bg: 'Background & transparency', icon: 'Icon', text: 'Text', frame: 'Border, shape & spacing',
      highlight: 'Highlight (today / tomorrow)', container: 'Surrounding card & title', layout: 'Layout',
      recognition: 'Calendar matching', look: 'Icon & color', item_bg: 'Background', item_text: 'Text & border',
      behaviour: 'Behaviour', period: 'Period', filter: 'Filter', custom_format: 'Custom format',
    },
    fields: {
      entities: 'Calendars', next_days: 'Days ahead', max_items: 'Maximum entries (0 = all)',
      event_grouping: 'Only next date per waste type', filter_events: 'Only show recognized waste types',
      only_all_day_events: 'Only all-day events', location: 'Only events with this location',
      drop_todayevents_from: 'Hide today’s collection from', refresh_rate: 'Reload calendar every (minutes)',
      hide_when_empty: 'Hide card when there are no dates', empty_text: 'Text when there are no dates',
      layout: 'Style', orientation: 'Arrangement', columns: 'Columns', alignment: 'Alignment',
      show_label: 'Show label', use_summary: 'Use calendar title instead of label',
      container: 'Frame', title: 'Title (optional)', title_icon: 'Title icon',
      container_bg_mode: 'Card background', container_bg_color: 'Card color', container_bg_opacity: 'Card opacity',
      container_blur: 'Blur behind card (glass effect)', tap_action: 'Tap action',
      date_format: 'Date format', df_weekday: 'Weekday', df_day: 'Day', df_month: 'Month', df_year: 'Year',
      relative_words: '“Today” / “Tomorrow” instead of date', countdown: 'Countdown (“in 3 days”)', show_time: 'Time for events with a time',
      bg_mode: 'Background', bg_color: 'Background color', bg_opacity: 'Opacity / tint strength', bg_gradient: 'Gradient',
      blur: 'Blur behind (glass effect)', icon_color_mode: 'Icon color', icon_color: 'Custom icon color',
      icon_bg_mode: 'Icon background', icon_bg_color: 'Custom icon background color', icon_bg_opacity: 'Icon background opacity',
      icon_shape: 'Icon background shape', icon_size: 'Icon size', text_color_mode: 'Text color', text_color: 'Custom text color',
      label_size: 'Label font size', date_size: 'Date font size', countdown_size: 'Countdown badge size', border_mode: 'Border', border_color: 'Border color',
      border_width: 'Border width', radius: 'Corner radius', shadow: 'Shadow', padding: 'Padding', gap: 'Gap between entries',
      highlight: 'Highlight', highlight_days: 'Highlight', future_opacity: 'Opacity of later dates',
      label: 'Label', pattern: 'Search terms in calendar title', pattern_exact: 'Title must match exactly',
      fallback: 'Catch-all for unrecognized events', hidden: 'Do not show this waste type', color: 'Waste type color',
      icon: 'Icon', picture: 'Picture instead of icon (URL)',
    },
    helpers: {
      pattern: 'Separate multiple terms with commas, e.g. “residual, grey”. Case-insensitive.',
      picture: 'Put the image into /config/www and enter /local/filename.png.',
      drop_todayevents_from: 'Today’s all-day events disappear from this time on.',
      location: 'Useful if one calendar contains several addresses.',
      fallback: 'Events that match no other waste type get this look.',
      bg_opacity: 'For “Theme + tint” this is the strength of the tint.',
      future_opacity: 'Entries that are not highlighted are shown more faintly.',
    },
    opt: {
      layout: { tiles: 'Tiles', list: 'List', chips: 'Chips (compact)', icons: 'Icons with countdown' },
      orientation: { horizontal: 'Icon left, text right', vertical: 'Icon on top, text below' },
      alignment: { left: 'Left', center: 'Center', right: 'Right', space: 'Spread' },
      container: { none: 'Separate entries (no surrounding card)', card: 'Grouped in one card' },
      container_bg_mode: { theme: 'Theme background', custom: 'Custom color', none: 'Transparent' },
      relative_words: { none: 'Off – always the format above', today_tomorrow: 'Today / Tomorrow', all: 'Today / Tomorrow / Day after' },
      countdown: { none: 'Hidden', badge: 'As badge on the right', line: 'As separate line' },
      df_weekday: { none: 'No weekday' }, df_month: { none: 'No month' }, df_year: { none: 'No year' },
      bg_mode: { theme: 'Card background (theme)', tinted: 'Theme + waste type tint', accent: 'Waste type color', custom: 'Custom color', none: 'Transparent (no background)' },
      icon_color_mode: { auto: 'Automatic', accent: 'Waste type color', text: 'Same as text', custom: 'Custom color' },
      icon_bg_mode: { none: 'None', accent: 'Waste type color', theme: 'Card background', custom: 'Custom color' },
      icon_shape: { circle: 'Circle', rounded: 'Rounded', square: 'Square' },
      text_color_mode: { auto: 'Automatic (good contrast)', theme: 'Theme text color', custom: 'Custom color' },
      border_mode: { none: 'No border', accent: 'Waste type color', theme: 'Subtle (theme)', custom: 'Custom color' },
      shadow: { theme: 'Like theme', none: 'No shadow', soft: 'Soft', strong: 'Strong' },
      highlight: { none: 'None', glow: 'Glow', pulse: 'Pulse', border: 'Colored border', scale: 'Slightly larger' },
      highlight_days: { 0: 'Today only', 1: 'Today and tomorrow' },
      bg_gradient: { on: 'On', off: 'Off' },
      date_format: {
        smart: 'Automatic', weekday_date: 'Short weekday + date', weekday_long_date: 'Weekday + long date',
        date_short: 'Day + month', date_numeric: 'Date with year', date_medium: 'Day + short month', date_long: 'Long date',
        weekday_long: 'Weekday only', weekday_short: 'Short weekday only', countdown: 'Countdown', weekday_countdown: 'Weekday + countdown',
        custom: 'Build your own format …',
      },
    },
    inherit: 'Default',
    preview: 'Preview', example: 'Event', back: 'Back', edit_item: 'Edit waste type',
    add_item: 'Add waste type', move_up: 'Move up', move_down: 'Move down', edit: 'Edit', delete: 'Delete',
    recognizes: 'Matches', no_pattern: 'No search term – never matched', fallback_short: 'Catch-all for other events', hidden_short: 'hidden',
    new_item: 'New waste type', load_defaults: 'Load default waste types',
    found_title: 'Events found in calendar (next 60 days)', found_none: 'No events found.',
    found_unmatched: 'not recognized', found_add: 'Create waste type', found_loading: 'Loading calendar …',
    date_rows: ['Collection today', 'Collection tomorrow', 'Day after tomorrow', 'In 5 days', 'In 12 days'],
  },
};

const EDITOR_TABS = [
  { id: 'calendar', icon: 'mdi:calendar-month' },
  { id: 'display', icon: 'mdi:view-dashboard-outline' },
  { id: 'date', icon: 'mdi:calendar-clock' },
  { id: 'design', icon: 'mdi:palette-outline' },
  { id: 'items', icon: 'mdi:trash-can-outline' },
];

const EDITOR_STATE = { tab: 'calendar' };

const EDITOR_CSS = `
  :host { display:block; }
  .tabs { display:flex; gap:4px; padding:4px; margin-bottom:16px; border-radius:14px;
    background: var(--secondary-background-color, rgba(127,127,127,.12)); overflow-x:auto; }
  .tab { flex:1 1 0; min-width:62px; display:flex; flex-direction:column; align-items:center; gap:3px;
    padding:8px 4px; border:none; border-radius:10px; background:transparent; cursor:pointer;
    color: var(--secondary-text-color); font: inherit; font-size:12px; font-weight:500; transition: background .15s, color .15s; }
  .tab ha-icon { --mdc-icon-size:20px; }
  .tab:hover { color: var(--primary-text-color); }
  .tab.active { background: var(--card-background-color, #fff); color: var(--primary-color); font-weight:600; box-shadow: 0 1px 4px rgba(0,0,0,.15); }
  .intro { font-size:13px; color: var(--secondary-text-color); margin: 0 2px 14px; line-height:1.45; }
  .section-title { font-size:14px; font-weight:600; margin: 18px 2px 8px; color: var(--primary-text-color); }

  .dp { display:grid; grid-template-columns: auto 1fr; gap:8px 14px; align-items:center; padding:14px 16px; margin-bottom:16px;
    border-radius:14px; background: var(--secondary-background-color, rgba(127,127,127,.12)); }
  .dp .k { font-size:12px; color: var(--secondary-text-color); white-space:nowrap; }
  .dp .v { font-size:14px; font-weight:500; color: var(--primary-text-color); display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .dp .b { font-size:11px; font-weight:600; padding:2px 8px; border-radius:999px; background: var(--primary-color); color: var(--text-primary-color, #fff); }
  .dp .h { grid-column: 1 / -1; font-size:12px; font-weight:600; color: var(--secondary-text-color); text-transform:uppercase; letter-spacing:.05em; }

  .it-row { display:flex; align-items:center; gap:10px; padding:8px 8px 8px 10px; margin-bottom:8px; border-radius:14px;
    border:1px solid var(--divider-color, rgba(127,127,127,.25)); background: var(--card-background-color, #fff); cursor:pointer; }
  .it-row:hover { border-color: var(--primary-color); }
  .it-row.hidden { opacity:.55; }
  .it-ico { flex:0 0 auto; width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center; --mdc-icon-size:22px; }
  .it-ico img { width:26px; height:26px; object-fit:contain; }
  .it-txt { flex:1; min-width:0; }
  .it-name { font-weight:600; font-size:14px; color: var(--primary-text-color); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .it-sub { font-size:12px; color: var(--secondary-text-color); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .it-tag { font-size:10px; font-weight:600; padding:1px 6px; border-radius:6px; margin-left:6px; background: var(--secondary-background-color); color: var(--secondary-text-color); }
  .ibtn { flex:0 0 auto; width:34px; height:34px; display:flex; align-items:center; justify-content:center; border:none; border-radius:50%;
    background:transparent; color: var(--secondary-text-color); cursor:pointer; --mdc-icon-size:20px; padding:0; }
  .ibtn:hover { background: var(--secondary-background-color, rgba(127,127,127,.15)); color: var(--primary-text-color); }
  .ibtn[disabled] { opacity:.3; pointer-events:none; }
  .ibtn.del:hover { color: var(--error-color, #db4437); }
  .add { width:100%; display:flex; align-items:center; justify-content:center; gap:8px; padding:11px; margin-top:4px; border-radius:14px;
    border:1.5px dashed var(--primary-color); background:transparent; color: var(--primary-color); font: inherit; font-weight:600; font-size:14px; cursor:pointer; }
  .add:hover { background: color-mix(in srgb, var(--primary-color) 8%, transparent); }

  .found { display:flex; flex-direction:column; gap:6px; }
  .found-row { display:flex; align-items:center; gap:8px; font-size:13px; padding:6px 10px; border-radius:10px; background: var(--secondary-background-color, rgba(127,127,127,.1)); }
  .found-row .s { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color: var(--primary-text-color); }
  .found-row .m { font-size:12px; color: var(--secondary-text-color); white-space:nowrap; display:flex; align-items:center; gap:4px; --mdc-icon-size:16px; }
  .found-row .m.un { color: var(--warning-color, #ffa600); }
  .found-row .ibtn { width:28px; height:28px; --mdc-icon-size:18px; }
  .muted { font-size:12px; color: var(--secondary-text-color); padding: 4px 2px; }

  .ed-head { display:flex; align-items:center; gap:6px; margin-bottom:12px; }
  .ed-head .t { font-size:16px; font-weight:600; color: var(--primary-text-color); }
  .pv { padding:14px; margin-bottom:16px; border-radius:14px;
    background: repeating-conic-gradient(rgba(127,127,127,.08) 0% 25%, transparent 0% 50%) 0 0 / 16px 16px, var(--primary-background-color, #f5f5f5); }
  .pv-label { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.05em; color: var(--secondary-text-color); margin-bottom:8px; }
  ha-form { display:block; }
`;

const et = (hass) => {
  const l = langOf(hass).split('-')[0];
  return EDITOR_STRINGS[l] || EDITOR_STRINGS.en;
};

const deepGet = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

/* ------------------------------------------------------------------ */
/*  Editor                                                            */
/* ------------------------------------------------------------------ */

class TrashCardPlusEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._tab = EDITOR_STATE.tab;
    this._editIdx = null;
    this._paneKey = null;
    this._found = null;
    this._foundKey = '';
  }

  setConfig(config) {
    const cfg = migrateConfig(config || {});
    if (!Array.isArray(cfg.items)) cfg.items = defaultItems(langOf(this._hass));
    this._config = cfg;
    if (this._editIdx !== null && !cfg.items[this._editIdx]) this._editIdx = null;
    this._refresh();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._refresh();
    else this._pushHass();
  }

  get hass() { return this._hass; }

  /* ---------- Hilfen ---------- */

  _t(path) {
    const v = deepGet(et(this._hass), path);
    return v === undefined ? (deepGet(EDITOR_STRINGS.en, path) ?? path.split('.').pop()) : v;
  }

  _opts(key, values, withInherit = false) {
    const list = values.map((v) => ({ value: String(v), label: this._t(`opt.${key}.${v}`) }));
    if (withInherit) list.unshift({ value: 'inherit', label: this._t('inherit') });
    return { select: { mode: 'dropdown', options: list } };
  }

  _num(min, max, step = 1, unit = '', mode = 'slider') {
    return { number: { min, max, step, mode, ...(unit ? { unit_of_measurement: unit } : {}) } };
  }

  _group(key, icon, schema, expanded = false) {
    return { type: 'expandable', name: '', flatten: true, title: this._t(`groups.${key}`), icon, expanded, schema };
  }

  _pushHass() {
    this.shadowRoot.querySelectorAll('ha-form').forEach((f) => { f.hass = this._hass; });
  }

  /* ---------- Schemas ---------- */

  _schemaCalendar() {
    return [
      { name: 'entities', selector: { entity: { multiple: true, filter: { domain: 'calendar' } } } },
      this._group('period', 'mdi:calendar-range', [
        { type: 'grid', name: '', schema: [
          { name: 'next_days', selector: this._num(1, 365, 1, '', 'box') },
          { name: 'max_items', selector: this._num(0, 20, 1, '', 'box') },
        ] },
        { name: 'drop_todayevents_from', selector: { time: {} } },
        { name: 'refresh_rate', selector: this._num(5, 1440, 5, 'min', 'box') },
      ], true),
      this._group('filter', 'mdi:filter-outline', [
        { name: 'event_grouping', selector: { boolean: {} } },
        { name: 'filter_events', selector: { boolean: {} } },
        { name: 'only_all_day_events', selector: { boolean: {} } },
        { name: 'location', selector: { text: {} } },
      ], true),
      this._group('behaviour', 'mdi:eye-outline', [
        { name: 'hide_when_empty', selector: { boolean: {} } },
        ...(this._val('hide_when_empty') === false ? [{ name: 'empty_text', selector: { text: {} } }] : []),
      ]),
    ];
  }

  _schemaDisplay() {
    const layout = this._val('layout');
    const s = [
      { name: 'layout', selector: this._opts('layout', ['tiles', 'list', 'chips', 'icons']) },
    ];
    const grid = [];
    if (layout === 'tiles') grid.push({ name: 'orientation', selector: this._opts('orientation', ['horizontal', 'vertical']) });
    if (layout === 'tiles' || layout === 'icons') grid.push({ name: 'columns', selector: this._num(1, 6, 1, '', 'box') });
    if (layout === 'chips') grid.push({ name: 'alignment', selector: this._opts('alignment', ['left', 'center', 'right', 'space']) });
    if (grid.length) s.push({ type: 'grid', name: '', schema: grid });
    s.push({ type: 'grid', name: '', schema: [
      { name: 'show_label', selector: { boolean: {} } },
      { name: 'use_summary', selector: { boolean: {} } },
    ] });
    const cont = this._val('container');
    const bgMode = this._val('container_bg_mode');
    s.push(this._group('container', 'mdi:card-outline', [
      { name: 'container', selector: this._opts('container', ['none', 'card']) },
      { type: 'grid', name: '', schema: [
        { name: 'title', selector: { text: {} } },
        { name: 'title_icon', selector: { icon: {} } },
      ] },
      ...(cont === 'card' ? [
        { name: 'container_bg_mode', selector: this._opts('container_bg_mode', ['theme', 'custom', 'none']) },
        ...(bgMode === 'custom' ? [{ name: 'container_bg_color', selector: { color_rgb: {} } }] : []),
        ...(bgMode !== 'none' ? [{ name: 'container_bg_opacity', selector: this._num(0, 100, 5, '%') }] : []),
        { name: 'container_blur', selector: this._num(0, 30, 1, 'px') },
      ] : []),
    ], true));
    s.push({ name: 'tap_action', selector: { ui_action: {} } });
    return s;
  }

  _schemaDate() {
    const lang = langOf(this._hass);
    const today = startOfDay(new Date());
    const sample = addDays(today, 4);
    const fakeCfg = { ...this._config, relative_words: 'none', show_time: false };
    const options = DATE_FORMAT_KEYS.map((key) => {
      const desc = this._t(`opt.date_format.${key}`);
      if (key === 'custom') return { value: key, label: desc };
      let ex;
      if (key === 'smart') {
        ex = [0, 1, 4, 9].map((d) => dateText({ start: addDays(today, d), end: addDays(today, d + 1), allDay: true, days: d }, { date_format: 'smart', relative_words: 'today_tomorrow' }, this._hass)).join(' · ');
      } else {
        ex = dateText({ start: sample, end: addDays(sample, 1), allDay: true, days: 4 }, { ...fakeCfg, date_format: key }, this._hass);
      }
      return { value: key, label: `${ex}   —   ${desc}` };
    });
    // Beispiele für den Baukasten (5. März zeigt den Unterschied 5 / 05)
    const b = new Date(today.getFullYear(), 2, 5);
    const ex = (o) => fmtDate(b, lang, o);
    const s = [
      { name: 'date_format', selector: { select: { mode: 'dropdown', options } } },
    ];
    if (this._val('date_format') === 'custom') {
      s.push(this._group('custom_format', 'mdi:puzzle-outline', [
        { type: 'grid', name: '', schema: [
          { name: 'df_weekday', selector: { select: { mode: 'dropdown', options: [
            { value: 'none', label: this._t('opt.df_weekday.none') },
            { value: 'short', label: ex({ weekday: 'short' }) },
            { value: 'long', label: ex({ weekday: 'long' }) },
          ] } } },
          { name: 'df_day', selector: { select: { mode: 'dropdown', options: [
            { value: 'numeric', label: ex({ day: 'numeric' }).replace(/\.$/, '') },
            { value: '2-digit', label: ex({ day: '2-digit' }).replace(/\.$/, '') },
          ] } } },
          { name: 'df_month', selector: { select: { mode: 'dropdown', options: [
            { value: 'none', label: this._t('opt.df_month.none') },
            { value: 'numeric', label: ex({ month: 'numeric' }) },
            { value: '2-digit', label: ex({ month: '2-digit' }) },
            { value: 'short', label: ex({ month: 'short' }) },
            { value: 'long', label: ex({ month: 'long' }) },
          ] } } },
          { name: 'df_year', selector: { select: { mode: 'dropdown', options: [
            { value: 'none', label: this._t('opt.df_year.none') },
            { value: '2-digit', label: ex({ year: '2-digit' }) },
            { value: 'numeric', label: ex({ year: 'numeric' }) },
          ] } } },
        ] },
      ], true));
    }
    s.push(
      { name: 'relative_words', selector: this._opts('relative_words', ['none', 'today_tomorrow', 'all']) },
      { name: 'countdown', selector: this._opts('countdown', ['none', 'badge', 'line']) },
      { name: 'show_time', selector: { boolean: {} } },
    );
    return s;
  }

  _schemaDesign() {
    const v = (k) => this._val(k);
    return [
      this._group('bg', 'mdi:format-color-fill', [
        { name: 'bg_mode', selector: this._opts('bg_mode', ['theme', 'tinted', 'accent', 'custom', 'none']) },
        ...(v('bg_mode') === 'custom' ? [{ name: 'bg_color', selector: { color_rgb: {} } }] : []),
        ...(v('bg_mode') !== 'none' ? [{ name: 'bg_opacity', selector: this._num(0, 100, 1, '%') }] : []),
        ...(['tinted', 'accent', 'custom'].includes(v('bg_mode')) ? [{ name: 'bg_gradient', selector: { boolean: {} } }] : []),
        { name: 'blur', selector: this._num(0, 30, 1, 'px') },
      ], true),
      this._group('icon', 'mdi:emoticon-outline', [
        { name: 'icon_size', selector: this._num(12, 80, 1, 'px') },
        { type: 'grid', name: '', schema: [
          { name: 'icon_color_mode', selector: this._opts('icon_color_mode', ['auto', 'accent', 'text', 'custom']) },
          { name: 'icon_bg_mode', selector: this._opts('icon_bg_mode', ['none', 'accent', 'theme', 'custom']) },
        ] },
        ...(v('icon_color_mode') === 'custom' ? [{ name: 'icon_color', selector: { color_rgb: {} } }] : []),
        ...(v('icon_bg_mode') === 'custom' ? [{ name: 'icon_bg_color', selector: { color_rgb: {} } }] : []),
        ...(v('icon_bg_mode') !== 'none' ? [
          { name: 'icon_bg_opacity', selector: this._num(0, 100, 1, '%') },
          { name: 'icon_shape', selector: this._opts('icon_shape', ['circle', 'rounded', 'square']) },
        ] : []),
      ]),
      this._group('text', 'mdi:format-text', [
        { name: 'text_color_mode', selector: this._opts('text_color_mode', ['auto', 'theme', 'custom']) },
        ...(v('text_color_mode') === 'custom' ? [{ name: 'text_color', selector: { color_rgb: {} } }] : []),
        { name: 'label_size', selector: this._num(9, 32, 1, 'px') },
        { name: 'date_size', selector: this._num(8, 28, 1, 'px') },
        ...(v('layout') === 'icons' || v('countdown') === 'badge' ? [{ name: 'countdown_size', selector: this._num(8, 28, 1, 'px') }] : []),
      ]),
      this._group('frame', 'mdi:rounded-corner', [
        { name: 'border_mode', selector: this._opts('border_mode', ['none', 'accent', 'theme', 'custom']) },
        ...(v('border_mode') === 'custom' ? [{ name: 'border_color', selector: { color_rgb: {} } }] : []),
        ...(v('border_mode') !== 'none' ? [{ name: 'border_width', selector: this._num(1, 6, 1, 'px') }] : []),
        { name: 'shadow', selector: this._opts('shadow', ['theme', 'none', 'soft', 'strong']) },
        { name: 'radius', selector: this._num(0, 40, 1, 'px') },
        { name: 'padding', selector: this._num(2, 32, 1, 'px') },
        { name: 'gap', selector: this._num(0, 32, 1, 'px') },
      ]),
      this._group('highlight', 'mdi:star-four-points-outline', [
        { type: 'grid', name: '', schema: [
          { name: 'highlight', selector: this._opts('highlight', ['none', 'glow', 'pulse', 'border', 'scale']) },
          { name: 'highlight_days', selector: this._opts('highlight_days', [0, 1]) },
        ] },
        { name: 'future_opacity', selector: this._num(20, 100, 5, '%') },
      ]),
    ];
  }

  _schemaItem(item) {
    const iv = (k) => item[k] ?? 'inherit';
    const set = (k) => iv(k) !== 'inherit';
    const g = (k) => this._val(k); // globaler Wert
    const eff = (k) => (set(k) ? item[k] : g(k));
    return [
      this._group('recognition', 'mdi:text-search', [
        { name: 'label', selector: { text: {} } },
        ...(!item.fallback ? [{ name: 'pattern', selector: { text: {} } }, { name: 'pattern_exact', selector: { boolean: {} } }] : []),
        { name: 'fallback', selector: { boolean: {} } },
        { name: 'hidden', selector: { boolean: {} } },
      ], true),
      this._group('look', 'mdi:palette-swatch-outline', [
        { name: 'color', selector: { color_rgb: {} } },
        { name: 'icon', selector: { icon: {} } },
        { name: 'picture', selector: { text: {} } },
        { type: 'grid', name: '', schema: [
          { name: 'icon_color_mode', selector: this._opts('icon_color_mode', ['auto', 'accent', 'text', 'custom'], true) },
          { name: 'icon_bg_mode', selector: this._opts('icon_bg_mode', ['none', 'accent', 'theme', 'custom'], true) },
        ] },
        { name: 'icon_shape', selector: this._opts('icon_shape', ['circle', 'rounded', 'square'], true) },
        ...(eff('icon_color_mode') === 'custom' ? [{ name: 'icon_color', selector: { color_rgb: {} } }] : []),
        ...(eff('icon_bg_mode') === 'custom' ? [{ name: 'icon_bg_color', selector: { color_rgb: {} } }] : []),
        ...(set('icon_bg_mode') && item.icon_bg_mode !== 'none' ? [{ name: 'icon_bg_opacity', selector: this._num(0, 100, 1, '%') }] : []),
      ], true),
      this._group('item_bg', 'mdi:format-color-fill', [
        { name: 'bg_mode', selector: this._opts('bg_mode', ['theme', 'tinted', 'accent', 'custom', 'none'], true) },
        ...(eff('bg_mode') === 'custom' ? [{ name: 'bg_color', selector: { color_rgb: {} } }] : []),
        ...(set('bg_mode') && item.bg_mode !== 'none' ? [{ name: 'bg_opacity', selector: this._num(0, 100, 1, '%') }] : []),
        ...(['tinted', 'accent', 'custom'].includes(eff('bg_mode')) ? [{ name: 'bg_gradient', selector: this._opts('bg_gradient', ['on', 'off'], true) }] : []),
      ], true),
      this._group('item_text', 'mdi:format-text', [
        { name: 'text_color_mode', selector: this._opts('text_color_mode', ['auto', 'theme', 'custom'], true) },
        ...(eff('text_color_mode') === 'custom' ? [{ name: 'text_color', selector: { color_rgb: {} } }] : []),
        { type: 'grid', name: '', schema: [
          { name: 'border_mode', selector: this._opts('border_mode', ['none', 'accent', 'theme', 'custom'], true) },
          { name: 'shadow', selector: this._opts('shadow', ['theme', 'none', 'soft', 'strong'], true) },
        ] },
        ...(eff('border_mode') === 'custom' ? [{ name: 'border_color', selector: { color_rgb: {} } }] : []),
        ...(set('border_mode') && item.border_mode !== 'none' ? [{ name: 'border_width', selector: this._num(1, 6, 1, 'px') }] : []),
        { name: 'highlight', selector: this._opts('highlight', ['none', 'glow', 'pulse', 'border', 'scale'], true) },
      ]),
    ];
  }

  _val(key) {
    const v = this._config?.[key];
    if (v === undefined || v === null || v === '') {
      if (key === 'icon_size' && this._config?.layout === 'icons') return 40;
      return DEFAULTS[key];
    }
    return v;
  }

  // Formulardaten inkl. Standardwerte (damit Regler/Auswahl den echten Wert zeigen)
  _formData() {
    const d = { ...this._config };
    Object.keys(DEFAULTS).forEach((k) => { if (d[k] === undefined) d[k] = this._val(k); });
    d.highlight_days = String(d.highlight_days);
    if (d.max_items === undefined) d.max_items = 0;
    return d;
  }

  _itemFormData(item) {
    const d = { ...item };
    ITEM_STYLE_KEYS.forEach((k) => {
      if (d[k] === undefined) {
        if (['bg_opacity', 'icon_bg_opacity', 'border_width'].includes(k)) d[k] = this._val(k);
        else if (!['bg_color', 'icon_color', 'icon_bg_color', 'text_color', 'border_color'].includes(k)) d[k] = 'inherit';
      } else if (k === 'bg_gradient' && typeof d[k] === 'boolean') d[k] = d[k] ? 'on' : 'off';
    });
    return d;
  }

  /* ---------- Rendering ---------- */

  _refresh() {
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    const key = `${this._tab}:${this._editIdx}`;
    if (key !== this._paneKey) { this._paneKey = key; this._renderPane(); }
    this._updatePane();
  }

  _build() {
    this._built = true;
    this.shadowRoot.innerHTML = `<style>${CARD_CSS}${EDITOR_CSS}</style><div class="tabs"></div><div class="pane"></div>`;
    this._tabsEl = this.shadowRoot.querySelector('.tabs');
    this._paneEl = this.shadowRoot.querySelector('.pane');
    EDITOR_TABS.forEach((tab) => {
      const b = document.createElement('button');
      b.className = 'tab';
      b.type = 'button';
      b.dataset.tab = tab.id;
      b.innerHTML = `<ha-icon icon="${tab.icon}"></ha-icon><span>${esc(this._t(`tabs.${tab.id}`))}</span>`;
      b.addEventListener('click', () => {
        this._tab = tab.id;
        EDITOR_STATE.tab = tab.id;
        this._editIdx = null;
        this._refresh();
      });
      this._tabsEl.appendChild(b);
    });
  }

  _makeForm(onChange) {
    const f = document.createElement('ha-form');
    f.hass = this._hass;
    f.computeLabel = (s) => (s.name ? this._t(`fields.${s.name}`) : '');
    f.computeHelper = (s) => deepGet(et(this._hass), `helpers.${s.name}`) || '';
    f.addEventListener('value-changed', (ev) => { ev.stopPropagation(); onChange(ev.detail.value); });
    return f;
  }

  _renderPane() {
    const pane = this._paneEl;
    pane.innerHTML = '';
    this._form = null; this._itemForm = null; this._dp = null; this._list = null; this._pv = null; this._foundEl = null;
    this._tabsEl.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === this._tab));

    if (this._tab === 'items' && this._editIdx !== null) { this._renderItemEditor(pane); return; }

    const intro = document.createElement('div');
    intro.className = 'intro';
    intro.textContent = this._t(`intro.${this._tab}`);
    pane.appendChild(intro);

    if (this._tab === 'items') {
      this._list = document.createElement('div');
      pane.appendChild(this._list);
      const title = document.createElement('div');
      title.className = 'section-title';
      title.textContent = this._t('found_title');
      pane.appendChild(title);
      this._foundEl = document.createElement('div');
      this._foundEl.className = 'found';
      pane.appendChild(this._foundEl);
      return;
    }
    if (this._tab === 'date') {
      this._dp = document.createElement('div');
      this._dp.className = 'dp';
      pane.appendChild(this._dp);
    }
    this._form = this._makeForm((value) => this._emit(value));
    pane.appendChild(this._form);
  }

  _renderItemEditor(pane) {
    const head = document.createElement('div');
    head.className = 'ed-head';
    head.innerHTML = `<button class="ibtn back" type="button" title="${esc(this._t('back'))}"><ha-icon icon="mdi:arrow-left"></ha-icon></button><span class="t">${esc(this._t('edit_item'))}</span>`;
    head.querySelector('.back').addEventListener('click', () => { this._editIdx = null; this._refresh(); });
    pane.appendChild(head);

    this._pv = document.createElement('div');
    this._pv.className = 'pv';
    pane.appendChild(this._pv);

    this._itemForm = this._makeForm((value) => this._itemChanged(value));
    pane.appendChild(this._itemForm);
  }

  _updatePane() {
    const hass = this._hass;
    if (this._form) {
      const schemas = { calendar: () => this._schemaCalendar(), display: () => this._schemaDisplay(), date: () => this._schemaDate(), design: () => this._schemaDesign() };
      this._form.hass = hass;
      this._form.schema = schemas[this._tab]();
      this._form.data = this._formData();
    }
    if (this._dp) this._renderDatePreview();
    if (this._list) this._renderItemList();
    if (this._foundEl) this._renderFound();
    if (this._itemForm) {
      const item = this._config.items[this._editIdx];
      this._itemForm.hass = hass;
      this._itemForm.schema = this._schemaItem(item);
      this._itemForm.data = this._itemFormData(item);
      this._renderItemPreview(item);
    }
  }

  _renderDatePreview() {
    const cfg = this._config;
    const lang = langOf(this._hass);
    const today = startOfDay(new Date());
    const rows = this._t('date_rows');
    const html = [0, 1, 2, 5, 12].map((d, i) => {
      const start = addDays(today, d);
      const entry = { start, end: addDays(start, 1), allDay: true, days: d };
      const txt = dateText(entry, cfg, this._hass);
      const mode = cfg.countdown || DEFAULTS.countdown;
      let cd = mode === 'badge' ? countdownShort(d, lang, this._hass) : mode === 'line' ? countdownLong(d, lang) : '';
      if (cd && txt.toLowerCase().startsWith(cd.toLowerCase())) cd = '';
      return `<span class="k">${esc(rows[i])}</span><span class="v">${esc(txt)}${cd ? (mode === 'badge' ? `<span class="b">${esc(cd)}</span>` : ` · ${esc(cd)}`) : ''}</span>`;
    }).join('');
    this._dp.innerHTML = `<span class="h">${esc(this._t('preview'))}</span>${html}`;
  }

  _renderItemPreview(item) {
    const cfg = { ...this._config, max_items: 0 };
    const layout = cfg.layout || DEFAULTS.layout;
    const today = startOfDay(new Date());
    const idx = this._editIdx;
    const mk = (d) => ({ start: addDays(today, d), end: addDays(today, d + 1), allDay: true, summary: item.label, entity: null, itemIndex: idx, item, days: d });
    const entries = [mk(0), mk(5)];
    const cols = layout === 'list' || layout === 'chips' ? 1 : 2;
    const lv = styleString(layoutVars(cfg));
    this._pv.innerHTML = `<div class="pv-label">${esc(this._t('preview'))}</div><div class="wrap" style="${esc(lv)}"><div class="items lay-${layout}" style="--tcp-cols:${cols}">${entries.map((e) => renderEntry(e, cfg, this._hass)).join('')}</div></div>`;
  }

  _renderItemList() {
    const items = this._config.items || [];
    const list = this._list;
    list.innerHTML = '';
    items.forEach((item, i) => {
      const accent = colorInfo(item.color) || colorInfo('primary');
      const row = document.createElement('div');
      row.className = `it-row${item.hidden ? ' hidden' : ''}`;
      const pic = pictureUrl(item.picture, this._hass);
      let sub;
      if (item.fallback) sub = this._t('fallback_short');
      else if (patternList(item).length) sub = `${this._t('recognizes')}: ${patternList(item).map((p) => `„${p}“`).join(', ')}`;
      else sub = this._t('no_pattern');
      row.innerHTML = `
        <div class="it-ico" style="background:${withAlpha(accent.css, 20)};color:${accent.css}">${pic ? `<img src="${esc(pic)}" alt="">` : `<ha-icon icon="${esc(item.icon || 'mdi:trash-can')}"></ha-icon>`}</div>
        <div class="it-txt"><div class="it-name">${esc(item.label || '–')}${item.hidden ? `<span class="it-tag">${esc(this._t('hidden_short'))}</span>` : ''}</div><div class="it-sub">${esc(sub)}</div></div>
        <button class="ibtn" data-a="up" title="${esc(this._t('move_up'))}" ${i === 0 ? 'disabled' : ''}><ha-icon icon="mdi:chevron-up"></ha-icon></button>
        <button class="ibtn" data-a="down" title="${esc(this._t('move_down'))}" ${i === items.length - 1 ? 'disabled' : ''}><ha-icon icon="mdi:chevron-down"></ha-icon></button>
        <button class="ibtn" data-a="edit" title="${esc(this._t('edit'))}"><ha-icon icon="mdi:pencil-outline"></ha-icon></button>
        <button class="ibtn del" data-a="del" title="${esc(this._t('delete'))}"><ha-icon icon="mdi:delete-outline"></ha-icon></button>`;
      row.addEventListener('click', (ev) => {
        const btn = ev.composedPath().find((n) => n.dataset && n.dataset.a);
        const a = btn ? btn.dataset.a : 'edit';
        ev.stopPropagation();
        this._itemAction(a, i);
      });
      list.appendChild(row);
    });
    const add = document.createElement('button');
    add.className = 'add';
    add.type = 'button';
    add.innerHTML = `<ha-icon icon="mdi:plus"></ha-icon>${esc(this._t(items.length ? 'add_item' : 'load_defaults'))}`;
    add.addEventListener('click', () => {
      if (!items.length) { this._setItems(defaultItems(langOf(this._hass))); return; }
      this._addItem({ label: this._t('new_item'), pattern: '', icon: 'mdi:calendar-blank', color: [0, 150, 136] }, true);
    });
    list.appendChild(add);
  }

  async _loadFound() {
    const entities = (this._config.entities || []).filter(Boolean);
    const key = entities.join(',');
    if (key === this._foundKey && this._found) return;
    this._foundKey = key;
    this._found = 'loading';
    if (!entities.length) { this._found = []; return; }
    const start = startOfDay(new Date());
    const end = addDays(start, 60);
    const q = `start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;
    const res = await Promise.all(entities.map((e) => this._hass.callApi('GET', `calendars/${e}?${q}`).catch(() => [])));
    const summaries = new Map();
    res.flat().forEach((ev) => { const s = (ev.summary || '').trim(); if (s && !summaries.has(s.toLowerCase())) summaries.set(s.toLowerCase(), s); });
    this._found = [...summaries.values()].sort((a, b) => a.localeCompare(b));
    if (this._foundEl) this._renderFound();
  }

  _renderFound() {
    this._loadFound();
    const el = this._foundEl;
    if (this._found === 'loading') { el.innerHTML = `<div class="muted">${esc(this._t('found_loading'))}</div>`; return; }
    if (!this._found || !this._found.length) { el.innerHTML = `<div class="muted">${esc(this._t('found_none'))}</div>`; return; }
    const items = this._config.items || [];
    el.innerHTML = '';
    this._found.forEach((summary) => {
      const idx = items.findIndex((it) => !it.fallback && matchesItem(it, summary));
      const row = document.createElement('div');
      row.className = 'found-row';
      if (idx >= 0) {
        const it = items[idx];
        row.innerHTML = `<span class="s">${esc(summary)}</span><span class="m"><ha-icon icon="mdi:arrow-right"></ha-icon><ha-icon icon="${esc(it.icon || 'mdi:trash-can')}" style="color:${(colorInfo(it.color) || colorInfo('primary')).css}"></ha-icon>${esc(it.label)}</span>`;
      } else {
        row.innerHTML = `<span class="s">${esc(summary)}</span><span class="m un"><ha-icon icon="mdi:help-circle-outline"></ha-icon>${esc(this._t('found_unmatched'))}</span><button class="ibtn" title="${esc(this._t('found_add'))}"><ha-icon icon="mdi:plus-circle-outline"></ha-icon></button>`;
        row.querySelector('button').addEventListener('click', () => {
          this._addItem({ label: summary, pattern: summary.toLowerCase(), icon: 'mdi:calendar-blank', color: [0, 150, 136] }, true);
        });
      }
      el.appendChild(row);
    });
  }

  /* ---------- Aktionen ---------- */

  _itemAction(action, i) {
    const items = [...this._config.items];
    if (action === 'up' && i > 0) { [items[i - 1], items[i]] = [items[i], items[i - 1]]; this._setItems(items); }
    else if (action === 'down' && i < items.length - 1) { [items[i + 1], items[i]] = [items[i], items[i + 1]]; this._setItems(items); }
    else if (action === 'del') { items.splice(i, 1); this._setItems(items); }
    else if (action === 'edit') { this._editIdx = i; this._refresh(); }
  }

  _addItem(item, openEditor) {
    const items = [...(this._config.items || [])];
    // vor dem Auffang-Eintrag einfügen
    const fb = items.findIndex((it) => it.fallback);
    const pos = fb >= 0 ? fb : items.length;
    items.splice(pos, 0, item);
    if (openEditor) this._editIdx = pos;
    this._setItems(items);
  }

  _setItems(items) {
    this._emit({ ...this._config, items });
  }

  _itemChanged(value) {
    const items = [...this._config.items];
    const item = {};
    Object.entries(value).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '' || v === 'inherit') return;
      if (k === 'bg_gradient') { item[k] = v === 'on' || v === true; return; }
      item[k] = v;
    });
    // Regler nur übernehmen, wenn der zugehörige Modus überschrieben ist
    if (!item.bg_mode) delete item.bg_opacity;
    if (!item.icon_bg_mode) delete item.icon_bg_opacity;
    if (!item.border_mode) delete item.border_width;
    ['bg_opacity', 'icon_bg_opacity', 'border_width'].forEach((k) => { if (item[k] !== undefined && item[k] === this._val(k) && this._config.items[this._editIdx][k] === undefined) delete item[k]; });
    if (!item.fallback) delete item.fallback; else delete item.pattern;
    if (!item.hidden) delete item.hidden;
    if (!item.pattern_exact) delete item.pattern_exact;
    if (item.fallback) items.forEach((it, i) => { if (i !== this._editIdx && it.fallback) { items[i] = { ...it }; delete items[i].fallback; } });
    items[this._editIdx] = item;
    this._setItems(items);
  }

  _emit(value) {
    const cfg = {};
    Object.entries(value).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return;
      cfg[k] = v;
    });
    // Werte, die dem Standard entsprechen, nicht in die YAML schreiben
    Object.keys(DEFAULTS).forEach((k) => {
      if (cfg[k] === undefined) return;
      const def = k === 'icon_size' && cfg.layout === 'icons' ? 40 : DEFAULTS[k];
      if (String(cfg[k]) === String(def) && this._config[k] === undefined) delete cfg[k];
    });
    if (cfg.highlight_days !== undefined) cfg.highlight_days = Number(cfg.highlight_days);
    if (cfg.max_items === 0) delete cfg.max_items;
    if (cfg.date_format !== 'custom') ['df_weekday', 'df_day', 'df_month', 'df_year'].forEach((k) => delete cfg[k]);
    if (cfg.container !== 'card') ['container_bg_mode', 'container_bg_color', 'container_bg_opacity', 'container_blur'].forEach((k) => delete cfg[k]);
    this._config = cfg;
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: cfg }, bubbles: true, composed: true }));
    this._refresh();
  }
}

if (!customElements.get(EDITOR_TYPE)) customElements.define(EDITOR_TYPE, TrashCardPlusEditor);

if (!customElements.get(CARD_TYPE)) customElements.define(CARD_TYPE, TrashCardPlus);

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === CARD_TYPE)) {
  window.customCards.push({
    type: CARD_TYPE,
    name: 'Abfall-Karte (Trash Card Plus)',
    description: 'Zeigt die nächsten Müllabfuhr-Termine aus deinem Kalender – jede Abfallart individuell gestaltbar, mit einfachem Datumsformat.',
    preview: true,
    documentationURL: 'https://github.com/Kohle93/Trash-Card-Plus',
  });
}

console.info(`%c🗑️ ABFALL-KARTE %c v${CARD_VERSION} `, 'background:#4caf50;color:#fff;font-weight:700;border-radius:4px 0 0 4px;padding:2px 6px', 'background:#333;color:#fff;border-radius:0 4px 4px 0;padding:2px 6px');
