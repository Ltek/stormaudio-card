// StormAudio Card — Home Assistant Dashboard card for StormAudio / Focal / Bryston processors
// Version: v2026.10.13.1
//
// Read-only status on top (power → source → audio format → video), then every control
// lives in a collapsed section (Listening, Audio, Video, Zones, Triggers, Front panel,
// Info) so nothing changes by accident. For the StormAudio integration
// (github.com/Ltek/StormAudio) — the ISP/ISR series, Focal Astral 16 and Bryston SP4,
// which share the published TCP/IP API. Same design as the JVC Projector and Lumagen cards.
//
// Vanilla JS, single file, light DOM. The card stylesheet is a constant (no config
// values interpolated); per-card values are custom properties set inline on the card
// root. Entities are found by the integration's unique_id suffixes (this integration
// sets no translation_key), so renamed entity IDs keep working; disabled entities
// simply don't appear.

const BUILD_NUMBER = 'v2026.10.13.1';
const CARD_TAG = 'stormaudio-card';
const EDITOR_TAG = 'stormaudio-card-editor';
const PLATFORM = 'stormaudio';

// ---------------------------------------------------------------------------
// Entity map: key → [domain, unique_id suffix]. The media_player is the bare
// device unique_id (no suffix). Everything else is `{device_unique_id}{suffix}`.
// Disabled-by-default entities are marked; the card degrades when they are absent.
// ---------------------------------------------------------------------------
const ENTITY_KEYS = {
  media: ['media_player', ''],
  // switches
  power: ['switch', '_power'],
  mute: ['switch', '_mute'],
  dim: ['switch', '_dim'],
  dolby_virtualizer: ['switch', '_dolby_virtualizer'],
  dialog_norm: ['switch', '_dialog_norm'],
  center_spread: ['switch', '_center_spread'],
  lfe_dim: ['switch', '_lfe_dim'],
  // numbers
  volume: ['number', '_volume_level'],
  center_enhance: ['number', '_center_enhance'],
  surround_enhance: ['number', '_surround_enhance'],
  lfe_enhance: ['number', '_lfe_enhance'],
  bass: ['number', '_bass'],
  treble: ['number', '_treble'],
  brightness: ['number', '_brightness'],
  lipsync: ['number', '_lipsync'],
  auro_strength: ['number', '_auro_strength'], // disabled by default
  dialog_control: ['number', '_dialog_control'],
  fp_standby_bright: ['number', '_frontpanel_standby_brightness'], // disabled by default
  fp_active_bright: ['number', '_frontpanel_active_brightness'], // disabled by default
  // selects
  source: ['select', '_source'],
  source_zone2: ['select', '_source_zone2'], // disabled by default
  preset: ['select', '_preset'],
  dolby_mode: ['select', '_dolby_mode'],
  auro_preset: ['select', '_auro_preset'], // disabled by default
  sphereaudio: ['select', '_sphereaudio_effect'],
  loudness: ['select', '_loudness'],
  fp_standby_delay: ['select', '_frontpanel_standby_delay'], // disabled by default
  drc: ['select', '_drc'], // disabled by default
  imax_mode: ['select', '_imax_mode'], // disabled by default
  fp_color: ['select', '_frontpanel_color'], // disabled by default
  // sensors — audio
  surround_mode: ['sensor', '_surround_mode'],
  stormxt: ['sensor', '_stormxt'],
  active_speaker: ['sensor', '_active_speaker'],
  sample_rate: ['sensor', '_sample_rate'],
  stream_type: ['sensor', '_stream_type'],
  channel_format: ['sensor', '_channel_format'],
  // sensors — video (HDMI OUT 1; some disabled by default)
  video_resolution: ['sensor', '_video_resolution'],
  video_encoding: ['sensor', '_video_encoding'],
  video_refresh: ['sensor', '_video_refresh_rate'],
  video_input: ['sensor', '_video_input'], // disabled by default
  video_sync: ['sensor', '_video_sync'], // disabled by default
  video_cp: ['sensor', '_video_copy_protection'], // disabled by default
  video_colorspace: ['sensor', '_video_colorspace'],
  video_colordepth: ['sensor', '_video_colordepth'],
  video_mode: ['sensor', '_video_mode'], // disabled by default
};

// Suffixes sorted longest-first so endswith() matches the most specific key
// (e.g. `_source_zone2` before `_source`, `_video_resolution` before OUT-2's
// `_video_resolution_hdmi2` which we deliberately do NOT list).
const ENTITY_ORDER = Object.entries(ENTITY_KEYS)
  .filter(([, [, s]]) => s)
  .sort((a, b) => b[1][1].length - a[1][1].length);

// Optional entities (disabled by default in the integration) the card can use → friendly name,
// surfaced in the Info section's "enable these" note.
const OPTIONAL_ENTITIES = {
  video_mode: 'Video Mode', video_input: 'Video Input', video_sync: 'Video Sync',
  video_cp: 'Video Copy Protection', drc: 'DRC', imax_mode: 'IMAX Mode',
  auro_preset: 'Auro Preset', auro_strength: 'Auro Strength',
};

/** StormAudio processors known to HA: [{id, name}] (from the entity registry). */
function listDevices(hass) {
  const seen = new Map();
  Object.values((hass && hass.entities) || {}).forEach((e) => {
    if (e.platform !== PLATFORM || !e.device_id || seen.has(e.device_id)) return;
    const d = (hass.devices || {})[e.device_id] || {};
    seen.set(e.device_id, d.name_by_user || d.name || e.device_id);
  });
  return [...seen].map(([id, name]) => ({ id, name }));
}

/** Map ENTITY_KEYS → entity_id for one device. Missing (or disabled) keys are absent.
 *  No translation_key in this integration, so we match the unique_id suffix: exact when
 *  we can learn the device's unique_id prefix (from the bare media_player entity), else
 *  by the longest unique_id ending. */
function resolveEntities(hass, deviceId) {
  const out = {};
  if (!hass) return out;
  const all = Object.values(hass.entities || {}).filter((e) => e.platform === PLATFORM);
  const dev = deviceId || (all.find((e) => e.device_id) || {}).device_id;
  const mine = all.filter((e) => !dev || e.device_id === dev);
  // The media_player's unique_id IS the device unique_id (no suffix) — our prefix.
  const player = mine.find((e) => e.entity_id.startsWith('media_player.'));
  if (player) out.media = player.entity_id;
  const prefix = player && player.unique_id ? player.unique_id : null;
  // index remaining entities by unique_id for exact matches
  const byUid = new Map();
  mine.forEach((e) => { if (e.unique_id) byUid.set(e.unique_id, e.entity_id); });
  Object.entries(ENTITY_KEYS).forEach(([key, [domain, suffix]]) => {
    if (!suffix) return; // media handled above
    let hit = null;
    if (prefix && byUid.has(prefix + suffix)) hit = byUid.get(prefix + suffix);
    if (!hit) {
      // Fallback: an entity whose unique_id ends with this suffix and no other listed
      // (longer) suffix. ENTITY_ORDER is longest-first, so the first endswith wins only
      // if a more specific key did not already claim this entity.
      const cand = mine.find((e) => e.unique_id && e.unique_id.endsWith(suffix)
        && e.entity_id.startsWith(domain + '.')
        && !ENTITY_ORDER.some(([k2, [, s2]]) => k2 !== key && s2.length > suffix.length && e.unique_id.endsWith(s2)));
      if (cand) hit = cand.entity_id;
    }
    if (hit) out[key] = hit;
  });
  return out;
}

// ---------------------------------------------------------------------------
// Display names / helpers for the integration's raw states
// ---------------------------------------------------------------------------
const ON_OFF = { off: 'Off', on: 'On', auto: 'Auto' };
const DOLBY_MODE = { Off: 'Off', Movie: 'Movie', Music: 'Music', Night: 'Night' };
const LOUDNESS = { Off: 'Off', Low: 'Low', Medium: 'Medium', Full: 'Full' };
const FP_COLOR = { blue: 'Blue', red: 'Red', green: 'Green', white: 'White', magenta: 'Magenta', orange: 'Orange' };
// Colors the front-panel chips tint themselves (otherwise the context color).
const FP_COLOR_HEX = { blue: '#2196f3', red: '#f44336', green: '#4caf50', white: '#e0e0e0', magenta: '#e040fb', orange: '#ff9800' };

// The integration's enums (stormaudio_telnet/constants.py). Its selects and the surround-mode
// sensor already report these names; the maps also cover a raw id or snake_case value.
const SURROUND_MODE = {
  0: 'Native', 1: 'Stereo Downmix', 2: 'Dolby Surround', 3: 'DTS Neural:X', 4: 'Auro-Matic',
  native: 'Native', stereo_downmix: 'Stereo Downmix', dolby_surround: 'Dolby Surround', dts_neural_x: 'DTS Neural:X', auro_matic: 'Auro-Matic',
};
const AURO_PRESET = { 0: 'Small', 1: 'Medium', 2: 'Large', 3: 'Speech' };
const SPHERE_EFFECT = { 0: 'Bypass', 1: 'Lounge', 2: 'Home Cinema', 3: 'Concert', 4: 'Cinema', home_cinema: 'Home Cinema' };
const DETAILED_STATE = { initializing: 'Starting up', 'shutting down': 'Shutting down', shutting_down: 'Shutting down', on: 'On', off: 'Standby' };

// Audio / video format terms the processor reports as free text, by lower-cased value.
// Anything not listed is shown as the device sent it (snake_case is tidied).
const FORMAT_TERMS = {
  'dolby atmos': 'Dolby Atmos', atmos: 'Dolby Atmos', 'dolby truehd': 'Dolby TrueHD', truehd: 'Dolby TrueHD',
  'dolby digital': 'Dolby Digital', 'dolby digital plus': 'Dolby Digital Plus', 'dd+': 'Dolby Digital Plus', eac3: 'Dolby Digital Plus', ac3: 'Dolby Digital',
  'dts:x': 'DTS:X', dtsx: 'DTS:X', 'dts-hd ma': 'DTS-HD MA', 'dts-hd': 'DTS-HD', dts: 'DTS', 'auro-3d': 'Auro-3D', auro3d: 'Auro-3D',
  pcm: 'PCM', 'multi-channel pcm': 'Multichannel PCM', mpegh: 'MPEG-H', 'mpeg-h': 'MPEG-H', imax: 'IMAX Enhanced',
  sdr: 'SDR', hdr: 'HDR', hdr10: 'HDR10', 'hdr10+': 'HDR10+', hdr10plus: 'HDR10+', hlg: 'HLG', 'dolby vision': 'Dolby Vision', dv: 'Dolby Vision',
  bt709: 'BT.709', 'bt.709': 'BT.709', bt2020: 'BT.2020', 'bt.2020': 'BT.2020', rgb: 'RGB',
  ycbcr444: 'YCbCr 4:4:4', ycbcr422: 'YCbCr 4:2:2', ycbcr420: 'YCbCr 4:2:0', 'ycbcr 4:4:4': 'YCbCr 4:4:4', 'ycbcr 4:2:2': 'YCbCr 4:2:2', 'ycbcr 4:2:0': 'YCbCr 4:2:0',
  '8bit': '8-bit', '10bit': '10-bit', '12bit': '12-bit', '8-bit': '8-bit', '10-bit': '10-bit', '12-bit': '12-bit',
  hdcp14: 'HDCP 1.4', hdcp22: 'HDCP 2.2', hdcp23: 'HDCP 2.3', 'hdcp1.4': 'HDCP 1.4', 'hdcp2.2': 'HDCP 2.2', 'hdcp2.3': 'HDCP 2.3', none: 'None',
  locked: 'Locked', unlocked: 'Unlocked', 'no signal': 'No signal', nosignal: 'No signal',
};

/** Human-friendly device text: map hit (exact, then lower-cased term), else snake_case tidied, else as sent. */
function nice(v, map) {
  if (!okState(v)) return '';
  const raw = String(v).trim();
  if (map && map[raw] !== undefined) return map[raw];
  const t = FORMAT_TERMS[raw.toLowerCase()];
  if (t) return t;
  if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(raw)) return raw.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return raw;
}

/** Known label, else a tidy version of the raw value ('dolby_surround' → 'Dolby surround'). */
function pretty(map, v) {
  if (!okState(v)) return '';
  if (map && map[v] !== undefined) return map[v];
  const s = String(v).replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** A number value, rounded, with a sign for trims; '' when not a number. */
function fmtNum(v, { sign = false, unit = '' } = {}) {
  if (!okState(v) || !Number.isFinite(Number(v))) return '';
  const n = Math.round(Number(v));
  const s = sign && n > 0 ? `+${n}` : String(n);
  return unit ? `${s} ${unit}` : s;
}

// ---------------------------------------------------------------------------
// Config — byte-stable: only non-default keys are emitted
// ---------------------------------------------------------------------------
const DEFAULTS = {
  device: '',
  title: 'StormAudio',
  show_when_off: true,
  standby_text: 'below',
  standby_message: '',
  standby_button: false,
  show_dot: true,
  dot_position: 'title',
  collapsible: false,
  start_collapsed: false,
  show_status: true,
  show_listening: true,
  show_audio: true,
  show_video: true,
  show_zones: true,
  show_triggers: true,
  show_frontpanel: true,
  show_info: true,
  volume_step: 1,
  strip_prefix: true, // drop the device name prefix from entity-derived labels
  accent_color: '',
  warming_color: '',
};
const SECTIONS = [
  ['show_status', 'Status (power → source → format → video) and tags'],
  ['show_listening', 'Listening section (source, preset, volume, mute, surround modes)'],
  ['show_audio', 'Audio section (Dolby / Auro / SphereAudio, trims, enhances)'],
  ['show_video', 'Video section (resolution, encoding, color, HDMI)'],
  ['show_zones', 'Zones section (per-zone volume / mute / EQ — if enabled)'],
  ['show_triggers', 'Triggers section (12V triggers — if enabled)'],
  ['show_frontpanel', 'Front panel section (color, brightness, standby delay — if enabled)'],
  ['show_info', 'Info section'],
];
// Collapsible sections, in card order: [id, label]
const FOLDS = [
  ['listening', 'Listening'], ['audio', 'Audio'], ['video', 'Video'],
  ['zones', 'Zones'], ['triggers', 'Triggers'], ['frontpanel', 'Front panel'], ['info', 'Info'],
];

// Icons: header (also the power button) and each collapsible section.
const ICON_DEFAULTS = {
  header: 'mdi:waveform',
  listening: 'mdi:surround-sound',
  audio: 'mdi:tune',
  video: 'mdi:television',
  zones: 'mdi:speaker-multiple',
  triggers: 'mdi:flash',
  frontpanel: 'mdi:dock-window',
  info: 'mdi:information-outline',
};
const ICON_LABELS = {
  header: 'Header (power button)', listening: 'Listening', audio: 'Audio', video: 'Video',
  zones: 'Zones', triggers: 'Triggers', frontpanel: 'Front panel', info: 'Info',
};

/** 'movie' → 'mdi:movie'; 'hass:x' / 'mdi:x' kept; '' → ''. */
function normalizeIcon(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  return s.includes(':') ? s : `mdi:${s}`;
}

// Appearance: [key, group, kind, label, default(px for sizes | label for colors), min, max]
const STYLE_DEFS = [
  ['card_background', 'card', 'color', 'Background', 'Theme card background'],
  ['card_border_color', 'card', 'color', 'Border color', 'Theme border'],
  ['card_radius', 'card', 'size', 'Corner radius', 12, 0, 32],
  ['card_padding', 'card', 'size', 'Padding', 12, 4, 28],
  ['box_background', 'card', 'color', 'Box background', 'Subtle grey'],
  ['divider_color', 'card', 'color', 'Section divider color', 'Subtle grey'],
  ['header_icon_size', 'header', 'size', 'Icon size', 22, 14, 44],
  ['header_icon_color', 'header', 'color', 'Icon color (when on)', 'Context color'],
  ['title_size', 'header', 'size', 'Title size', 16, 11, 30],
  ['title_color', 'header', 'color', 'Title color', 'Primary text'],
  ['summary_size', 'header', 'size', 'Summary size', 13, 9, 22],
  ['summary_color', 'header', 'color', 'Summary color', 'Secondary text'],
  ['section_icon_size', 'sections', 'size', 'Icon size', 18, 12, 34],
  ['section_icon_color', 'sections', 'color', 'Icon color', 'Context color'],
  ['section_title_size', 'sections', 'size', 'Title size', 14, 10, 24],
  ['section_title_color', 'sections', 'color', 'Title color', 'Primary text'],
  ['subtitle_size', 'subtitles', 'size', 'Size', 10, 8, 18],
  ['subtitle_color', 'subtitles', 'color', 'Color', 'Secondary text'],
  ['text_size', 'text', 'size', 'Size', 14, 10, 26],
  ['text_color', 'text', 'color', 'Color', 'Primary text'],
  ['secondary_size', 'secondary', 'size', 'Size', 12, 9, 20],
  ['secondary_color', 'secondary', 'color', 'Color', 'Secondary text'],
  ['chip_size', 'chips', 'size', 'Text size', 13, 10, 22],
  ['chip_color', 'chips', 'color', 'Text color', 'Primary text'],
  ['chip_background', 'chips', 'color', 'Background', 'Transparent'],
  ['chip_border_color', 'chips', 'color', 'Border color', 'Subtle grey'],
  ['icon_size', 'icons', 'size', 'Size', 22, 14, 40],
  ['icon_color', 'icons', 'color', 'Color', 'Primary text'],
  ['standby_indent', 'standby', 'size', 'Standby message indent', 46, 0, 160],
];
const STYLE_GROUPS = [
  ['card', 'Card', 'Background, border and the status boxes.'],
  ['header', 'Header', 'Icon, title and the live summary on the right.'],
  ['sections', 'Section headers', 'The collapsible Listening / Audio / Video / … rows.'],
  ['subtitles', 'Subtitles', 'Box headings (SOURCE / FORMAT / VIDEO) and row labels.'],
  ['text', 'Values', 'Main values in the status boxes.'],
  ['secondary', 'Details text', 'Second lines, info rows and notes.'],
  ['chips', 'Chips & buttons', 'Source / preset / mode buttons. Active chips use the context color.'],
  ['icons', 'Icons', 'Row icons and the status arrows.'],
];
const STYLE_INDEX = Object.fromEntries(STYLE_DEFS.map((d) => [d[0], d]));
const TRANSPARENT_KEYS = new Set(['card_background', 'card_border_color', 'box_background', 'divider_color', 'chip_background', 'chip_border_color']);
const DOT_POSITIONS = [['title', 'Right of the title'], ['right', 'Far right'], ['icon', 'Replace the header icon']];
// Per-row hidden chips: config key → the select key whose options it filters (ids are the raw options).
const HIDE_LISTS = {
  hide_sources: { entity: 'source', labels: null },
  hide_presets: { entity: 'preset', labels: null },
  hide_dolby: { entity: 'dolby_mode', labels: DOLBY_MODE },
  hide_sphere: { entity: 'sphereaudio', labels: null },
};
const STANDBY_TEXT = [['below', 'Below the title'], ['inline', 'Inline with the title'], ['hidden', 'Hidden']];

/** String list: trimmed, de-duplicated, empties dropped. */
function strList(a) {
  const out = [];
  (Array.isArray(a) ? a : []).forEach((v) => {
    const s = String(v == null ? '' : v).trim();
    if (s && !out.includes(s)) out.push(s);
  });
  return out;
}

function normalizeConfig(raw) {
  const c = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  if (c.type !== undefined) out.type = c.type;
  Object.keys(DEFAULTS).forEach((k) => {
    if (c[k] === undefined || c[k] === null) return;
    let v = c[k];
    const d = DEFAULTS[k];
    if (typeof d === 'boolean') v = v === true || v === 'true';
    else if (typeof d === 'number') { v = Number(v); if (!Number.isFinite(v)) return; v = Math.min(20, Math.max(1, Math.round(v))); }
    else v = String(v).trim();
    if (v === d) return;
    out[k] = v;
  });
  if (c.icons && typeof c.icons === 'object') {
    const icons = {};
    Object.keys(c.icons).forEach((k) => {
      const v = normalizeIcon(c.icons[k]);
      if (v && v !== ICON_DEFAULTS[k]) icons[k] = v;
    });
    if (Object.keys(icons).length) out.icons = icons;
  }
  if (c.styles && typeof c.styles === 'object') {
    const styles = {};
    Object.keys(c.styles).forEach((k) => {
      const def = STYLE_INDEX[k];
      let v = c.styles[k];
      if (v === undefined || v === null || v === '') return;
      if (!def) { styles[k] = v; return; } // unknown (newer build): keep verbatim
      if (def[2] === 'size') {
        v = Number(v);
        if (!Number.isFinite(v) || v === def[4]) return;
        v = Math.round(Math.min(def[6], Math.max(def[5], v)));
        if (v === def[4]) return;
      } else v = String(v).trim();
      if (v !== '') styles[k] = v;
    });
    if (Object.keys(styles).length) out.styles = styles;
  }
  Object.keys(HIDE_LISTS).forEach((k) => {
    const list = strList(c[k]);
    if (list.length) out[k] = list;
  });
  const open = strList(c.open_sections).filter((s) => FOLDS.some(([id]) => id === s));
  if (open.length) out.open_sections = FOLDS.map(([id]) => id).filter((id) => open.includes(id));
  const known = ['type', 'icons', 'styles', 'open_sections'];
  Object.keys(c).forEach((k) => {
    if (!(k in out) && !(k in DEFAULTS) && !(k in HIDE_LISTS) && !known.includes(k)) out[k] = c[k];
  });
  return out;
}

function cfg(config, key) {
  return config[key] !== undefined ? config[key] : DEFAULTS[key];
}

function iconFor(config, key) {
  return (config.icons && config.icons[key]) || ICON_DEFAULTS[key];
}

/** Per-card custom properties (inline on the card root; never in the stylesheet). */
function rootStyleVars(config) {
  const vars = [];
  if (config.accent_color) vars.push(`--sa-accent:${config.accent_color}`);
  if (config.warming_color) vars.push(`--sa-warm:${config.warming_color}`);
  const st = config.styles || {};
  STYLE_DEFS.forEach(([key, , kind]) => {
    if (st[key] === undefined) return;
    vars.push(`--sa-${key.replace(/_/g, '-')}:${st[key]}${kind === 'size' ? 'px' : ''}`);
  });
  return vars.join(';');
}

/** Classes on the card root that depend on config (constant stylesheet, no interpolation). */
function rootClasses(config) {
  const st = config.styles || {};
  const cls = ['sa'];
  if (st.card_border_color) cls.push('has-border');
  if (st.card_background === 'transparent') cls.push('is-flat');
  return cls.join(' ');
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------
function okState(v) { return v !== undefined && v !== null && v !== '' && v !== 'unknown' && v !== 'unavailable'; }

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Strip the device-name prefix the integration bakes into friendly names ("ISP Source" → "Source"). */
function stripPrefix(name, deviceName) {
  if (!name) return name;
  if (deviceName && name.startsWith(deviceName + ' ')) return name.slice(deviceName.length + 1);
  return name;
}

const PENDING_MS = 12000; // how long a tapped option shows as "sending" before the poll catches up

// ---------------------------------------------------------------------------
// Card stylesheet — CONSTANT (identical for every instance; see design system §0.9)
// ---------------------------------------------------------------------------
const CARD_CSS = `
.sa { --sa-ctx: var(--sa-accent, var(--primary-color, #2196F3));
  --sa-box: var(--sa-box-background, rgba(127,127,127,0.10));
  padding: var(--sa-card-padding, 12px) calc(var(--sa-card-padding, 12px) + 2px) calc(var(--sa-card-padding, 12px) - 2px);
  overflow: hidden; background: var(--sa-card-background, var(--ha-card-background, var(--card-background-color)));
  border-radius: var(--sa-card-radius, var(--ha-card-border-radius, 12px)); }
.sa.has-border { border: var(--ha-card-border-width, 1px) solid var(--sa-card-border-color); }
.sa.is-flat { box-shadow: none; }
.sa [hidden] { display: none !important; }
.sa button { font: inherit; }
.sa-head { display: flex; align-items: center; gap: 10px; min-height: 36px; }
.sa-power { flex: 0 0 auto; width: calc(var(--sa-header-icon-size, 22px) + 14px); height: calc(var(--sa-header-icon-size, 22px) + 14px);
  border-radius: 50%; border: none; cursor: pointer; background: transparent; color: var(--disabled-text-color, #777);
  display: flex; align-items: center; justify-content: center; transition: background .2s, color .2s;
  --mdc-icon-size: var(--sa-header-icon-size, 22px); --sa-pwr: var(--sa-header-icon-color, var(--sa-ctx)); }
.sa.is-warming .sa-power { --sa-pwr: var(--sa-warm, #ff9800); }
.sa.is-on .sa-power, .sa.is-warming .sa-power {
  color: var(--sa-pwr); background: color-mix(in srgb, var(--sa-pwr) 16%, transparent); }
.sa.is-warming .sa-power ha-icon { animation: sa-pulse 1.6s ease-in-out infinite; }
@keyframes sa-pulse { 50% { opacity: .4; } }
.sa-title { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: var(--sa-title-size, 16px); font-weight: 500; white-space: nowrap;
  color: var(--sa-title-color, var(--primary-text-color)); }
.sa-dot { flex: 0 0 auto; width: 8px; height: 8px; border-radius: 50%; background: var(--disabled-text-color, #777); }
.sa-dot.at-right { margin-left: 2px; }
.sa-dot.at-icon { width: calc(var(--sa-header-icon-size, 22px) * .6); height: calc(var(--sa-header-icon-size, 22px) * .6); }
.sa-dot.ok { background: var(--success-color, #4caf50); }
.sa-dot.bad { background: var(--error-color, #f44336); }
.sa-summary { margin-left: auto; min-width: 0; font-size: var(--sa-summary-size, 13px); color: var(--sa-summary-color, var(--secondary-text-color));
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sa.is-down .sa-summary { color: var(--error-color, #f44336); }
.sa.is-warming .sa-summary { color: var(--sa-warm, #ff9800); }
.sa-head.is-tap { cursor: pointer; }
.sa-hchev { color: var(--secondary-text-color); --mdc-icon-size: 20px; transition: transform .2s; flex: 0 0 auto; }
.sa.is-collapsed .sa-hchev { transform: rotate(-90deg); }
.sa.is-collapsed .sa-body { display: none; }
.sa-sb-inline { margin-left: max(0px, calc(var(--sa-standby-indent, 46px) - 46px)); font-size: var(--sa-secondary-size, 12px); font-weight: 400; color: var(--sa-secondary-color, var(--secondary-text-color));
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sa-pwr2 { margin-left: auto; flex: 0 0 auto; width: 34px; height: 34px; border-radius: 50%; border: none; cursor: pointer;
  background: var(--sa-box); color: var(--sa-header-icon-color, var(--sa-ctx)); display: flex; align-items: center; justify-content: center;
  --mdc-icon-size: 20px; }
.sa-pwr2:hover { background: color-mix(in srgb, var(--sa-ctx) 20%, transparent); }
.sa-standby { padding: 2px 0 2px var(--sa-standby-indent, 46px); font-size: var(--sa-secondary-size, 13px); color: var(--sa-secondary-color, var(--secondary-text-color)); }
.sa-chain { display: grid; grid-template-columns: minmax(0,1fr) auto minmax(0,1fr) auto minmax(0,1fr); gap: 6px; margin-top: 10px; }
.sa-box { min-width: 0; padding: 8px 6px; border-radius: 10px; text-align: center; background: var(--sa-box); }
.sa-box-h { font-size: var(--sa-subtitle-size, 10px); letter-spacing: .08em; text-transform: uppercase; color: var(--sa-subtitle-color, var(--secondary-text-color)); }
.sa-box-t { font-size: var(--sa-text-size, 14px); font-weight: 600; color: var(--sa-text-color, var(--primary-text-color));
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sa-box-s { font-size: var(--sa-secondary-size, 12px); color: var(--sa-secondary-color, var(--secondary-text-color));
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sa-vol { height: 4px; margin: 5px 10% 4px; border-radius: 2px; background: rgba(127,127,127,0.2); overflow: hidden; }
.sa-vol > span { display: block; height: 100%; border-radius: 2px; background: var(--sa-ctx); transition: width .4s ease; }
.sa-arrow { align-self: center; color: var(--sa-icon-color, var(--sa-ctx)); --mdc-icon-size: 18px; }
.sa-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.sa-tags:empty { display: none; }
.sa-tag { padding: 1px 8px; border: 1px solid currentColor; border-radius: 999px; font-size: 11px; font-weight: 600;
  letter-spacing: .04em; color: var(--secondary-text-color); }
.sa-tag.ctx { color: var(--sa-ctx); }
.sa-tag.bad { color: var(--error-color, #f44336); }
.sa-tag.ok { color: var(--success-color, #4caf50); }
.sa-fold { margin-top: 10px; border-top: 1px solid var(--sa-divider-color, rgba(127,127,127,0.2)); }
.sa-fold > summary { display: flex; align-items: center; gap: 8px; padding: 8px 0 2px; cursor: pointer; list-style: none;
  font-size: var(--sa-section-title-size, 14px); color: var(--sa-section-title-color, var(--primary-text-color)); user-select: none; }
.sa-fold > summary::-webkit-details-marker { display: none; }
.sa-fold > summary .sa-sec-i { color: var(--sa-section-icon-color, var(--sa-ctx)); --mdc-icon-size: var(--sa-section-icon-size, 18px); }
.sa-fold > summary .sa-chev { margin-left: auto; color: var(--secondary-text-color); --mdc-icon-size: 18px; transition: transform .2s; }
.sa-fold[open] > summary .sa-chev { transform: rotate(90deg); }
.sa-fold > summary .sa-peek { font-size: var(--sa-secondary-size, 12px); color: var(--sa-secondary-color, var(--secondary-text-color));
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.sa-row { display: flex; align-items: flex-start; gap: 8px; margin-top: 8px; }
.sa-row-l { flex: 0 0 92px; padding-top: 6px; font-size: var(--sa-subtitle-size, 12px); color: var(--sa-subtitle-color, var(--secondary-text-color)); }
.sa-opts { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
.sa-chip { padding: 5px 10px; border: 1px solid var(--sa-chip-border-color, rgba(127,127,127,0.35)); border-radius: 8px; cursor: pointer;
  background: var(--sa-chip-background, transparent); color: var(--sa-chip-color, var(--primary-text-color));
  font-size: var(--sa-chip-size, 13px); white-space: nowrap; transition: background .2s, border-color .2s; }
.sa-chip:hover { border-color: var(--sa-ctx); }
.sa-chip.on { background: var(--sa-ctx); border-color: var(--sa-ctx); color: #fff; }
.sa-chip.pend { border-style: dashed; border-color: var(--sa-ctx); color: var(--sa-ctx); animation: sa-pulse 1.2s ease-in-out infinite; }
.sa-chip[data-swatch].on { background: var(--sa-sw, var(--sa-ctx)); border-color: var(--sa-sw, var(--sa-ctx)); }
.sa.is-off .sa-ctl, .sa.is-down .sa-ctl { opacity: .45; pointer-events: none; }
.sa.is-down [data-sec="status"] .sa-chain { opacity: .45; }
/* toggle pills (switches) */
.sa-toggles { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.sa-toggle { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--sa-chip-border-color, rgba(127,127,127,0.35)); background: var(--sa-chip-background, transparent);
  color: var(--sa-chip-color, var(--secondary-text-color)); font-size: var(--sa-chip-size, 13px); --mdc-icon-size: 18px; }
.sa-toggle ha-icon { color: var(--secondary-text-color); }
.sa-toggle.on { color: var(--sa-ctx); border-color: var(--sa-ctx); }
.sa-toggle.on ha-icon { color: var(--sa-ctx); }
.sa-toggle.pend { border-style: dashed; animation: sa-pulse 1.2s ease-in-out infinite; }
/* slider rows (numbers) */
.sa-slider { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.sa-slider-l { flex: 0 0 92px; font-size: var(--sa-subtitle-size, 12px); color: var(--sa-subtitle-color, var(--secondary-text-color)); }
.sa-range { flex: 1 1 auto; min-width: 80px; accent-color: var(--sa-ctx); cursor: pointer; }
.sa-slider-v { flex: 0 0 52px; text-align: right; font-weight: 600; font-variant-numeric: tabular-nums;
  font-size: var(--sa-text-size, 14px); color: var(--sa-text-color, var(--primary-text-color)); }
.sa-vollarge { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.sa-vollarge .sa-key { flex: 0 0 40px; height: 36px; }
.sa-key { display: flex; align-items: center; justify-content: center; border: none; border-radius: 10px; cursor: pointer;
  background: var(--sa-box); color: var(--sa-icon-color, var(--primary-text-color)); font-size: var(--sa-chip-size, 12px);
  --mdc-icon-size: var(--sa-icon-size, 22px); }
.sa-key:hover { background: color-mix(in srgb, var(--sa-ctx) 20%, transparent); }
.sa-group-h { margin-top: 12px; font-size: var(--sa-subtitle-size, 10px); letter-spacing: .08em; text-transform: uppercase;
  color: var(--sa-subtitle-color, var(--secondary-text-color)); }
.sa-info { display: grid; grid-template-columns: auto minmax(0,1fr); gap: 4px 12px; margin-top: 8px;
  font-size: var(--sa-secondary-size, 12px); color: var(--sa-secondary-color, var(--secondary-text-color)); }
.sa-info > b { font-weight: 500; color: var(--sa-text-color, var(--primary-text-color)); text-align: right;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sa-note { margin-top: 8px; font-size: var(--sa-secondary-size, 12px); line-height: 1.5; color: var(--sa-secondary-color, var(--secondary-text-color)); }
.sa-note.bad { color: var(--error-color, #f44336); }
.sa-empty { margin-top: 8px; font-size: var(--sa-secondary-size, 12px); color: var(--secondary-text-color); font-style: italic; }
`;

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
class StormAudioCard extends HTMLElement {
  static getConfigElement() { return document.createElement(EDITOR_TAG); }
  static getStubConfig() { return {}; }

  constructor() {
    super();
    this._config = {};
    this._built = false;
    this._sig = '';
    this._optSig = {};
    this._timer = null;
    this._press = null;
    this._editMode = false;
    this._preview = false;
    this._open = null;
    this._pending = {};
    this._dragging = false;
  }

  setConfig(config) {
    if (!config || typeof config !== 'object') throw new Error('Invalid configuration');
    const next = normalizeConfig(config);
    if (cfg(next, 'start_collapsed') !== cfg(this._config, 'start_collapsed') || cfg(next, 'collapsible') !== cfg(this._config, 'collapsible')) {
      this._collapsed = undefined;
    }
    if (!this._open || JSON.stringify(next.open_sections || []) !== JSON.stringify(this._config.open_sections || [])) {
      this._open = new Set(next.open_sections || []);
    }
    this._config = next;
    this._built = false;
    if (this._hass) this._build();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._built) this._build();
    else this._schedule();
  }

  set editMode(v) { this._editMode = !!v; this._applyVisibility(); }
  set preview(v) { this._preview = !!v; this._applyVisibility(); }

  getCardSize() { return 6; }
  getGridOptions() { return { columns: 12, min_columns: 6, rows: 'auto' }; }

  _schedule() {
    if (this._timer) return;
    this._timer = setTimeout(() => { this._timer = null; this._update(false); }, 250);
  }

  // -- build once -----------------------------------------------------------
  _build() {
    const c = this._config;
    if (!this._open) this._open = new Set(c.open_sections || []);
    const fold = (sec, label, body) => `
      <details class="sa-fold" data-sec="${sec}"${this._open.has(sec) ? ' open' : ''}>
        <summary><ha-icon class="sa-sec-i" icon="${esc(iconFor(c, sec))}"></ha-icon><span>${label}</span>
          <span class="sa-peek" data-peek="${sec}"></span><ha-icon class="sa-chev" icon="mdi:chevron-right"></ha-icon></summary>
        ${body}
      </details>`;
    const standbyText = esc(cfg(c, 'standby_message') || 'Standby · tap the icon to power on');
    const dotAt = cfg(c, 'show_dot') ? cfg(c, 'dot_position') : 'none';
    const dot = (where) => (dotAt === where ? `<span class="sa-dot at-${where}" data-k="dot" data-pos="${where}"></span>` : '');
    if (this._collapsed === undefined) this._collapsed = cfg(c, 'collapsible') && cfg(c, 'start_collapsed');
    const box = (id, title, bar) => `<div class="sa-box"><div class="sa-box-h">${title}</div><div class="sa-box-t" data-k="${id}_t"></div>`
      + `${bar ? '<div class="sa-vol"><span data-k="vol_bar"></span></div>' : `<div class="sa-box-s" data-k="${id}_1"></div>`}<div class="sa-box-s" data-k="${id}_2"></div></div>`;
    const arrow = '<ha-icon class="sa-arrow" icon="mdi:chevron-right"></ha-icon>';
    // chip/toggle/slider row scaffolds (filled live)
    const chipRow = (name, label) => `<div class="sa-row" data-row="${name}"><div class="sa-row-l">${label}</div><div class="sa-opts" data-opts="${name}"></div></div>`;
    const slider = (name, label) => `<div class="sa-slider" data-slider="${name}"><div class="sa-slider-l">${label}</div>`
      + `<input type="range" class="sa-range" data-range="${name}" aria-label="${esc(label)}"><span class="sa-slider-v" data-sval="${name}"></span></div>`;
    this.innerHTML = `
      <style>${CARD_CSS}</style>
      <ha-card class="${rootClasses(c)}" style="${esc(rootStyleVars(c))}">
        <div class="sa-head${cfg(c, 'collapsible') ? ' is-tap' : ''}"${cfg(c, 'collapsible') ? ' data-tap="collapse"' : ''}>
          <button class="sa-power" data-tap="power" aria-label="Power">${dotAt === 'icon' ? dot('icon') : `<ha-icon icon="${esc(iconFor(c, 'header'))}"></ha-icon>`}</button>
          <div class="sa-title"><span>${esc(cfg(c, 'title'))}</span>${dot('title')}
            <span class="sa-sb-inline" data-k="standby_inline" hidden>${standbyText}</span></div>
          <div class="sa-summary" data-k="summary"></div>${dot('right')}
          <button class="sa-pwr2" data-tap="power" data-k="pwr2" aria-label="Power on" hidden><ha-icon icon="mdi:power"></ha-icon></button>
          <ha-icon class="sa-hchev" data-k="hchev" icon="mdi:chevron-down" hidden></ha-icon>
        </div>
        <div class="sa-standby" data-k="standby" hidden>${standbyText}</div>
        <div class="sa-body" data-k="body">
          <div data-sec="status">
            <div class="sa-chain">${box('src', 'Source')}${arrow}${box('fmt', 'Format')}${arrow}${box('vid', 'Video')}</div>
            <div class="sa-tags" data-k="tags"></div>
          </div>
          ${fold('listening', 'Listening', `
            <div class="sa-ctl">
              <div class="sa-vollarge">
                <button class="sa-key" data-tap="vol-step" data-dir="-1" aria-label="Volume down"><ha-icon icon="mdi:minus"></ha-icon></button>
                <input type="range" class="sa-range" data-k="vol_range" min="0" max="100" step="1" aria-label="Volume">
                <button class="sa-key" data-tap="vol-step" data-dir="1" aria-label="Volume up"><ha-icon icon="mdi:plus"></ha-icon></button>
                <span class="sa-slider-v" data-k="vol_val"></span>
              </div>
              <div class="sa-toggles" data-k="listen_toggles"></div>
              ${chipRow('source', 'Source')}
              ${chipRow('preset', 'Preset')}
              ${chipRow('surround', 'Surround')}
            </div>`)}
          ${fold('audio', 'Audio', `
            <div class="sa-ctl">
              ${chipRow('dolby_mode', 'Dolby')}
              ${chipRow('sphereaudio', 'SphereAudio')}
              ${chipRow('auro_preset', 'Auro')}
              ${chipRow('loudness', 'Loudness')}
              ${chipRow('drc', 'DRC')}
              ${chipRow('imax_mode', 'IMAX')}
              <div class="sa-group-h">Trims &amp; enhance</div>
              <div data-k="audio_sliders"></div>
              <div class="sa-toggles" data-k="audio_toggles"></div>
            </div>`)}
          ${fold('video', 'Video', `
            <div class="sa-info" data-k="video_info"></div>
            <div class="sa-note" data-k="video_note"></div>`)}
          ${fold('zones', 'Zones', `
            <div class="sa-ctl" data-k="zones_body"></div>
            <div class="sa-empty" data-k="zones_empty" hidden>No extra zones enabled. Enable the per-zone entities in Settings → Devices &amp; services → StormAudio → device → Entities.</div>`)}
          ${fold('triggers', 'Triggers', `
            <div class="sa-toggles" data-k="triggers_body"></div>
            <div class="sa-empty" data-k="triggers_empty" hidden>No 12V triggers enabled. Enable the Trigger entities in the integration to control them here.</div>`)}
          ${fold('frontpanel', 'Front panel', `
            <div class="sa-ctl">
              ${chipRow('fp_color', 'Color')}
              ${chipRow('fp_standby_delay', 'Standby delay')}
              <div data-k="fp_sliders"></div>
            </div>
            <div class="sa-empty" data-k="fp_empty" hidden>Front-panel entities are disabled by default (and absent on Focal / Bryston). Enable them in the integration to control them here.</div>`)}
          ${fold('info', 'Info', `
            <div class="sa-info" data-k="info"></div>
            <div class="sa-note" data-k="link"></div>
            <div class="sa-note" data-k="missing"></div>`)}
        </div>
      </ha-card>`;
    this._root = this.querySelector('.sa');
    this._k = {};
    this.querySelectorAll('[data-k]').forEach((el) => { this._k[el.dataset.k] = el; });
    this.querySelectorAll('details.sa-fold').forEach((d) => d.addEventListener('toggle', () => {
      if (d.open) this._open.add(d.dataset.sec); else this._open.delete(d.dataset.sec);
    }));
    const range = this._k.vol_range;
    range.addEventListener('input', () => { this._dragging = true; this._k.vol_val.textContent = `${range.value}`; });
    range.addEventListener('change', () => { this._dragging = false; this._setNumber('volume', Number(range.value)); });
    this._bind();
    this._built = true;
    this._sig = '';
    this._optSig = {};
    this._update(true);
  }

  // -- input handling ---------------------------------------------------------
  _bind() {
    const root = this._root;
    const target = (e) => e.target.closest && e.target.closest('[data-tap],[data-opt],[data-toggle],[data-numkey]');
    root.addEventListener('click', (e) => {
      const el = target(e);
      if (!el) return;
      if (el.dataset.opt !== undefined) { this._select(el.dataset.ent, el.dataset.opt); return; }
      if (el.dataset.toggle !== undefined) { this._toggle(el.dataset.toggle); return; }
      if (el.dataset.numkey !== undefined) { this._numStep(el.dataset.numkey, Number(el.dataset.dir)); return; }
      if (el.dataset.tap) this._run(el.dataset.tap, el);
    });
    // per-slider drag handling (bound on the container; ranges carry data-range / data-zrange)
    root.addEventListener('input', (e) => {
      const r = e.target.closest && e.target.closest('[data-range],[data-zrange]');
      if (!r || r.dataset.k === 'vol_range') return;
      this._dragging = true;
      const out = r.closest('.sa-slider').querySelector('.sa-slider-v');
      if (out) out.textContent = this._fmtRange(r);
    });
    root.addEventListener('change', (e) => {
      const r = e.target.closest && e.target.closest('[data-range],[data-zrange]');
      if (!r || r.dataset.k === 'vol_range') return;
      this._dragging = false;
      if (r.dataset.range) this._setNumber(r.dataset.range, Number(r.value));
      else if (r.dataset.zrange) this._setEntityNumber(r.dataset.zrange, Number(r.value));
    });
  }

  _fmtRange(r) {
    const unit = r.dataset.unit || '';
    const sign = r.dataset.sign === '1';
    const n = Math.round(Number(r.value));
    const s = sign && n > 0 ? `+${n}` : String(n);
    return unit ? `${s} ${unit}` : s;
  }

  _call(domain, service, data) {
    if (!this._hass) return;
    Promise.resolve(this._hass.callService(domain, service, data)).catch((err) => this._toast(`StormAudio: ${err && err.message ? err.message : err}`));
  }

  _toast(message) {
    this.dispatchEvent(new CustomEvent('hass-notification', { detail: { message }, bubbles: true, composed: true }));
  }

  _markPending(entityId, value) {
    this._pending[entityId] = { value, until: Date.now() + PENDING_MS };
    setTimeout(() => { if (this._built) this._update(true); }, PENDING_MS + 50);
  }

  _pendingFor(entityId, current) {
    const p = this._pending[entityId];
    if (!p) return null;
    if (Date.now() > p.until || String(p.value) === String(current)) { delete this._pending[entityId]; return null; }
    return p.value;
  }

  _select(entityId, option) {
    if (!entityId) return;
    this._markPending(entityId, option);
    this._call('select', 'select_option', { entity_id: entityId, option });
    this._update(true);
  }

  _toggle(key) {
    const E = this._ents || {};
    const id = E[key];
    if (!id || !this._hass) return;
    const cur = this._hass.states[id];
    const isOn = cur && cur.state === 'on';
    this._markPending(id, isOn ? 'off' : 'on');
    this._call('switch', isOn ? 'turn_off' : 'turn_on', { entity_id: id });
    this._update(true);
  }

  _numState(key) {
    const E = this._ents || {};
    const s = E[key] && this._hass && this._hass.states[E[key]];
    const a = (s && s.attributes) || {};
    const n = (x, d) => (Number.isFinite(Number(x)) ? Number(x) : d);
    return { s, id: E[key], min: n(a.min, 0), max: n(a.max, 100), step: n(a.step, 1),
      unit: a.unit_of_measurement || '', value: s && okState(s.state) ? Number(s.state) : null };
  }

  _setNumber(key, value) {
    const N = this._numState(key);
    if (!N.id) return;
    const v = Math.min(N.max, Math.max(N.min, Math.round(value / N.step) * N.step));
    this._markPending(N.id, v);
    this._call('number', 'set_value', { entity_id: N.id, value: v });
    this._update(true);
  }

  _setEntityNumber(entityId, value) {
    if (!entityId || !this._hass) return;
    const s = this._hass.states[entityId];
    const a = (s && s.attributes) || {};
    const min = Number.isFinite(Number(a.min)) ? Number(a.min) : 0;
    const max = Number.isFinite(Number(a.max)) ? Number(a.max) : 100;
    const step = Number.isFinite(Number(a.step)) ? Number(a.step) : 1;
    const v = Math.min(max, Math.max(min, Math.round(value / step) * step));
    this._markPending(entityId, v);
    this._call('number', 'set_value', { entity_id: entityId, value: v });
    this._update(true);
  }

  _numStep(key, dir) {
    const N = this._numState(key);
    const cur = this._pendingFor(N.id, N.value) ?? N.value;
    if (cur !== null) this._setNumber(key, Number(cur) + dir * N.step);
  }

  _run(action) {
    const E = this._ents || {};
    switch (action) {
      case 'power': {
        const id = E.power || E.media;
        if (!id) break;
        const isOn = this._powerState === 'on';
        if (E.power) this._call('switch', isOn ? 'turn_off' : 'turn_on', { entity_id: E.power });
        else this._call('media_player', isOn ? 'turn_off' : 'turn_on', { entity_id: E.media });
        break;
      }
      case 'vol-step': {
        // dir carried on the button via closest()
        break;
      }
      case 'collapse':
        if (this._powerState !== 'on') break;
        this._collapsed = !this._collapsed;
        this._applyCollapse();
        break;
      default: break;
    }
  }

  _applyCollapse() {
    if (!this._built) return;
    const can = cfg(this._config, 'collapsible') && this._powerState === 'on';
    const collapsed = can && !!this._collapsed && !this._editMode && !this._preview;
    this._root.classList.toggle('is-collapsed', collapsed);
    this._k.hchev.hidden = !can;
  }

  _applyVisibility() {
    if (!this._built) return;
    const hide = !cfg(this._config, 'show_when_off') && this._powerState === 'off' && !this._editMode && !this._preview;
    this.style.display = hide ? 'none' : '';
    this._applyCollapse();
  }

  // -- live patching ----------------------------------------------------------
  _update(force) {
    const h = this._hass;
    if (!h || !this._built) return;
    const c = this._config;
    const E = (this._ents = resolveEntities(h, cfg(c, 'device')));
    this._deviceName = this._deviceNameFor(h, cfg(c, 'device'));
    const st = (k) => (E[k] ? h.states[E[k]] : undefined);
    const v = (k) => { const s = st(k); return s ? s.state : undefined; };
    // zones / triggers discovered from the registry (dynamic)
    const zones = this._discoverZones(h, cfg(c, 'device'));
    const triggers = this._discoverTriggers(h, cfg(c, 'device'));
    const sig = JSON.stringify(Object.keys(ENTITY_KEYS).map((k) => {
      const s = st(k);
      return s ? [s.state, s.attributes.options, s.attributes.min, s.attributes.max] : null;
    })) + JSON.stringify(this._pending) + JSON.stringify([zones.map((z) => z.id), triggers.map((t) => t.id)]);
    if (!force && sig === this._sig) return;
    this._sig = sig;

    const K = this._k;
    const set = (k, text) => { if (K[k] && K[k].textContent !== text) K[k].textContent = text; };
    const html = (el, markup) => { if (el && el.innerHTML !== markup) el.innerHTML = markup; };

    const media = st('media');
    const found = !!(E.power || E.media);
    // power: prefer the switch; else media_player on/off; detailed_state refines it.
    let ps = okState(v('power')) ? v('power') : (media ? media.state : undefined);
    const detailed = media && media.attributes ? media.attributes.detailed_state : undefined;
    const isDown = found && ((media && media.state === 'unavailable') || v('power') === 'unavailable');
    const warming = !isDown && (detailed === 'initializing' || detailed === 'shutting down');
    const isOn = !isDown && (ps === 'on' || ps === 'playing' || ps === 'idle' || ps === 'paused');
    this._powerState = isDown ? 'unavailable' : (isOn ? 'on' : 'off');

    const R = this._root.classList;
    R.toggle('is-on', isOn);
    R.toggle('is-off', !isOn);
    R.toggle('is-down', isDown);
    R.toggle('is-warming', warming);

    // header dot + summary
    if (K.dot) {
      const dotCls = `sa-dot at-${K.dot.dataset.pos}` + (!found ? '' : isDown ? ' bad' : ' ok');
      if (K.dot.className !== dotCls) K.dot.className = dotCls;
      const tip = !found ? '' : isDown ? 'Processor not reachable' : 'Processor reachable';
      if (K.dot.title !== tip) K.dot.title = tip;
    }
    const source = this._currentOption('source') || (media && media.attributes && media.attributes.source);
    const summary = !found ? 'No StormAudio processor found — pick a device in the card editor'
      : isDown ? 'Offline'
        : warming ? (detailed === 'initializing' ? 'Starting up…' : 'Shutting down…')
          : !isOn ? 'Standby'
            : [source, nice(v('surround_mode'), SURROUND_MODE), nice(v('stream_type'))].filter(okState).filter(Boolean).join(' · ') || 'On';
    const standby = found && !isDown && !isOn && !warming;
    const sbMode = cfg(c, 'standby_text');
    const sbButton = standby && cfg(c, 'standby_button');
    set('summary', sbButton ? '' : summary);
    K.summary.hidden = sbButton;
    K.pwr2.hidden = !sbButton;
    K.standby_inline.hidden = !(standby && sbMode === 'inline');
    K.standby.hidden = !(standby && sbMode === 'below');
    K.body.hidden = !found || (!isOn && !isDown);

    // sections on/off (config) + entity availability
    this.querySelectorAll('[data-sec]').forEach((el) => {
      const sec = el.dataset.sec;
      let show = cfg(c, { status: 'show_status' }[sec] || `show_${sec}`);
      if (sec === 'listening') show = show && !!(E.volume || E.source || E.preset);
      if (sec === 'audio') show = show && !!(E.dolby_mode || E.bass || E.treble || E.sphereaudio);
      if (sec === 'video') show = show && !!(E.video_resolution || E.video_encoding);
      if (sec === 'zones') show = show && zones.length > 0;
      if (sec === 'triggers') show = show && triggers.length > 0;
      if (sec === 'frontpanel') show = show && !!(E.fp_color || E.fp_standby_delay || E.fp_active_bright || E.fp_standby_bright);
      el.hidden = !show;
    });

    // status boxes: source › format › video
    set('src_t', source || '—');
    set('src_1', nice(v('surround_mode'), SURROUND_MODE) || '—');
    set('src_2', pretty(DOLBY_MODE, this._currentOption('dolby_mode')) || '—');
    set('fmt_t', nice(v('stream_type')) || '—');
    set('fmt_1', nice(v('channel_format')) || '—');
    set('fmt_2', nice(v('sample_rate')) || '—');
    const res = v('video_resolution');
    const rate = v('video_refresh');
    set('vid_t', okState(res) ? (okState(rate) ? `${res}` : res) : '—');
    set('vid_1', okState(rate) ? rate : (okState(v('video_encoding')) ? v('video_encoding') : '—'));
    set('vid_2', nice(v('video_colorspace')) || '—');

    // tags
    const tags = [];
    if (isDown) tags.push(['LINK DOWN', 'bad']);
    if (isOn && v('mute') === 'on') tags.push(['MUTED', 'bad']);
    const sm = st('surround_mode');
    if (isOn && sm && sm.attributes && sm.attributes.engaged === true) tags.push(['STORM', 'ctx']);
    if (isOn && v('stormxt') === 'on') tags.push(['STORMXT', 'ctx']);
    if (isOn && okState(v('video_encoding')) && /hdr|dolby|hlg/i.test(v('video_encoding'))) tags.push([String(v('video_encoding')).toUpperCase(), 'ctx']);
    if (isOn && v('dim') === 'on') tags.push(['DIM', '']);
    html(K.tags, tags.map(([t, cls]) => `<span class="sa-tag ${cls}">${esc(t)}</span>`).join(''));

    // --- Listening section ---
    const vol = this._numState('volume');
    const volShown = this._pendingFor(vol.id, vol.value) ?? vol.value;
    if (!this._dragging) {
      const range = K.vol_range;
      ['min', 'max'].forEach((a) => { if (range.getAttribute(a) !== String(vol[a])) range.setAttribute(a, String(vol[a])); });
      if (volShown !== null && range.value !== String(volShown)) range.value = String(volShown);
      range.disabled = volShown === null;
      set('vol_val', volShown === null ? '—' : `${Math.round(volShown)}`);
    }
    this._toggles('listen_toggles', [['mute', 'Mute', 'mdi:volume-off'], ['dim', 'Dim', 'mdi:brightness-5']], E);
    this._chips('source', E.source, st('source'), null, 'hide_sources');
    this._chips('preset', E.preset, st('preset'), null, 'hide_presets');
    // "surround" row is read-only: show the current surround mode + allowed engage state
    this._readoutRow('surround', okState(v('surround_mode')) ? [nice(v('surround_mode'), SURROUND_MODE)] : []);

    // --- Audio section ---
    this._chips('dolby_mode', E.dolby_mode, st('dolby_mode'), DOLBY_MODE, 'hide_dolby');
    this._chips('sphereaudio', E.sphereaudio, st('sphereaudio'), null, 'hide_sphere');
    this._chips('auro_preset', E.auro_preset, st('auro_preset'), null);
    this._chips('loudness', E.loudness, st('loudness'), LOUDNESS);
    this._chips('drc', E.drc, st('drc'), ON_OFF);
    this._chips('imax_mode', E.imax_mode, st('imax_mode'), ON_OFF);
    this._sliders('audio_sliders', [
      ['bass', 'Bass', true], ['treble', 'Treble', true], ['center_enhance', 'Center enh.', true],
      ['surround_enhance', 'Surround enh.', true], ['lfe_enhance', 'LFE enh.', true], ['brightness', 'Brightness', true],
      ['dialog_control', 'Dialog', true], ['lipsync', 'LipSync', true], ['auro_strength', 'Auro', false],
    ], E);
    this._toggles('audio_toggles', [
      ['dolby_virtualizer', 'Dolby Virt.', 'mdi:surround-sound'], ['dialog_norm', 'Dialog Norm', 'mdi:account-voice'],
      ['center_spread', 'Center Spread', 'mdi:arrow-expand-horizontal'], ['lfe_dim', 'LFE Dim', 'mdi:subwoofer'],
    ], E);

    // --- Video info ---
    const vrows = [
      ['Resolution', okState(res) ? res : ''],
      ['Refresh', okState(rate) ? rate : ''],
      ['Encoding', nice(v('video_encoding'))],
      ['Color space', nice(v('video_colorspace'))],
      ['Color depth', nice(v('video_colordepth'))],
      ['Mode', nice(v('video_mode'))],
      ['Input', nice(v('video_input'))],
      ['Sync', nice(v('video_sync'))],
      ['Copy protection', nice(v('video_cp'))],
    ].filter(([, val]) => val);
    html(K.video_info, vrows.map(([l, val]) => `<span>${esc(l)}</span><b>${esc(val)}</b>`).join(''));
    const vmissing = [];
    if (!E.video_mode) vmissing.push('Video Mode');
    if (!E.video_input) vmissing.push('Video Input');
    set('video_note', isOn && vmissing.length ? `Disabled sensors: ${vmissing.join(' · ')} — enable them per the Info section.` : '');
    K.video_note.hidden = !(isOn && vmissing.length);

    // --- Zones ---
    this._renderZones(zones, h);
    K.zones_empty.hidden = zones.length > 0;
    // --- Triggers ---
    this._renderTriggers(triggers, h);
    K.triggers_empty.hidden = triggers.length > 0;
    // --- Front panel ---
    this._chips('fp_color', E.fp_color, st('fp_color'), FP_COLOR);
    this._chips('fp_standby_delay', E.fp_standby_delay, st('fp_standby_delay'), null);
    this._sliders('fp_sliders', [['fp_active_bright', 'Active', false], ['fp_standby_bright', 'Standby', false]], E);
    const fpAny = !!(E.fp_color || E.fp_standby_delay || E.fp_active_bright || E.fp_standby_bright);
    K.fp_empty.hidden = fpAny;

    // --- peeks on collapsed section headers ---
    const peek = (sec, text) => { const el = this.querySelector(`[data-peek="${sec}"]`); if (el && el.textContent !== text) el.textContent = text; };
    peek('listening', [source, volShown !== null ? `Vol ${Math.round(volShown)}` : '', v('mute') === 'on' ? 'Muted' : ''].filter(Boolean).join(' · '));
    peek('audio', [pretty(DOLBY_MODE, this._currentOption('dolby_mode')), nice(this._currentOption('sphereaudio'), SPHERE_EFFECT)].filter(Boolean).join(' · '));
    peek('video', okState(res) ? `${res}${okState(rate) ? ' · ' + rate : ''}` : '');
    peek('zones', zones.length ? `${zones.length} zone${zones.length > 1 ? 's' : ''}` : '');
    peek('triggers', triggers.length ? `${triggers.length} trigger${triggers.length > 1 ? 's' : ''}` : '');
    peek('frontpanel', pretty(FP_COLOR, this._currentOption('fp_color')));
    peek('info', isDown ? 'not reachable' : nice(v('active_speaker')));

    // --- Info ---
    const rows = [
      ['Power', isDown ? 'Not reachable' : (warming ? nice(detailed, DETAILED_STATE) : (isOn ? 'On' : 'Standby'))],
      ['Source', source || ''],
      ['Preset', this._currentOption('preset') || ''],
      ['Surround mode', nice(v('surround_mode'), SURROUND_MODE)],
      ['StormXT', pretty(ON_OFF, v('stormxt'))],
      ['Speaker config', nice(v('active_speaker'))],
      ['Sample rate', nice(v('sample_rate'))],
      ['Stream type', nice(v('stream_type'))],
      ['Channel format', nice(v('channel_format'))],
      ['Resolution', okState(res) ? res : ''],
      ['Encoding', nice(v('video_encoding'))],
    ].filter(([, val]) => val);
    html(K.info, rows.map(([l, val]) => `<span>${esc(l)}</span><b>${esc(val)}</b>`).join(''));
    set('link', !found ? '' : isDown
      ? 'The integration cannot reach the processor. Check its network connection and that it is powered on.'
      : 'Connected over the local TCP/IP API (local push).');
    const lcls = 'sa-note' + (isDown ? ' bad' : '');
    if (K.link.className !== lcls) K.link.className = lcls;
    const missing = Object.entries(OPTIONAL_ENTITIES).filter(([k]) => !E[k]).map(([, n]) => n);
    set('missing', found && missing.length ? `Disabled entities you can enable: ${missing.join(' · ')} — Settings → Devices & services → StormAudio → device → Entities.` : '');
    K.missing.hidden = !found || !missing.length;

    this._applyVisibility();
  }

  _deviceNameFor(hass, deviceId) {
    const all = Object.values(hass.entities || {}).filter((e) => e.platform === PLATFORM);
    const dev = deviceId || (all.find((e) => e.device_id) || {}).device_id;
    const d = (hass.devices || {})[dev] || {};
    return d.name_by_user || d.name || '';
  }

  _currentOption(key) {
    const E = this._ents || {};
    const s = E[key] && this._hass && this._hass.states[E[key]];
    return s && okState(s.state) ? s.state : '';
  }

  /** Option chips for a select. */
  _chips(name, entityId, state, labels, hideKey) {
    const box = this.querySelector(`[data-opts="${name}"]`);
    const row = this.querySelector(`[data-row="${name}"]`);
    if (!box) return;
    if (row) row.hidden = !entityId;
    if (!entityId) { box.innerHTML = ''; this._optSig[name] = ''; return; }
    const hidden = new Set((hideKey && this._config[hideKey]) || []);
    const all = (state && state.attributes && state.attributes.options) || [];
    const options = all.filter((o) => !hidden.has(String(o)));
    const sig = JSON.stringify([entityId, options, name]);
    const swatch = name === 'fp_color';
    if (this._optSig[name] !== sig) {
      this._optSig[name] = sig;
      box.innerHTML = options.map((o) => {
        const sw = swatch && FP_COLOR_HEX[o] ? ` data-swatch style="--sa-sw:${FP_COLOR_HEX[o]}"` : '';
        return `<button class="sa-chip" data-opt="${esc(o)}" data-ent="${esc(entityId)}"${sw} title="${esc(o)}">${esc(pretty(labels, o))}</button>`;
      }).join('');
    }
    const current = state ? state.state : null;
    const pend = this._pendingFor(entityId, current);
    box.querySelectorAll('[data-opt]').forEach((b) => {
      b.classList.toggle('on', b.dataset.opt === current && pend === null);
      b.classList.toggle('pend', pend !== null && b.dataset.opt === String(pend));
    });
  }

  /** Toggle pills for switches: defs = [[key, label, icon], …]. */
  _toggles(containerKey, defs, E) {
    const box = this._k[containerKey];
    if (!box) return;
    const present = defs.filter(([k]) => E[k]);
    const sig = JSON.stringify(present.map(([k]) => [k, E[k]]));
    if (this._optSig[containerKey] !== sig) {
      this._optSig[containerKey] = sig;
      box.innerHTML = present.map(([k, label, icon]) =>
        `<button class="sa-toggle" data-toggle="${k}" aria-label="${esc(label)}"><ha-icon icon="${esc(icon)}"></ha-icon><span>${esc(label)}</span></button>`).join('');
    }
    present.forEach(([k]) => {
      const btn = box.querySelector(`[data-toggle="${k}"]`);
      if (!btn) return;
      const s = this._hass.states[E[k]];
      const cur = s ? s.state : null;
      const pend = this._pendingFor(E[k], cur);
      const on = pend !== null ? pend === 'on' : cur === 'on';
      btn.classList.toggle('on', on);
      btn.classList.toggle('pend', pend !== null);
    });
    box.hidden = present.length === 0;
  }

  /** Slider rows for numbers: defs = [[key, label, signed], …]. */
  _sliders(containerKey, defs, E) {
    const box = this._k[containerKey];
    if (!box) return;
    const present = defs.filter(([k]) => E[k]);
    const sig = JSON.stringify(present.map(([k]) => {
      const N = this._numState(k); return [k, E[k], N.min, N.max, N.step, N.unit];
    }));
    if (this._optSig[containerKey] !== sig) {
      this._optSig[containerKey] = sig;
      box.innerHTML = present.map(([k, label, signed]) => {
        const N = this._numState(k);
        return `<div class="sa-slider" data-slider="${k}"><div class="sa-slider-l">${esc(label)}</div>`
          + `<input type="range" class="sa-range" data-range="${k}" min="${N.min}" max="${N.max}" step="${N.step}"`
          + ` data-unit="${esc(N.unit)}" data-sign="${signed ? '1' : '0'}" aria-label="${esc(label)}">`
          + `<span class="sa-slider-v" data-sval="${k}"></span></div>`;
      }).join('');
    }
    if (this._dragging) return;
    present.forEach(([k, , signed]) => {
      const N = this._numState(k);
      const shown = this._pendingFor(N.id, N.value) ?? N.value;
      const r = box.querySelector(`[data-range="${k}"]`);
      const out = box.querySelector(`[data-sval="${k}"]`);
      if (r && shown !== null && r.value !== String(shown)) r.value = String(shown);
      if (r) r.disabled = shown === null;
      if (out) out.textContent = shown === null ? '—' : fmtNum(shown, { sign: signed, unit: N.unit });
    });
  }

  /** Read-only value chips (no tap), e.g. the current surround mode. */
  _readoutRow(name, values) {
    const box = this.querySelector(`[data-opts="${name}"]`);
    const row = this.querySelector(`[data-row="${name}"]`);
    if (!box) return;
    if (row) row.hidden = values.length === 0;
    const markup = values.map((val) => `<span class="sa-chip on" style="cursor:default">${esc(val)}</span>`).join('');
    if (box.innerHTML !== markup) box.innerHTML = markup;
  }

  // -- dynamic zones / triggers ----------------------------------------------
  _entitiesForDevice(hass, deviceId) {
    const all = Object.values(hass.entities || {}).filter((e) => e.platform === PLATFORM);
    const dev = deviceId || (all.find((e) => e.device_id) || {}).device_id;
    return all.filter((e) => !dev || e.device_id === dev);
  }

  _discoverZones(hass, deviceId) {
    const mine = this._entitiesForDevice(hass, deviceId);
    const zones = new Map();
    mine.forEach((e) => {
      const m = e.unique_id && e.unique_id.match(/_zone(\d+)_(volume|mute|eq|bass|treble|lipsync|binaural_mode)$/);
      if (!m) return;
      const zid = m[1];
      if (!zones.has(zid)) zones.set(zid, { id: zid, ents: {} });
      zones.get(zid).ents[m[2]] = e.entity_id;
    });
    return [...zones.values()].sort((a, b) => Number(a.id) - Number(b.id));
  }

  _discoverTriggers(hass, deviceId) {
    const mine = this._entitiesForDevice(hass, deviceId);
    const out = [];
    mine.forEach((e) => {
      const m = e.unique_id && e.unique_id.match(/_trigger(\d+)$/);
      if (!m) return;
      const s = hass.states[e.entity_id];
      const name = s && s.attributes && s.attributes.friendly_name
        ? stripPrefix(s.attributes.friendly_name, this._deviceName).replace(/^Trigger:\s*/i, '')
        : `Trigger ${m[1]}`;
      out.push({ id: m[1], entity_id: e.entity_id, name });
    });
    return out.sort((a, b) => Number(a.id) - Number(b.id));
  }

  _renderZones(zones, hass) {
    const box = this._k.zones_body;
    if (!box) return;
    const sig = JSON.stringify(zones.map((z) => [z.id, Object.keys(z.ents).sort(), z.ents.volume]));
    if (this._optSig.zones !== sig) {
      this._optSig.zones = sig;
      box.innerHTML = zones.map((z) => {
        const zname = this._zoneName(hass, z);
        const vol = z.ents.volume ? `<div class="sa-slider"><div class="sa-slider-l">Volume</div>`
          + `<input type="range" class="sa-range" data-zrange="${esc(z.ents.volume)}" min="0" max="100" step="1" aria-label="${esc(zname)} volume">`
          + `<span class="sa-slider-v" data-zval="${esc(z.ents.volume)}"></span></div>` : '';
        const toggles = ['mute', 'eq', 'binaural_mode'].filter((k) => z.ents[k]).map((k) => {
          const label = { mute: 'Mute', eq: 'EQ', binaural_mode: 'Binaural' }[k];
          const icon = { mute: 'mdi:volume-off', eq: 'mdi:equalizer', binaural_mode: 'mdi:headphones' }[k];
          return `<button class="sa-toggle" data-ztoggle="${esc(z.ents[k])}" aria-label="${esc(label)}"><ha-icon icon="${icon}"></ha-icon><span>${label}</span></button>`;
        }).join('');
        return `<div class="sa-group-h">${esc(zname)}</div>${vol}${toggles ? `<div class="sa-toggles">${toggles}</div>` : ''}`;
      }).join('');
      // wire zone toggles (switch) — delegate via data-ztoggle on click
      box.querySelectorAll('[data-ztoggle]').forEach((btn) => btn.addEventListener('click', () => {
        const id = btn.dataset.ztoggle;
        const s = this._hass.states[id];
        const isOn = s && s.state === 'on';
        this._markPending(id, isOn ? 'off' : 'on');
        this._call('switch', isOn ? 'turn_off' : 'turn_on', { entity_id: id });
        this._update(true);
      }));
    }
    if (!this._dragging) {
      zones.forEach((z) => {
        if (z.ents.volume) {
          const s = hass.states[z.ents.volume];
          const val = s && okState(s.state) ? Math.round(Number(s.state)) : null;
          const shown = this._pendingFor(z.ents.volume, val) ?? val;
          const r = box.querySelector(`[data-zrange="${CSS && CSS.escape ? CSS.escape(z.ents.volume) : z.ents.volume}"]`) || box.querySelector(`[data-zrange="${z.ents.volume}"]`);
          const out = box.querySelector(`[data-zval="${z.ents.volume}"]`);
          if (r && shown !== null && r.value !== String(shown)) r.value = String(shown);
          if (out) out.textContent = shown === null ? '—' : String(shown);
        }
      });
    }
    zones.forEach((z) => ['mute', 'eq', 'binaural_mode'].forEach((k) => {
      if (!z.ents[k]) return;
      const btn = box.querySelector(`[data-ztoggle="${z.ents[k]}"]`);
      if (!btn) return;
      const s = hass.states[z.ents[k]];
      const pend = this._pendingFor(z.ents[k], s ? s.state : null);
      const on = pend !== null ? pend === 'on' : (s && s.state === 'on');
      btn.classList.toggle('on', on);
      btn.classList.toggle('pend', pend !== null);
    }));
  }

  _zoneName(hass, z) {
    const anyEnt = z.ents.volume || z.ents.mute || z.ents.eq;
    const s = anyEnt && hass.states[anyEnt];
    if (s && s.attributes && s.attributes.friendly_name) {
      let n = stripPrefix(s.attributes.friendly_name, this._deviceName);
      n = n.replace(/\s+(Volume|Mute|EQ|Bass|Treble|LipSync|Binaural Mode)$/i, '');
      if (n) return n;
    }
    return `Zone ${z.id}`;
  }

  _renderTriggers(triggers, hass) {
    const box = this._k.triggers_body;
    if (!box) return;
    const sig = JSON.stringify(triggers.map((t) => [t.id, t.entity_id, t.name]));
    if (this._optSig.triggers !== sig) {
      this._optSig.triggers = sig;
      box.innerHTML = triggers.map((t) =>
        `<button class="sa-toggle" data-ztoggle="${esc(t.entity_id)}" aria-label="${esc(t.name)}"><ha-icon icon="mdi:flash"></ha-icon><span>${esc(t.name)}</span></button>`).join('');
      box.querySelectorAll('[data-ztoggle]').forEach((btn) => btn.addEventListener('click', () => {
        const id = btn.dataset.ztoggle;
        const s = this._hass.states[id];
        const isOn = s && s.state === 'on';
        this._markPending(id, isOn ? 'off' : 'on');
        this._call('switch', isOn ? 'turn_off' : 'turn_on', { entity_id: id });
        this._update(true);
      }));
    }
    triggers.forEach((t) => {
      const btn = box.querySelector(`[data-ztoggle="${t.entity_id}"]`);
      if (!btn) return;
      const s = hass.states[t.entity_id];
      const pend = this._pendingFor(t.entity_id, s ? s.state : null);
      const on = pend !== null ? pend === 'on' : (s && s.state === 'on');
      btn.classList.toggle('on', on);
      btn.classList.toggle('pend', pend !== null);
    });
    box.hidden = triggers.length === 0;
  }
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------
const THEME_COLORS = [
  ['var(--primary-color)', 'Primary'],
  ['var(--accent-color)', 'Accent'],
  ['var(--primary-text-color)', 'Primary text'],
  ['var(--secondary-text-color)', 'Secondary text'],
  ['var(--disabled-text-color)', 'Disabled text'],
  ['var(--state-active-color)', 'State active'],
  ['var(--error-color)', 'Error'],
  ['var(--warning-color)', 'Warning'],
  ['var(--success-color)', 'Success'],
  ['var(--info-color)', 'Info'],
];
const CONTEXT_COLORS = [
  ['accent_color', 'Accent', 'Theme primary', '#2196f3'],
  ['warming_color', 'Starting / stopping', 'Orange', '#ff9800'],
];

function colorMode(cur, allowTransparent = false) {
  cur = cur == null ? '' : String(cur);
  if (cur === '') return 'default';
  if (allowTransparent && cur === 'transparent') return 'transparent';
  if (/^#[0-9a-fA-F]{3,8}$/.test(cur)) return 'custom';
  if (/^var\(/.test(cur) && THEME_COLORS.some(([v]) => v === cur)) return 'theme';
  return 'css';
}

const EDITOR_CSS = `
        .sae {
          /* Font sizes (by role, not by pixel) */
          --ltek-fs-panel-title: 16px;  /* top-level panel / section title */
          --ltek-fs-header: 15px;       /* editor header, panel summary */
          --ltek-fs-group: 14px;        /* group heading inside a panel */
          --ltek-fs-label: 13px;        /* standard field label / row */
          --ltek-fs-body: 12px;         /* body text, most controls */
          --ltek-fs-small: 11px;        /* hints, secondary text */
          --ltek-fs-tiny: 10px;         /* badges, micro-labels */
          /* Font weights */
          --ltek-fw-normal: 400;        /* control labels (recede) */
          --ltek-fw-medium: 500;
          --ltek-fw-semibold: 600;
          --ltek-fw-bold: 700;          /* titles, values (lead) */
          /* Text colors */
          --ltek-c-text: var(--primary-text-color, #e1e1e1);  /* primary */
          --ltek-c-label: #ccc;         /* control labels */
          --ltek-c-muted: #888;         /* hints / disabled */
          --ltek-c-accent: var(--primary-color, #2196F3);
          /* Accent tints — hover / active fills (kept as rgba literals; one place
             to change). Default to the Material blue the cards shipped with. */
          --ltek-c-accent-fade: rgba(var(--rgb-primary-color,33,150,243),0.12);       /* active / pressed fill */
          --ltek-c-accent-fade-soft: rgba(var(--rgb-primary-color,33,150,243),0.08);  /* hover fill */
          --ltek-c-error-fade: rgba(244,67,54,0.15);         /* delete hover fill */
          /* Status colors — defer to the user's theme, fall back to Material. */
          --ltek-c-error: var(--error-color, #f44336);
          --ltek-c-success: var(--success-color, #4caf50);
          --ltek-c-warning: var(--warning-color, #ffb300);
          --ltek-c-info: var(--info-color, #2196F3);
          /* Second accent: the green "library / shared" grouping (distinct from
             the blue layout accent on purpose — NOT tied to --primary-color). */
          --ltek-c-accent-lib: #7fd18a;
          --ltek-c-on-accent: #fff;   /* text/icon on a solid accent fill */
          /* Action icons (edit/copy/hide/etc): neutral idle → brighten on hover.
             Delete stays a status color (error) on its own hover. */
          --ltek-c-icon: #aaa;        /* idle action icon */
          --ltek-c-icon-hover: #fff;  /* hovered action icon */
          /* Surfaces */
          --ltek-c-surface: rgba(255,255,255,0.015);        /* panels */
          --ltek-c-surface-raised: rgba(255,255,255,0.02);  /* cards / rows */
          /* Borders */
          --ltek-c-panel-border: #3a3a3a;   /* panels */
          --ltek-c-border: #444;            /* controls */
          --ltek-c-border-soft: #333;       /* subtle inner dividers */
          /* Radii */
          --ltek-r-panel: 12px;   /* panels */
          --ltek-r-card: 10px;    /* section cards */
          --ltek-r-md: 8px;       /* blocks */
          --ltek-r-ctrl: 6px;     /* inputs, selects, buttons */
          /* Spacing scale (4px base) */
          --ltek-sp-1: 4px;
          --ltek-sp-2: 6px;
          --ltek-sp-3: 8px;
          --ltek-sp-4: 10px;
          --ltek-sp-5: 12px;
          --ltek-sp-6: 16px;
          /* Control padding — uniform input/select/button height. */
          --ltek-ctrl-pad: 6px 10px;
          /* Icon sizes (two clear roles; one-off glyphs stay literal). */
          --ltek-icon-sm: 16px;   /* inline / action icons */
          --ltek-icon-lg: 20px;   /* panel-title icons */
          /* Slider row geometry (shared by every slider) */
          --ltek-slider-val-w: 44px;   /* value readout column width */
          display: flex; flex-direction: column; gap: 8px; font-family: var(--paper-font-body1_-_font-family, sans-serif);
        }
        .sae ha-icon { --mdc-icon-size: 18px; vertical-align: middle; }
        .sae-sec { border: 1px solid var(--ltek-c-panel-border); border-radius: var(--ltek-r-panel); background: var(--ltek-c-surface); overflow: hidden; }
        .sae-sec[open] { border-color: var(--ltek-c-accent); }
        .sae-sec > summary { display: flex; align-items: center; gap: var(--ltek-sp-3); padding: 14px 16px; cursor: pointer; user-select: none;
          list-style: none; font-size: var(--ltek-fs-panel-title); font-weight: var(--ltek-fw-bold); color: var(--ltek-c-text); }
        .sae-sec > summary::-webkit-details-marker, .sae-sub > summary::-webkit-details-marker { display: none; }
        .sae-sec > summary > ha-icon:not(.chev) { color: var(--ltek-c-accent); --mdc-icon-size: var(--ltek-icon-lg); }
        .sae-sec > summary .chev, .sae-sub > summary .chev { margin-left: auto; color: #999; --mdc-icon-size: 20px; transition: transform .2s ease; transform: rotate(-90deg); }
        .sae-sec[open] > summary .chev, .sae-sub[open] > summary .chev { transform: none; }
        .sae-body { padding: 0 16px 16px; }
        .sae-hint { color: var(--ltek-c-muted); font-size: var(--ltek-fs-small); margin: 0 0 var(--ltek-sp-3); }
        .sae-group { color: var(--accent-color, var(--ltek-c-accent)); font-size: var(--ltek-fs-group); font-weight: var(--ltek-fw-semibold);
          margin-top: var(--ltek-sp-4); padding-top: var(--ltek-sp-3); border-top: 1px solid var(--ltek-c-border-soft); }
        .sae-group.first { margin-top: 0; padding-top: 0; border-top: none; }
        .sae-sub { border-top: 1px solid var(--ltek-c-border-soft); border-radius: var(--ltek-r-ctrl); }
        .sae-sub + .sae-sub { margin-top: 0; }
        .sae-sub[open] { border: 1px solid var(--accent-color, var(--ltek-c-accent)); margin: var(--ltek-sp-1) 0; }
        .sae-sub > summary { display: flex; align-items: center; gap: var(--ltek-sp-2); padding: var(--ltek-sp-3) var(--ltek-sp-2); cursor: pointer;
          list-style: none; color: var(--ltek-c-accent); font-size: var(--ltek-fs-label); font-weight: var(--ltek-fw-semibold);
          text-transform: uppercase; letter-spacing: 0.04em; }
        .sae-sub-body { padding: 0 var(--ltek-sp-4) var(--ltek-sp-4); }
        .sae-row { display: flex; align-items: center; gap: var(--ltek-sp-4); padding: var(--ltek-sp-1) 0; flex-wrap: wrap; justify-content: flex-start; }
        .sae-row label.lbl { color: var(--ltek-c-label); font-size: var(--ltek-fs-body); font-weight: var(--ltek-fw-normal); flex: none; }
        .sae-row input[type="text"], .sae-row select { flex: 1 1 auto; min-width: 0; padding: var(--ltek-ctrl-pad);
          background: var(--secondary-background-color, #2a2a2a); border: 1px solid var(--ltek-c-border); border-radius: var(--ltek-r-ctrl);
          color: var(--ltek-c-text); font-size: var(--ltek-fs-body); }
        .sae-row input[type="range"] { flex: 1 1 auto; min-width: 100px; accent-color: var(--ltek-c-accent); cursor: pointer; }
        .sae-val { flex: 0 0 var(--ltek-slider-val-w); text-align: right; font-weight: var(--ltek-fw-bold); font-variant-numeric: tabular-nums;
          white-space: nowrap; color: var(--ltek-c-text); font-size: var(--ltek-fs-body); }
        .sae-nowrap { flex-wrap: nowrap; }
        .sae-check { display: flex; align-items: center; gap: var(--ltek-sp-2); padding: var(--ltek-sp-1) 0; color: var(--ltek-c-label);
          font-size: var(--ltek-fs-body); cursor: pointer; }
        .sae-check input { accent-color: var(--ltek-c-accent); }
        .sae-checks { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 0 var(--ltek-sp-4); }
        .sae-color { display: flex; flex: 1 1 auto; gap: var(--ltek-sp-2); flex-wrap: wrap; min-width: 0; }
        .sae-color select.sae-cmode { flex: 0 0 auto; min-width: 120px; }
        .sae-color input[type="color"] { flex: 0 0 auto; width: 44px; height: 30px; padding: 0; border: none; background: none; cursor: pointer; }
        .sae-reset { border: none; background: none; padding: 0; color: var(--ltek-c-icon); cursor: pointer; }
        .sae-reset:hover { color: var(--ltek-c-icon-hover); }
        .sae-reset ha-icon { --mdc-icon-size: var(--ltek-icon-sm); }
        .sae-foot { color: var(--ltek-c-muted); font-size: var(--ltek-fs-tiny); text-align: right; }
`;

class StormAudioCardEditor extends HTMLElement {
  constructor() {
    super();
    this._config = {};
    this._open = new Set(['device']);
    this._rendered = false;
    this._cmode = {};
  }

  setConfig(config) {
    const next = normalizeConfig(config);
    const changed = JSON.stringify(next) !== JSON.stringify(this._config);
    this._config = next;
    if (this._hass && (!this._rendered || changed)) this._render();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first || !this._rendered) this._render();
  }

  _emit() {
    this._config = normalizeConfig(this._config);
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: this._config }, bubbles: true, composed: true }));
  }

  _set(key, value, scope = '') {
    if (!scope) {
      if (value === '' || value === undefined || value === null || value === DEFAULTS[key]) delete this._config[key];
      else this._config[key] = value;
    } else {
      const obj = { ...(this._config[scope] || {}) };
      if (value === '' || value === undefined || value === null) delete obj[key];
      else obj[key] = value;
      if (Object.keys(obj).length) this._config[scope] = obj; else delete this._config[scope];
    }
    this._emit();
  }

  _get(key, scope = '') {
    return scope ? (this._config[scope] || {})[key] : this._config[key];
  }

  _panel(id, icon, title, body) {
    return `<details class="sae-sec" data-panel="${id}"${this._open.has(id) ? ' open' : ''}>
      <summary><ha-icon icon="${icon}"></ha-icon>${title}<ha-icon class="chev" icon="mdi:chevron-down"></ha-icon></summary>
      <div class="sae-body">${body}</div></details>`;
  }

  _sub(id, title, body) {
    return `<details class="sae-sub" data-panel="${id}"${this._open.has(id) ? ' open' : ''}>
      <summary>${title}<ha-icon class="chev" icon="mdi:chevron-down"></ha-icon></summary>
      <div class="sae-sub-body">${body}</div></details>`;
  }

  _colorControl(key, label, defaultLabel, seedHex, scope = '') {
    const cur = this._get(key, scope) || '';
    const id = `${scope}:${key}`;
    const canClear = scope === 'styles' && TRANSPARENT_KEYS.has(key);
    const mode = this._cmode[id] || (cur ? colorMode(cur, canClear) : 'default');
    const data = `data-ckey="${key}" data-scope="${scope}"`;
    let field = '';
    if (mode === 'theme') {
      field = `<select class="sae-ctheme" ${data}>${THEME_COLORS.map(([v, n]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${n}</option>`).join('')}</select>`;
    } else if (mode === 'custom') {
      const hex = /^#[0-9a-fA-F]{6}$/.test(cur) ? cur : seedHex;
      field = `<input type="color" class="sae-chex" ${data} value="${hex}">`;
    } else if (mode === 'css') {
      field = `<input type="text" class="sae-ccss" ${data} value="${esc(cur)}" placeholder="e.g. tomato, rgba(…), var(--my-color)">`;
    }
    const modes = [['default', defaultLabel], ...(canClear ? [['transparent', 'Transparent']] : []),
      ['theme', 'Theme color'], ['custom', 'Custom color'], ['css', 'Custom CSS']];
    return `<div class="sae-row"><label class="lbl">${label}</label><div class="sae-color">
      <select class="sae-cmode" ${data} data-seed="${seedHex}">${modes.map(([m, n]) => `<option value="${m}"${m === mode ? ' selected' : ''}>${n}</option>`).join('')}</select>
      ${field}</div></div>`;
  }

  _slider(key, label, value, min, max, step, scope = '', fmt = (n) => `${n}px`) {
    const isSet = this._get(key, scope) !== undefined;
    return `<div class="sae-row sae-nowrap"><label class="lbl">${label}</label>
      <input type="range" data-skey="${key}" data-scope="${scope}" min="${min}" max="${max}" step="${step}" value="${value}">
      <span class="sae-val" data-val="${scope}:${key}">${fmt(value)}</span>
      ${isSet && scope ? `<button class="sae-reset" data-reset="${key}" data-scope="${scope}" title="Back to default"><ha-icon icon="mdi:restore"></ha-icon></button>` : ''}</div>`;
  }

  _buttonsBody() {
    const c = this._config;
    const E = resolveEntities(this._hass, cfg(c, 'device'));
    const group = (title, key) => {
      const def = HIDE_LISTS[key];
      const s = E[def.entity] && this._hass.states[E[def.entity]];
      const opts = (s && s.attributes && s.attributes.options) || [];
      const items = strList([...opts, ...(c[key] || [])]);
      const hidden = new Set(c[key] || []);
      const body = items.length
        ? `<div class="sae-checks">${items.map((o) => `<label class="sae-check"><input type="checkbox" data-hide="${key}" data-hval="${esc(o)}"${hidden.has(o) ? '' : ' checked'}>${esc(pretty(def.labels, o))}</label>`).join('')}</div>`
        : '<p class="sae-hint">Not available — the entity is missing or the processor is off.</p>';
      return this._sub(`btn-${key}`, title, body);
    };
    return `<p class="sae-hint">Untick a chip to hide it from the card. Sources and presets come from the processor.</p>
      ${group('Sources', 'hide_sources')}
      ${group('Presets', 'hide_presets')}
      ${group('Dolby mode', 'hide_dolby')}
      ${group('SphereAudio effect', 'hide_sphere')}`;
  }

  _render() {
    if (!this._hass) return;
    const c = this._config;
    const devices = listDevices(this._hass);
    const dev = cfg(c, 'device');
    const st = c.styles || {};
    const openSecs = c.open_sections || [];
    const deviceBody = `
      <p class="sae-hint">Which processor to show. Entities are found automatically, so renamed entity IDs keep working.</p>
      <div class="sae-row"><label class="lbl">Device</label>
        <select data-key="device">
          <option value="">${devices.length ? 'Auto (first StormAudio found)' : 'No StormAudio processor found'}</option>
          ${devices.map((d) => `<option value="${esc(d.id)}"${d.id === dev ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}
          ${dev && !devices.some((d) => d.id === dev) ? `<option value="${esc(dev)}" selected>${esc(dev)} (not found)</option>` : ''}
        </select></div>`;
    const sbMode = cfg(c, 'standby_text');
    const cardBody = `
      <p class="sae-hint">Header title, the power button, what the card does in standby, and collapsing.</p>
      <div class="sae-row"><label class="lbl">Title</label><input type="text" data-key="title" value="${esc(cfg(c, 'title'))}"></div>
      <label class="sae-check"><input type="checkbox" data-key="strip_prefix"${cfg(c, 'strip_prefix') ? ' checked' : ''}>
        Strip the device name from zone/trigger labels (e.g. "ISP Zone 2" → "Zone 2")</label>
      <div class="sae-group">Standby</div>
      <label class="sae-check"><input type="checkbox" data-key="show_when_off"${cfg(c, 'show_when_off') ? ' checked' : ''}>
        Show the card (header only) while in standby (otherwise hide it)</label>
      ${cfg(c, 'show_when_off') ? `
      <div class="sae-row"><label class="lbl">Standby message</label>
        <select data-key="standby_text">${STANDBY_TEXT.map(([v, n]) => `<option value="${v}"${v === sbMode ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
      ${sbMode !== 'hidden' ? `
      <div class="sae-row"><label class="lbl">Message text</label><input type="text" data-key="standby_message" value="${esc(cfg(c, 'standby_message'))}"
        placeholder="Standby · tap the icon to power on"></div>
      ${this._slider('standby_indent', 'Message indent', st.standby_indent !== undefined ? st.standby_indent : 46, 0, 160, 1, 'styles')}` : ''}
      <label class="sae-check"><input type="checkbox" data-key="standby_button"${cfg(c, 'standby_button') ? ' checked' : ''}>
        In standby, show a power button on the right instead of the word "Standby"</label>` : ''}
      <div class="sae-group">Link dot</div>
      <p class="sae-hint">Green when the integration reaches the processor, red when it can't.</p>
      <div class="sae-row"><label class="sae-check"><input type="checkbox" data-key="show_dot"${cfg(c, 'show_dot') ? ' checked' : ''}>Show</label>
        ${cfg(c, 'show_dot') ? `<select data-key="dot_position">${DOT_POSITIONS.map(([v, n]) => `<option value="${v}"${v === cfg(c, 'dot_position') ? ' selected' : ''}>${n}</option>`).join('')}</select>` : ''}</div>
      <div class="sae-group">Volume</div>
      ${this._slider('volume_step', 'Volume − / + step', cfg(c, 'volume_step'), 1, 20, 1, '', (n) => `${n}`)}
      <div class="sae-group">Collapse</div>
      <label class="sae-check"><input type="checkbox" data-key="collapsible"${cfg(c, 'collapsible') ? ' checked' : ''}>
        Tap the header to collapse the card to just the header (while on)</label>
      ${cfg(c, 'collapsible') ? `<label class="sae-check"><input type="checkbox" data-key="start_collapsed"${cfg(c, 'start_collapsed') ? ' checked' : ''}>
        Start collapsed</label>` : ''}
      <div class="sae-group">Sections</div>
      <p class="sae-hint">Status sits on top; every control is in a collapsed section. Sections with no (enabled) entities hide themselves.</p>
      ${SECTIONS.map(([k, n]) => `<label class="sae-check"><input type="checkbox" data-key="${k}"${cfg(c, k) ? ' checked' : ''}>${n}</label>`).join('')}
      <div class="sae-group">Start open</div>
      <div class="sae-checks">${FOLDS.map(([id, n]) => `<label class="sae-check"><input type="checkbox" data-open="${id}"${openSecs.includes(id) ? ' checked' : ''}>${n}</label>`).join('')}</div>`;
    const iconBody = `
      <p class="sae-hint">Any Material Design icon — type just the name (e.g. <b>waveform</b>); "mdi:" is added for you. Leave empty for the default.</p>
      ${Object.keys(ICON_DEFAULTS).map((k) => `
        <div class="sae-row"><label class="lbl">${ICON_LABELS[k]}</label>
          <ha-icon icon="${esc(iconFor(c, k))}"></ha-icon>
          <input type="text" data-icon="${k}" value="${esc(((c.icons || {})[k] || '').replace(/^mdi:/, ''))}" placeholder="${ICON_DEFAULTS[k].replace(/^mdi:/, '')}"></div>`).join('')}`;
    const looks = STYLE_GROUPS.map(([g, title, hint]) => this._sub(`look-${g}`, title, `
      <p class="sae-hint">${hint}</p>
      ${STYLE_DEFS.filter((d) => d[1] === g).map(([key, , kind, label, def, min, max]) => (kind === 'size'
        ? this._slider(key, label, st[key] !== undefined ? st[key] : def, min, max, 1, 'styles')
        : this._colorControl(key, label, def, '#2196f3', 'styles'))).join('')}`)).join('')
      + this._sub('look-context', 'Context colors', `
      <p class="sae-hint">The accent tints the card when on; the header icon turns the "starting / stopping" color while the processor changes power state.</p>
      ${CONTEXT_COLORS.map(([k, l, d, seed]) => this._colorControl(k, l, d, seed)).join('')}`);
    this.innerHTML = `<style>${EDITOR_CSS}</style>
      <div class="sae">
        ${this._panel('device', 'mdi:audio-video', 'Device', deviceBody)}
        ${this._panel('card', 'mdi:card-text-outline', 'Card & sections', cardBody)}
        ${this._panel('buttons', 'mdi:gesture-tap-button', 'Chips', this._buttonsBody())}
        ${this._panel('icons', 'mdi:emoticon-outline', 'Icons', iconBody)}
        ${this._panel('look', 'mdi:palette', 'Appearance', `<p class="sae-hint">Sizes and colors. Every color can follow your theme or be custom; "Back to default" (↺) resets a size.</p>${looks}`)}
        <div class="sae-foot">StormAudio Card ${BUILD_NUMBER}</div>
      </div>`;
    this._rendered = true;
    this._wire();
  }

  _wire() {
    this.querySelectorAll('details.sae-sec, details.sae-sub').forEach((d) => d.addEventListener('toggle', () => {
      if (d.open) this._open.add(d.dataset.panel); else this._open.delete(d.dataset.panel);
    }));
    this.querySelectorAll('[data-key]').forEach((el) => {
      const key = el.dataset.key;
      const reveals = ['show_when_off', 'collapsible', 'show_dot', 'standby_text'].includes(key);
      if (el.type === 'checkbox') el.addEventListener('change', () => { this._set(key, el.checked); if (reveals) this._render(); });
      else el.addEventListener('change', () => { this._set(key, el.value.trim()); if (reveals) this._render(); });
    });
    this.querySelectorAll('[data-skey]').forEach((el) => {
      const key = el.dataset.skey;
      const scope = el.dataset.scope;
      const fmt = scope ? (n) => `${n}px` : (n) => `${n}`;
      el.addEventListener('input', () => {
        const out = this.querySelector(`[data-val="${scope}:${key}"]`);
        if (out) out.textContent = fmt(el.value);
      });
      el.addEventListener('change', () => {
        const n = Number(el.value);
        if (scope) {
          const def = STYLE_INDEX[key];
          this._set(key, def && n === def[4] ? '' : n, scope);
        } else this._set(key, n);
        this._render();
      });
    });
    this.querySelectorAll('[data-hide]').forEach((el) => el.addEventListener('change', () => {
      const key = el.dataset.hide;
      const val = el.dataset.hval;
      const list = (this._config[key] || []).filter((x) => x !== val);
      if (!el.checked) list.push(val);
      if (list.length) this._config[key] = list; else delete this._config[key];
      this._emit();
    }));
    this.querySelectorAll('[data-open]').forEach((el) => el.addEventListener('change', () => {
      const list = (this._config.open_sections || []).filter((s) => s !== el.dataset.open);
      if (el.checked) list.push(el.dataset.open);
      if (list.length) this._config.open_sections = list; else delete this._config.open_sections;
      this._emit();
    }));
    this.querySelectorAll('[data-reset]').forEach((b) => b.addEventListener('click', () => {
      this._set(b.dataset.reset, '', b.dataset.scope);
      this._render();
    }));
    this.querySelectorAll('[data-icon]').forEach((el) => el.addEventListener('change', () => {
      this._set(el.dataset.icon, normalizeIcon(el.value) === ICON_DEFAULTS[el.dataset.icon] ? '' : normalizeIcon(el.value), 'icons');
      this._render();
    }));
    this.querySelectorAll('.sae-cmode').forEach((sel) => sel.addEventListener('change', () => {
      const key = sel.dataset.ckey;
      const scope = sel.dataset.scope;
      const cur = this._get(key, scope) || '';
      const was = cur ? colorMode(cur) : 'default';
      let next = '';
      if (sel.value === 'transparent') next = 'transparent';
      else if (sel.value === 'theme') next = was === 'theme' ? cur : 'var(--primary-color)';
      else if (sel.value === 'custom') next = /^#[0-9a-fA-F]{6}$/.test(cur) ? cur : sel.dataset.seed;
      else if (sel.value === 'css') next = cur === 'transparent' ? '' : cur;
      this._cmode[`${scope}:${key}`] = sel.value;
      this._set(key, next, scope);
      this._render();
    }));
    const val = (sel, fn) => this.querySelectorAll(sel).forEach((el) => el.addEventListener(fn === 'input' ? 'input' : 'change',
      () => this._set(el.dataset.ckey, el.value.trim(), el.dataset.scope)));
    val('.sae-ctheme', 'change');
    val('.sae-chex', 'input');
    val('.sae-ccss', 'change');
  }
}

// Test hooks (pure helpers; no effect in the browser)
StormAudioCard._test = {
  BUILD_NUMBER, CARD_CSS, EDITOR_CSS, DEFAULTS, ENTITY_KEYS, ENTITY_ORDER, OPTIONAL_ENTITIES, STYLE_DEFS, ICON_DEFAULTS,
  normalizeConfig, normalizeIcon, rootStyleVars, rootClasses, resolveEntities, listDevices, pretty, fmtNum, stripPrefix, colorMode,
  DOLBY_MODE, LOUDNESS, FP_COLOR, HIDE_LISTS, FOLDS, nice, SURROUND_MODE, AURO_PRESET, SPHERE_EFFECT, FORMAT_TERMS,
};

if (!customElements.get(CARD_TAG)) customElements.define(CARD_TAG, StormAudioCard);
if (!customElements.get(EDITOR_TAG)) customElements.define(EDITOR_TAG, StormAudioCardEditor);

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === CARD_TAG)) {
  window.customCards.push({
    type: CARD_TAG,
    name: 'StormAudio Card',
    description: 'StormAudio / Focal / Bryston processor: power, source, audio format and video status, and collapsible listening, audio, video, zones, triggers, front-panel and info sections.',
    preview: false,
    documentationURL: 'https://github.com/Ltek/stormaudio-card',
  });
}

console.info(`%c STORMAUDIO-CARD %c ${BUILD_NUMBER} `, 'color:#fff;background:#2196F3;font-weight:700', 'color:#2196F3;background:transparent');
