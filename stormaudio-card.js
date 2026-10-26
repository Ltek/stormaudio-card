// StormAudio Card — Home Assistant Dashboard card for StormAudio / Focal / Bryston processors
// Version: v2026.10.26.18
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

const BUILD_NUMBER = 'v2026.10.26.18';
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

// Entity-ID name parts that differ from the unique_id suffix (the integration names entities
// "<device> <Name>", so HA's default entity_id is <domain>.<device_slug>_<name_slug>).
const NAME_SLUGS = {
  _active_speaker: '_active_speaker_config',
  _source_zone2: '_source_zone_2',
  _frontpanel_standby_brightness: '_front_panel_standby_brightness',
  _frontpanel_active_brightness: '_front_panel_active_brightness',
  _frontpanel_standby_delay: '_front_panel_standby_delay',
  _frontpanel_color: '_front_panel_color',
  _video_colorspace: '_video_color_space',
  _video_colordepth: '_video_color_depth',
};

// HA's frontend entity list (hass.entities) has no unique_id, so the card reads it once from the
// entity registry (config/entity_registry/list) and keeps entity_id → unique_id here.
const REGISTRY = { conn: null, key: '', uid: new Map(), pending: null };

/** Fetch unique_ids for this integration's entities (once per connection / entity set). */
function loadUniqueIds(hass, onDone) {
  if (!hass || typeof hass.callWS !== 'function') return;
  const ids = Object.values(hass.entities || {}).filter((e) => e.platform === PLATFORM).map((e) => e.entity_id).sort();
  const key = ids.join(',');
  if (REGISTRY.conn === hass.connection && REGISTRY.key === key) return;
  if (REGISTRY.pending) return;
  REGISTRY.pending = Promise.resolve(hass.callWS({ type: 'config/entity_registry/list' }))
    .then((list) => {
      REGISTRY.uid = new Map((list || []).filter((e) => e.platform === PLATFORM && e.unique_id).map((e) => [e.entity_id, e.unique_id]));
    })
    .catch(() => { /* not allowed or unavailable: entity_id matching still works */ })
    .finally(() => {
      REGISTRY.conn = hass.connection; REGISTRY.key = key; REGISTRY.pending = null;
      if (onDone) onDone();
    });
}

/** This integration's entities from hass.entities, with unique_id filled in when known. */
function platformEntities(hass) {
  return Object.values((hass && hass.entities) || {}).filter((e) => e.platform === PLATFORM)
    .map((e) => (e.unique_id || !REGISTRY.uid.has(e.entity_id) ? e : { ...e, unique_id: REGISTRY.uid.get(e.entity_id) }));
}

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
  const all = platformEntities(hass);
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
    if (!hit && player) {
      // No unique_id (registry not loaded yet, or not readable): HA's default entity_id,
      // <domain>.<media_player object id><name slug>.
      const guess = `${domain}.${player.entity_id.slice('media_player.'.length)}${NAME_SLUGS[suffix] || suffix}`;
      if (mine.some((e) => e.entity_id === guess)) hit = guess;
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

/** Total channels in an `X.Y` / `X.Y.Z` layout ('7.1.4' → 12, '5.1' → 6); null if not that shape. */
function channelCount(fmt) {
  if (!okState(fmt)) return null;
  const m = String(fmt).trim().match(/^(\d+)\.(\d+)(?:\.(\d+))?$/);
  if (!m) return null;
  return Number(m[1]) + Number(m[2]) + (m[3] ? Number(m[3]) : 0);
}

/** Channel layout with its channel count appended when it is an X.Y[.Z] layout ('7.1.4 · 12 ch'). */
function fmtChannels(fmt) {
  const base = nice(fmt);
  const n = channelCount(fmt);
  return n ? `${base} · ${n} ch` : base;
}

// Object-based formats render to every speaker in the layout, even when decoded natively.
const OBJECT_FORMATS = /atmos|dts:x|dtsx|auro-3d|auro3d|mpeg-h|mpegh|imax/i;

/** What the audio flow shows, from the raw sensor values:
 *  { src, srcCh, proc, procSub, procWarn, procTitle, out, outCh }.
 *  `proc` is the label on the arrow between Input and Output: StormXT, the upmixer, Downmix, or
 *  '' for a plain native decode. With procWarn the chosen upmixer is not engaged on this content. */
function audioFlow({ stream, channels, modeRaw, engaged, stormxt, outputLayout = '' }) {
  const src = nice(stream);
  const srcCh = fmtChannels(channels);
  const mode = nice(modeRaw, SURROUND_MODE);
  const known = okState(modeRaw);
  const notEngaged = known && engaged === false && !/^native$/i.test(mode);
  const isDownmix = !notEngaged && /downmix/i.test(mode);
  const upmixing = known && !notEngaged && !isDownmix && !/^native$/i.test(mode);
  const xt = stormxt === 'on';
  const layout = fmtChannels(outputLayout);
  const proc = xt ? 'StormXT' : notEngaged ? mode : upmixing ? mode : isDownmix ? 'Downmix' : '';
  // Under StormXT: the upmixer it runs with (or that isn't engaged).
  const procSub = xt ? (upmixing || notEngaged ? mode : isDownmix ? 'Downmix' : '') : '';
  const procWarn = notEngaged;
  const procTitle = notEngaged ? `${mode} is selected but not engaged with this source` : [proc, procSub].filter(Boolean).join(' + ');
  // Output: the format it renders (the upmixer's, Stereo for a downmix, else the source's) on how many channels.
  const out = upmixing ? mode : isDownmix ? 'Stereo' : src;
  const fillsAll = upmixing || xt || OBJECT_FORMATS.test(String(stream || ''));
  const outCh = isDownmix ? fmtChannels('2.0')
    : fillsAll ? (layout || 'All speakers')
      : srcCh;
  return { src, srcCh, proc, procSub, procWarn, procTitle, out, outCh };
}

/** Resolution + refresh as video people write it: '3840x2160' + '60Hz' → '2160p60'. Else as sent. */
function fmtVideoMode(res, rate) {
  if (!okState(res)) return '';
  const m = String(res).trim().match(/^(\d+)\s*[x×]\s*(\d+)([ip])?$/i);
  const hz = okState(rate) ? String(rate).replace(/\s*hz$/i, '').trim() : '';
  if (!m) return [String(res), okState(rate) ? String(rate) : ''].filter(Boolean).join(' · ');
  return `${m[2]}${(m[3] || 'p').toLowerCase()}${/^[\d.]+$/.test(hz) ? hz : ''}`;
}

// ---------------------------------------------------------------------------
// Config — byte-stable: only non-default keys are emitted
// ---------------------------------------------------------------------------
const DEFAULTS = {
  device: '',
  title: 'StormAudio',
  when_off: 'collapse',
  standby_text: 'below',
  standby_message: '',
  standby_button: false,
  show_dot: true,
  dot_position: 'title',
  collapsible: false,
  start_collapsed: false,
  show_status: true,
  show_audio_flow: true,
  show_video_flow: true,
  show_listening: true,
  show_volume: true,
  volume_collapsible: false,
  show_speaker_layout: true,
  output_layout: '', // your speaker layout, e.g. '7.3.6' (the processor exposes only a config ID)
  show_audio: true,
  show_decoding: true,
  show_video: true,
  show_zones: true,
  show_triggers: true,
  show_frontpanel: true,
  show_info: true,
  volume_step: 1,
  strip_prefix: true, // drop the device name prefix from entity-derived labels
  shrink_when_narrow: true, // scale the card down step by step below 420 px wide
  stack_when_narrow: 'auto', // status boxes on a narrow card: auto (stack under 260 px) | always | never
  accent_color: '',
  warming_color: '',
};
// Entities shown in the Audio section (it shows when any of them exists).
const AUDIO_KEYS = ['loudness', 'bass', 'treble', 'center_enhance', 'surround_enhance', 'lfe_enhance', 'brightness',
  'dialog_control', 'lipsync', 'auro_strength', 'lfe_dim'];
// Collapsible sections, in card order: [id, label]
const FOLDS = [
  ['volume', 'Volume'], ['listening', 'Listening'], ['audio', 'Audio'], ['decoding', 'Decoding & effects'], ['video', 'Video'],
  ['zones', 'Zones'], ['triggers', 'Triggers'], ['frontpanel', 'Front panel'], ['info', 'Info'],
];
// Each reorderable fold's show_* key (toggles the whole section on / off).
const SECTION_IDS = ['status', ...FOLDS.map(([id]) => id)];
const FOLD_SHOW = {
  volume: 'show_volume', listening: 'show_listening', audio: 'show_audio', decoding: 'show_decoding',
  video: 'show_video', zones: 'show_zones', triggers: 'show_triggers', frontpanel: 'show_frontpanel', info: 'show_info',
};

// Icons: header (also the power button) and each collapsible section.
const ICON_DEFAULTS = {
  header: 'mdi:waveform',
  volume: 'mdi:volume-high',
  listening: 'mdi:surround-sound',
  audio: 'mdi:tune',
  decoding: 'mdi:dolby',
  video: 'mdi:television',
  zones: 'mdi:speaker-multiple',
  triggers: 'mdi:flash',
  frontpanel: 'mdi:dock-window',
  info: 'mdi:information-outline',
};
const ICON_LABELS = {
  header: 'Header (power button)', volume: 'Volume', listening: 'Listening', audio: 'Audio', decoding: 'Decoding & effects', video: 'Video',
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
  ['subtitles', 'Subtitles', 'Box headings (INPUT / OUTPUT / VIDEO) and row labels.'],
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

// ---------------------------------------------------------------------------
// Section editing (editor: pencil on a section row): rename, hide single settings, merge.
// ---------------------------------------------------------------------------
// Per-section settings the user can hide: [id, label, selector, existing show key?]. A setting with
// a show key is the card's own option (its eye toggles that key); the rest use hidden_items.
const SECTION_ITEMS = {
  status: [['aflow', 'Audio flow (whole row)', '[data-k="aflow"]', 'show_audio_flow'],
    ['ain', 'Input box', '[data-item="box-ain"]'], ['aproc', 'Processing label on the arrow', '[data-item="aproc"]'],
    ['aout', 'Output box', '[data-item="box-aout"]'], ['layout', 'Output channel layout', '', 'show_speaker_layout'],
    ['vflow', 'Video box', '[data-k="vflow"]', 'show_video_flow'],
    ['vdet', 'Video details line (color, copy protection)', '[data-k="vid_1"]'], ['tags', 'Status tags', '[data-k="tags"]']],
  volume: [['slider', 'Volume slider and − / +', '.sa-vollarge'], ['mute', 'Mute', '[data-toggle="mute"]'], ['dim', 'Dim', '[data-toggle="dim"]']],
  listening: [['source', 'Source', '[data-row="source"]'], ['preset', 'Preset', '[data-row="preset"]'], ['surround', 'Surround mode', '[data-row="surround"]']],
  audio: [['loudness', 'Loudness', '[data-row="loudness"]'], ['bass', 'Bass', '[data-slider="bass"]'], ['treble', 'Treble', '[data-slider="treble"]'],
    ['center_enhance', 'Center enhance', '[data-slider="center_enhance"]'], ['surround_enhance', 'Surround enhance', '[data-slider="surround_enhance"]'],
    ['lfe_enhance', 'LFE enhance', '[data-slider="lfe_enhance"]'], ['brightness', 'Brightness', '[data-slider="brightness"]'],
    ['dialog_control', 'Dialog', '[data-slider="dialog_control"]'], ['lipsync', 'LipSync', '[data-slider="lipsync"]'],
    ['auro_strength', 'Auro strength', '[data-slider="auro_strength"]'], ['lfe_dim', 'LFE Dim', '[data-toggle="lfe_dim"]']],
  decoding: [['dolby_mode', 'Dolby mode', '[data-row="dolby_mode"]'], ['sphereaudio', 'SphereAudio', '[data-row="sphereaudio"]'],
    ['auro_preset', 'Auro preset', '[data-row="auro_preset"]'], ['drc', 'DRC', '[data-row="drc"]'], ['imax_mode', 'IMAX', '[data-row="imax_mode"]'],
    ['dolby_virtualizer', 'Dolby Virtualizer', '[data-toggle="dolby_virtualizer"]'], ['dialog_norm', 'Dialog Norm', '[data-toggle="dialog_norm"]'],
    ['center_spread', 'Center Spread', '[data-toggle="center_spread"]']],
  video: [['details', 'Video details', '[data-k="video_info"]'], ['note', 'Note', '[data-k="video_note"]']],
  zones: [],
  triggers: [],
  frontpanel: [['fp_color', 'Color', '[data-row="fp_color"]'], ['fp_standby_delay', 'Standby delay', '[data-row="fp_standby_delay"]'],
    ['fp_active_bright', 'Active brightness', '[data-slider="fp_active_bright"]'], ['fp_standby_bright', 'Standby brightness', '[data-slider="fp_standby_bright"]']],
  info: [['details', 'Details list', '[data-k="info"]'], ['link', 'Connection note', '[data-k="link"]'], ['missing', 'Disabled-entities note', '[data-k="missing"]']],
};
// Sections other sections can be merged into, and sections that can't be merged anywhere.
const MERGE_TARGETS = ['status', 'volume', 'listening', 'audio', 'decoding', 'video', 'zones', 'triggers', 'frontpanel', 'info'];
// Areas that are always visible (not a collapsed section): merged controls there can be hit by accident.
const ALWAYS_SHOWN = ['status', 'volume'];
const NOT_MERGEABLE = [];

function defaultSectionName(id) { return id === 'status' ? 'Status' : (Object.fromEntries(FOLDS)[id] || id); }

/** A section's name: the user's, else the default. */
function secLabel(config, id) {
  const n = config.section_names && config.section_names[id];
  return n || defaultSectionName(id);
}

function sectionShown(config, id) { return !!(cfg(config, id === 'status' ? 'show_status' : FOLD_SHOW[id])); }

/** The section a section is merged into, or '' when it shows as itself (none set, invalid, chained, or either one hidden). */
function mergeTarget(config, id) {
  const m = config.section_merge || {};
  const t = m[id];
  if (!t || t === id || !MERGE_TARGETS.includes(t) || NOT_MERGEABLE.includes(id) || m[t]) return '';
  if (Object.keys(m).some((k) => m[k] === id)) return '';
  if (!sectionShown(config, id) || !sectionShown(config, t)) return '';
  return t;
}

function normalizeSectionEdits(c, out) {
  const known = (id) => SECTION_ITEMS[id] !== undefined;
  if (c.section_names && typeof c.section_names === 'object') {
    const n = {};
    Object.keys(c.section_names).forEach((id) => {
      const v = String(c.section_names[id] == null ? '' : c.section_names[id]).trim();
      if (known(id) && v && v !== defaultSectionName(id)) n[id] = v;
    });
    if (Object.keys(n).length) out.section_names = n;
  }
  // Older builds had three video boxes: Color → the details line; all three hidden → no video box.
  let items = Array.isArray(c.hidden_items) ? c.hidden_items.map((x) => String(x).trim()) : [];
  const oldVideo = ['status.vin', 'status.vsig', 'status.vcol'];
  if (oldVideo.every((x) => items.includes(x))) {
    if (c.show_video_flow === undefined) out.show_video_flow = false;
    items = items.filter((x) => !oldVideo.includes(x));
  }
  items = items.map((x) => (x === 'status.vcol' ? 'status.vdet' : x));
  const ok = new Set(Object.entries(SECTION_ITEMS).flatMap(([sec, items]) => items.filter((i) => !i[3]).map((i) => `${sec}.${i[0]}`)));
  const hidden = [];
  items.forEach((v) => { if (ok.has(v) && !hidden.includes(v)) hidden.push(v); });
  if (hidden.length) out.hidden_items = hidden;
  if (c.section_merge && typeof c.section_merge === 'object') {
    const m = {};
    Object.keys(c.section_merge).forEach((id) => {
      const t = String(c.section_merge[id] == null ? '' : c.section_merge[id]).trim();
      if (known(id) && !NOT_MERGEABLE.includes(id) && MERGE_TARGETS.includes(t) && t !== id) m[id] = t;
    });
    if (Object.keys(m).length) out.section_merge = m;
  }
}

// What the card does while the device is in standby / off.
const WHEN_OFF = [['hide', 'Hide the entire card'], ['collapse', 'Collapse to the header'], ['expanded', 'Keep expanded']];
// Ancestors that mean "the Dashboard is being edited / this is the editor preview".
const EDITOR_WRAPPERS = ['hui-card-preview', 'hui-dialog-edit-card', 'hui-card-edit-mode', 'hui-card-options', 'hui-section-edit-mode'];
const STACK_MODES = [['auto', 'Only on a very narrow card'], ['always', 'Always'], ['never', 'Never (always side by side)']];
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
  let c = raw && typeof raw === 'object' ? raw : {};
  // Legacy `show_when_off: false` (hide the card in standby) → `when_off: hide`.
  if (c.when_off === undefined && (c.show_when_off === false || c.show_when_off === 'false')) c = { ...c, when_off: 'hide' };
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
  // Section order: a full list of every section (status included); only emitted when it differs from the default.
  if (strList(c.section_order).length) {
    const full = orderedSections(c);
    if (JSON.stringify(full) !== JSON.stringify(SECTION_IDS)) out.section_order = full;
  }
  const known = ['type', 'icons', 'styles', 'open_sections', 'section_order', 'section_names', 'hidden_items', 'section_merge'];
  if (out.when_off !== undefined && !WHEN_OFF.some(([v]) => v === out.when_off)) delete out.when_off;
  if (out.stack_when_narrow !== undefined && !STACK_MODES.some(([v]) => v === out.stack_when_narrow)) delete out.stack_when_narrow;
  normalizeSectionEdits(c, out);
  Object.keys(c).forEach((k) => {
    if (k === 'show_when_off') return; // replaced by when_off
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

/** Every section id (status + the folds) in the configured order, defaults filling any gaps.
 *  A saved order without 'status' (made before status could move) keeps status on top. */
function orderedSections(config) {
  const want = strList(config.section_order).filter((id) => SECTION_IDS.includes(id));
  if (want.length && !want.includes('status')) want.unshift('status');
  return [...want, ...SECTION_IDS.filter((id) => !want.includes(id))];
}

/** The collapsible / body sections ([id, label]) in the configured order (status left out). */
function orderedFolds(config) {
  const byId = Object.fromEntries(FOLDS);
  return orderedSections(config).filter((id) => id !== 'status').map((id) => [id, byId[id]]);
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
  const cls = ['sa', `stack-${cfg(config, 'stack_when_narrow')}`];
  if (cfg(config, 'shrink_when_narrow')) cls.push('shrink');
  if (st.card_border_color) cls.push('has-border');
  if (st.card_background === 'transparent') cls.push('is-flat');
  return cls.join(' ');
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------
function okState(v) { return v !== undefined && v !== null && v !== '' && v !== 'unknown' && v !== 'unavailable'; }

/** Make `from`'s children match `to`'s (a parsed template) while keeping every element that is
 *  still the same tag in place. The card is patched instead of rebuilt on each config change, so
 *  the editor preview doesn't flash: icons, open sections and listeners stay. */
function morphChildren(from, to) {
  const a = [...from.childNodes];
  const b = [...to.childNodes];
  b.forEach((nb, i) => {
    const na = a[i];
    if (!na) { from.appendChild(nb); return; }
    if (na.nodeType !== nb.nodeType || na.nodeName !== nb.nodeName) { from.replaceChild(nb, na); return; }
    if (na.nodeType === 3 || na.nodeType === 8) { if (na.nodeValue !== nb.nodeValue) na.nodeValue = nb.nodeValue; return; }
    if (na.nodeType !== 1) return;
    [...na.attributes].forEach((at) => { if (!nb.hasAttribute(at.name)) na.removeAttribute(at.name); });
    [...nb.attributes].forEach((at) => { if (na.getAttribute(at.name) !== at.value) na.setAttribute(at.name, at.value); });
    if (na.localName === 'details') na.open = nb.hasAttribute('open');
    morphChildren(na, nb.localName === 'template' ? nb.content : nb);
  });
  a.slice(b.length).forEach((n) => n.remove());
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Strip the device-name prefix the integration bakes into friendly names ("ISP Source" → "Source"). */
function stripPrefix(name, deviceName) {
  if (!name) return name;
  if (deviceName && name.startsWith(deviceName + ' ')) return name.slice(deviceName.length + 1);
  return name;
}

const DRAG_HOLD_MS = 1500; // a slider input holds off state updates this long (renewed while dragging)
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
.sa button { font-family: inherit; font-weight: inherit; }
.sa-head { display: flex; align-items: center; gap: 10px; min-height: calc(36px * var(--sa-k, 1)); }
.sa-power { flex: 0 0 auto; width: calc(calc(var(--sa-header-icon-size, 22px) * var(--sa-k, 1)) + 14px); height: calc(calc(var(--sa-header-icon-size, 22px) * var(--sa-k, 1)) + 14px);
  border-radius: 50%; border: none; cursor: pointer; background: transparent; color: var(--disabled-text-color, #777);
  display: flex; align-items: center; justify-content: center; transition: background .2s, color .2s;
  --mdc-icon-size: calc(var(--sa-header-icon-size, 22px) * var(--sa-k, 1)); --sa-pwr: var(--sa-header-icon-color, var(--sa-ctx)); }
.sa.is-warming .sa-power { --sa-pwr: var(--sa-warm, #ff9800); }
.sa.is-on .sa-power, .sa.is-warming .sa-power {
  color: var(--sa-pwr); background: color-mix(in srgb, var(--sa-pwr) 16%, transparent); }
.sa.is-warming .sa-power ha-icon { animation: sa-pulse 1.6s ease-in-out infinite; }
@keyframes sa-pulse { 50% { opacity: .4; } }
.sa-title { flex: 0 1 auto; display: flex; align-items: center; gap: 8px; min-width: 0; font-size: calc(var(--sa-title-size, 16px) * var(--sa-k, 1)); font-weight: 500; white-space: nowrap;
  color: var(--sa-title-color, var(--primary-text-color)); }
.sa-dot { flex: 0 0 auto; width: calc(8px * var(--sa-k, 1)); height: calc(8px * var(--sa-k, 1)); border-radius: 50%; background: var(--disabled-text-color, #777); }
.sa-dot.at-right { margin-left: 2px; }
.sa-dot.at-icon { width: calc(calc(var(--sa-header-icon-size, 22px) * var(--sa-k, 1)) * .6); height: calc(calc(var(--sa-header-icon-size, 22px) * var(--sa-k, 1)) * .6); }
.sa-dot.ok { background: var(--success-color, #4caf50); }
.sa-dot.bad { background: var(--error-color, #f44336); }
.sa-title > span:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.sa-summary { flex: 1 1 0; text-align: right; margin-left: auto; min-width: 0; font-size: calc(var(--sa-summary-size, 13px) * var(--sa-k, 1)); color: var(--sa-summary-color, var(--secondary-text-color));
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sa.is-down .sa-summary { color: var(--error-color, #f44336); }
.sa.is-warming .sa-summary { color: var(--sa-warm, #ff9800); }
.sa-head.is-tap { cursor: pointer; }
.sa-hchev { color: var(--secondary-text-color); --mdc-icon-size: calc(20px * var(--sa-k, 1)); transition: transform .2s; flex: 0 0 auto; }
.sa.is-collapsed .sa-hchev { transform: rotate(-90deg); }
.sa.is-collapsed .sa-body { display: none; }
.sa-sb-inline { margin-left: max(0px, calc(var(--sa-standby-indent, 46px) - 46px)); font-size: calc(var(--sa-secondary-size, 12px) * var(--sa-k, 1)); font-weight: 400; color: var(--sa-secondary-color, var(--secondary-text-color));
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sa-pwr2 { margin-left: auto; flex: 0 0 auto; width: calc(34px * var(--sa-k, 1)); height: calc(34px * var(--sa-k, 1)); border-radius: 50%; border: none; cursor: pointer;
  background: var(--sa-box); color: var(--sa-header-icon-color, var(--sa-ctx)); display: flex; align-items: center; justify-content: center;
  --mdc-icon-size: calc(20px * var(--sa-k, 1)); }
.sa-pwr2:hover { background: color-mix(in srgb, var(--sa-ctx) 20%, transparent); }
.sa-standby { padding: 2px 0 2px var(--sa-standby-indent, 46px); font-size: calc(var(--sa-secondary-size, 13px) * var(--sa-k, 1)); color: var(--sa-secondary-color, var(--secondary-text-color)); }
.sa-status { container-type: inline-size; }
.sa-chain { display: flex; gap: 6px; margin-top: 10px; }
.sa-chain > .sa-box { flex: 1 1 0; }
.sa-link { flex: 0 0 auto; max-width: calc(92px * var(--sa-k, 1)); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; padding: 0 2px; }
.sa-link-l { text-align: center; line-height: 1.2; }
.sa-link-t { font-size: calc(var(--sa-secondary-size, 12px) * var(--sa-k, 1)); font-weight: 600; color: var(--sa-ctx); overflow-wrap: anywhere; }
.sa-link-s { font-size: calc(var(--sa-subtitle-size, 10px) * var(--sa-k, 1)); color: var(--sa-secondary-color, var(--secondary-text-color)); overflow-wrap: anywhere; }
.sa-link-l.warn .sa-link-t { color: var(--warning-color, #ff9800); text-decoration: line-through; }
.sa-link-t:empty, .sa-link-s:empty { display: none; }
.sa-volrow { display: flex; align-items: center; gap: 8px; margin: 6px 6px 0; }
.sa-volrow .sa-vol { flex: 1 1 auto; margin: 0; }
.sa-vol-v { flex: 0 0 auto; font-size: calc(var(--sa-secondary-size, 12px) * var(--sa-k, 1)); color: var(--sa-secondary-color, var(--secondary-text-color)); font-variant-numeric: tabular-nums; }
/* Narrow card: stack Input over Output, the arrow points down with the processing beside it. */
/* Stacking (stack_when_narrow): auto stacks the boxes only on a really narrow card (status area under
   260 px — a phone in portrait stays side by side); always stacks them; never keeps them side by side. */
@container (max-width: 260px) {
  .sa.stack-auto .sa-flow2 { flex-direction: column; }
  .sa.stack-auto .sa-flow2 > .sa-link { max-width: none; flex-direction: row-reverse; gap: 6px; }
  .sa.stack-auto .sa-flow2 > .sa-link .sa-arrow { transform: rotate(90deg); }
}
.sa.stack-always .sa-flow2 { flex-direction: column; }
.sa.stack-always .sa-flow2 > .sa-link { max-width: none; flex-direction: row-reverse; gap: 6px; }
.sa.stack-always .sa-flow2 > .sa-link .sa-arrow { transform: rotate(90deg); }
.sa-uhide, .sa-away { display: none !important; }
.sa-merged { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--sa-divider-color, rgba(127,127,127,0.2)); }
.sa-merged-h { margin-bottom: 4px; font-size: calc(var(--sa-subtitle-size, 10px) * var(--sa-k, 1)); letter-spacing: .08em; text-transform: uppercase;
  color: var(--sa-subtitle-color, var(--secondary-text-color)); }
.sa-chain + .sa-chain { margin-top: 6px; }
.sa-chain[hidden] + .sa-chain { margin-top: 10px; }
.sa-plain { padding: 6px 0 2px; border-top: 1px solid var(--sa-divider-color, rgba(127,127,127,0.2)); margin-top: 10px; }
.sa-box-s.warn { color: var(--warning-color, #ff9800); }
.sa-box { min-width: 0; padding: 8px 6px; border-radius: 10px; text-align: center; background: var(--sa-box); }
.sa-box-h { font-size: calc(var(--sa-subtitle-size, 10px) * var(--sa-k, 1)); letter-spacing: .08em; text-transform: uppercase; color: var(--sa-subtitle-color, var(--secondary-text-color)); }
.sa-box-t { font-size: calc(var(--sa-text-size, 14px) * var(--sa-k, 1)); font-weight: 600; color: var(--sa-text-color, var(--primary-text-color)); line-height: 1.25;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; }
.sa-box-s { font-size: calc(var(--sa-secondary-size, 12px) * var(--sa-k, 1)); color: var(--sa-secondary-color, var(--secondary-text-color)); line-height: 1.3;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; }
.sa-box-s:empty { display: none; }
.sa-box-h { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sa-vol { height: 4px; margin: 5px 10% 4px; border-radius: 2px; background: rgba(127,127,127,0.2); overflow: hidden; }
.sa-vol > span { display: block; height: 100%; border-radius: 2px; background: var(--sa-ctx); transition: width .4s ease; }
.sa-arrow { align-self: center; color: var(--sa-icon-color, var(--sa-ctx)); --mdc-icon-size: calc(18px * var(--sa-k, 1)); }
.sa-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.sa-tags:empty { display: none; }
.sa-tag { padding: 1px calc(8px * var(--sa-k, 1)); border: 1px solid currentColor; border-radius: 999px; font-size: calc(11px * var(--sa-k, 1)); font-weight: 600;
  letter-spacing: .04em; color: var(--secondary-text-color); }
.sa-tag.ctx { color: var(--sa-ctx); }
.sa-tag.bad { color: var(--error-color, #f44336); }
.sa-tag.ok { color: var(--success-color, #4caf50); }
.sa-fold { margin-top: 10px; border-top: 1px solid var(--sa-divider-color, rgba(127,127,127,0.2)); }
.sa-fold > summary { display: flex; align-items: center; gap: 8px; padding: 8px 0 2px; cursor: pointer; list-style: none;
  font-size: calc(var(--sa-section-title-size, 14px) * var(--sa-k, 1)); color: var(--sa-section-title-color, var(--primary-text-color)); user-select: none; }
.sa-fold > summary::-webkit-details-marker { display: none; }
.sa-fold > summary .sa-sec-i { color: var(--sa-section-icon-color, var(--sa-ctx)); --mdc-icon-size: calc(var(--sa-section-icon-size, 18px) * var(--sa-k, 1)); }
.sa-fold > summary .sa-chev { margin-left: auto; color: var(--secondary-text-color); --mdc-icon-size: calc(18px * var(--sa-k, 1)); transition: transform .2s; }
.sa-fold[open] > summary .sa-chev { transform: rotate(90deg); }
.sa-fold > summary .sa-peek { font-size: calc(var(--sa-secondary-size, 12px) * var(--sa-k, 1)); color: var(--sa-secondary-color, var(--secondary-text-color));
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.sa-row { display: flex; align-items: flex-start; gap: 8px; margin-top: 8px; }
.sa-row-l { flex: 0 0 calc(92px * var(--sa-k, 1)); padding-top: 6px; font-size: calc(var(--sa-subtitle-size, 12px) * var(--sa-k, 1)); color: var(--sa-subtitle-color, var(--secondary-text-color)); }
.sa-opts { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
.sa-chip { max-width: 100%; padding: calc(5px * var(--sa-k, 1)) calc(10px * var(--sa-k, 1)); border: 1px solid var(--sa-chip-border-color, rgba(127,127,127,0.35)); border-radius: 8px; cursor: pointer;
  background: var(--sa-chip-background, transparent); color: var(--sa-chip-color, var(--primary-text-color));
  font-size: calc(var(--sa-chip-size, 13px) * var(--sa-k, 1)); white-space: nowrap; transition: background .2s, border-color .2s; }
.sa-chip:hover { border-color: var(--sa-ctx); }
.sa-chip.on { background: var(--sa-ctx); border-color: var(--sa-ctx); color: #fff; }
.sa-chip.pend { border-style: dashed; border-color: var(--sa-ctx); color: var(--sa-ctx); animation: sa-pulse 1.2s ease-in-out infinite; }
.sa-chip[data-swatch].on { background: var(--sa-sw, var(--sa-ctx)); border-color: var(--sa-sw, var(--sa-ctx)); }
.sa.is-off .sa-ctl, .sa.is-down .sa-ctl { opacity: .45; pointer-events: none; }
.sa.is-down [data-sec="status"] .sa-chain { opacity: .45; }
/* toggle pills (switches) */
.sa-toggles { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.sa-toggle { display: inline-flex; align-items: center; gap: 6px; padding: calc(5px * var(--sa-k, 1)) calc(10px * var(--sa-k, 1)); border-radius: 999px; cursor: pointer;
  border: 1px solid var(--sa-chip-border-color, rgba(127,127,127,0.35)); background: var(--sa-chip-background, transparent);
  color: var(--sa-chip-color, var(--secondary-text-color)); font-size: calc(var(--sa-chip-size, 13px) * var(--sa-k, 1)); --mdc-icon-size: calc(18px * var(--sa-k, 1)); }
.sa-toggle ha-icon { color: var(--secondary-text-color); }
.sa-toggle.on { color: var(--sa-ctx); border-color: var(--sa-ctx); }
.sa-toggle.on ha-icon { color: var(--sa-ctx); }
.sa-toggle.pend { border-style: dashed; animation: sa-pulse 1.2s ease-in-out infinite; }
/* slider rows (numbers) */
.sa-slider { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.sa-slider-l { flex: 0 0 calc(92px * var(--sa-k, 1)); font-size: calc(var(--sa-subtitle-size, 12px) * var(--sa-k, 1)); color: var(--sa-subtitle-color, var(--secondary-text-color)); }
.sa-range { flex: 1 1 auto; min-width: calc(80px * var(--sa-k, 1)); accent-color: var(--sa-ctx); cursor: pointer; }
.sa-slider-v { flex: 0 0 calc(52px * var(--sa-k, 1)); text-align: right; font-weight: 600; font-variant-numeric: tabular-nums;
  font-size: calc(var(--sa-text-size, 14px) * var(--sa-k, 1)); color: var(--sa-text-color, var(--primary-text-color)); }
.sa-vollarge { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.sa-vollarge .sa-key { flex: 0 0 calc(40px * var(--sa-k, 1)); height: calc(36px * var(--sa-k, 1)); }
.sa-key { display: flex; align-items: center; justify-content: center; border: none; border-radius: 10px; cursor: pointer;
  background: var(--sa-box); color: var(--sa-icon-color, var(--primary-text-color)); font-size: calc(var(--sa-chip-size, 12px) * var(--sa-k, 1));
  --mdc-icon-size: calc(var(--sa-icon-size, 22px) * var(--sa-k, 1)); }
.sa-key:hover { background: color-mix(in srgb, var(--sa-ctx) 20%, transparent); }
.sa-group-h { margin-top: 12px; font-size: calc(var(--sa-subtitle-size, 10px) * var(--sa-k, 1)); letter-spacing: .08em; text-transform: uppercase;
  color: var(--sa-subtitle-color, var(--secondary-text-color)); }
.sa-info { display: grid; grid-template-columns: auto minmax(0,1fr); gap: 4px 12px; margin-top: 8px;
  font-size: calc(var(--sa-secondary-size, 12px) * var(--sa-k, 1)); color: var(--sa-secondary-color, var(--secondary-text-color)); }
.sa-info > b { font-weight: 500; color: var(--sa-text-color, var(--primary-text-color)); text-align: right;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sa-note { margin-top: 8px; font-size: calc(var(--sa-secondary-size, 12px) * var(--sa-k, 1)); line-height: 1.5; color: var(--sa-secondary-color, var(--secondary-text-color)); }
.sa-note.bad { color: var(--error-color, #f44336); }
.sa-empty { margin-top: 8px; font-size: calc(var(--sa-secondary-size, 12px) * var(--sa-k, 1)); color: var(--secondary-text-color); font-style: italic; }/* Narrow cards (shrink_when_narrow): the whole card scales down, so nothing overflows on a phone or a
   narrow grid column. --sa-k multiplies every size above; it is set on the card's children because a
   container query styles the container's descendants, not the container itself. Below .75 text gets
   too small to read and tap. */
.sa { container: sacard / inline-size; }
@container sacard (max-width: 420px) { .sa.shrink > * { --sa-k: .92; } }
@container sacard (max-width: 360px) { .sa.shrink > * { --sa-k: .85; } }
@container sacard (max-width: 300px) {
  .sa.shrink > * { --sa-k: .78; }
  .sa.shrink .sa-row { flex-direction: column; gap: 4px; }
  .sa.shrink .sa-row-l { flex: none; padding-top: 0; }
  .sa.shrink .sa-slider-l { flex-basis: calc(64px * var(--sa-k, 1)); overflow-wrap: anywhere; line-height: 1.2; }
  .sa.shrink .sa-chip, .sa.shrink .sa-toggle { min-width: 0; white-space: normal; overflow-wrap: anywhere; line-height: 1.2; }
}
@container sacard (max-width: 240px) { .sa.shrink > * { --sa-k: .75; } }

`;

// Section inner HTML (the collapsible body for each id, except 'volume' which is built inline
// because it can be a plain always-open block). A chip row and the markup match _build()'s helpers.
const chipRowHtml = (name, label) => `<div class="sa-row" data-row="${name}"><div class="sa-row-l">${label}</div><div class="sa-opts" data-opts="${name}"></div></div>`;
const SECTION_BODIES = {
  listening: `
            <div class="sa-ctl">
              ${chipRowHtml('source', 'Source')}
              ${chipRowHtml('preset', 'Preset')}
              ${chipRowHtml('surround', 'Surround')}
            </div>`,
  audio: `
            <div class="sa-ctl">
              ${chipRowHtml('loudness', 'Loudness')}
              <div class="sa-group-h">Trims &amp; enhance</div>
              <div data-k="audio_sliders"></div>
              <div class="sa-toggles" data-k="audio_toggles"></div>
            </div>`,
  decoding: `
            <div class="sa-ctl">
              ${chipRowHtml('dolby_mode', 'Dolby')}
              ${chipRowHtml('sphereaudio', 'SphereAudio')}
              ${chipRowHtml('auro_preset', 'Auro')}
              ${chipRowHtml('drc', 'DRC')}
              ${chipRowHtml('imax_mode', 'IMAX')}
              <div class="sa-toggles" data-k="decoding_toggles"></div>
            </div>`,
  video: `
            <div class="sa-info" data-k="video_info"></div>
            <div class="sa-note" data-k="video_note"></div>`,
  zones: `
            <div class="sa-ctl" data-k="zones_body"></div>
            <div class="sa-empty" data-k="zones_empty" hidden>No extra zones enabled. Enable the per-zone entities in Settings → Devices &amp; services → StormAudio → device → Entities.</div>`,
  triggers: `
            <div class="sa-toggles" data-k="triggers_body"></div>
            <div class="sa-empty" data-k="triggers_empty" hidden>No 12V triggers enabled. Enable the Trigger entities in the integration to control them here.</div>`,
  frontpanel: `
            <div class="sa-ctl">
              ${chipRowHtml('fp_color', 'Color')}
              ${chipRowHtml('fp_standby_delay', 'Standby delay')}
              <div data-k="fp_sliders"></div>
            </div>
            <div class="sa-empty" data-k="fp_empty" hidden>Front-panel entities are disabled by default (and absent on Focal / Bryston). Enable them in the integration to control them here.</div>`,
  info: `
            <div class="sa-info" data-k="info"></div>
            <div class="sa-note" data-k="link"></div>
            <div class="sa-note" data-k="missing"></div>`,
};

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
    this._dragUntil = 0;
  }

  setConfig(config) {
    if (!config || typeof config !== 'object') throw new Error('Invalid configuration');
    const next = normalizeConfig(config);
    if (this._built && JSON.stringify(next) === JSON.stringify(this._config)) return;
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
    loadUniqueIds(hass, () => { if (this._built) this._update(true); });
    if (!this._built) this._build();
    else this._schedule();
  }

  set editMode(v) { this._editMode = !!v; this._applyVisibility(); }
  set preview(v) { this._preview = !!v; this._applyVisibility(); }

  connectedCallback() { this._applyVisibility(); }

  /**
   * True while the Dashboard is being edited or this card is the editor preview.
   * HA does not always pass `preview` / `editMode` to the card element, so also
   * look for the editor's wrappers among the ancestors (crossing shadow roots).
   */
  _editing() {
    if (this._editMode || this._preview) return true;
    let n = this.parentNode || (this.getRootNode && this.getRootNode().host);
    for (let i = 0; n && i < 40; i++) {
      const tag = (n.localName || '').toLowerCase();
      if (EDITOR_WRAPPERS.includes(tag)) return true;
      if (n.hasAttribute && (n.hasAttribute('preview') || n.hasAttribute('edit-mode'))) return true;
      n = n.parentNode || n.host;
    }
    return false;
  }

  getCardSize() { return 6; }
  getGridOptions() { return { columns: 12, min_columns: 6, rows: 'auto' }; }

  _schedule() {
    if (this._timer) return;
    this._timer = setTimeout(() => { this._timer = null; this._update(false); }, 250);
  }

  // -- build once -----------------------------------------------------------
  /** First build: plain innerHTML. Later: patch the existing DOM (see morphChildren). */
  _setHTML(html) {
    if (!this.querySelector('ha-card')) { this.innerHTML = html; return; }
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    morphChildren(this, tpl.content);
  }

  /** True the first time for this element + key: listeners survive a patch, so bind them once. */
  _once(el, key) {
    if (!el) return false;
    if (!this._wired) this._wired = new WeakMap();
    const done = this._wired.get(el) || new Set();
    if (done.has(key)) return false;
    done.add(key);
    this._wired.set(el, done);
    return true;
  }

  _build() {
    const c = this._config;
    if (!this._open) this._open = new Set(c.open_sections || []);
    const fold = (sec, label, body) => `
      <details class="sa-fold" data-sec="${sec}"${this._open.has(sec) ? ' open' : ''}>
        <summary><ha-icon class="sa-sec-i" icon="${esc(iconFor(c, sec))}"></ha-icon><span>${c.section_names && c.section_names[sec] ? esc(c.section_names[sec]) : label}</span>
          <span class="sa-peek" data-peek="${sec}"></span><ha-icon class="sa-chev" icon="mdi:chevron-right"></ha-icon></summary>
        ${body}
      </details>`;
    const standbyText = esc(cfg(c, 'standby_message') || 'Standby · tap the icon to power on');
    const dotAt = cfg(c, 'show_dot') ? cfg(c, 'dot_position') : 'none';
    const dot = (where) => (dotAt === where ? `<span class="sa-dot at-${where}" data-k="dot" data-pos="${where}"></span>` : '');
    if (this._collapsed === undefined) this._collapsed = cfg(c, 'collapsible') && cfg(c, 'start_collapsed');
    // Status: audio Input → (processing on the arrow) → Output, then one Video box (it passes through).
    const audioFlowHtml = `<div class="sa-chain sa-flow2" data-k="aflow">
              <div class="sa-box" data-item="box-ain"><div class="sa-box-h" data-k="ain_h">Input</div><div class="sa-box-t" data-k="ain_t"></div><div class="sa-box-s" data-k="ain_1"></div></div>
              <div class="sa-link"><div class="sa-link-l" data-item="aproc"><div class="sa-link-t" data-k="aproc_t"></div><div class="sa-link-s" data-k="aproc_1"></div></div><ha-icon class="sa-arrow" icon="mdi:arrow-right"></ha-icon></div>
              <div class="sa-box" data-item="box-aout"><div class="sa-box-h">Output</div><div class="sa-box-t" data-k="aout_t"></div><div class="sa-box-s" data-k="aout_1"></div>
                <div class="sa-volrow"><div class="sa-vol"><span data-k="vol_bar"></span></div><span class="sa-vol-v" data-k="aout_2"></span></div></div>
            </div>`;
    const videoHtml = `<div class="sa-chain" data-k="vflow"><div class="sa-box sa-wide" data-item="box-video"><div class="sa-box-h" data-k="vid_h">Video</div><div class="sa-box-t" data-k="vid_t"></div><div class="sa-box-s" data-k="vid_1"></div></div></div>`;
    this._setHTML(`
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
          ${orderedSections(c).map((id) => {
            if (id === 'status') {
              return `<div class="sa-status" data-sec="status">
            ${audioFlowHtml}
            ${videoHtml}
            <div class="sa-tags" data-k="tags"></div>
          </div>`;
            }
            const label = Object.fromEntries(FOLDS)[id];
            // Volume is used all the time: a plain, always-open block unless made collapsible.
            if (id === 'volume') {
              const body = `
            <div class="sa-ctl">
              <div class="sa-vollarge">
                <button class="sa-key" data-tap="vol-step" data-dir="-1" aria-label="Volume down"><ha-icon icon="mdi:minus"></ha-icon></button>
                <input type="range" class="sa-range" data-k="vol_range" min="0" max="100" step="1" aria-label="Volume">
                <button class="sa-key" data-tap="vol-step" data-dir="1" aria-label="Volume up"><ha-icon icon="mdi:plus"></ha-icon></button>
                <span class="sa-slider-v" data-k="vol_val"></span>
              </div>
              <div class="sa-toggles" data-k="listen_toggles"></div>
            </div>`;
              return cfg(c, 'volume_collapsible') ? fold('volume', 'Volume', body) : `<div class="sa-plain" data-sec="volume">${body}</div>`;
            }
            return fold(id, label, SECTION_BODIES[id]);
          }).join('')}
        </div>
      </ha-card>`);
    this._root = this.querySelector('.sa');
    this._k = {};
    this.querySelectorAll('[data-k]').forEach((el) => { this._k[el.dataset.k] = el; });
    this._applyLayout();
    this.querySelectorAll('details.sa-fold').forEach((d) => this._once(d, 'toggle') && d.addEventListener('toggle', () => {
      if (d.open) this._open.add(d.dataset.sec); else this._open.delete(d.dataset.sec);
    }));
    const range = this._k.vol_range;
    if (this._once(range, 'range')) range.addEventListener('input', () => { this._dragStart(); this._k.vol_val.textContent = `${range.value}`; });
    if (this._once(range, 'range-change')) range.addEventListener('change', () => { this._dragEnd(); this._setNumber('volume', Number(range.value)); });
    if (this._once(this._root, 'bind')) this._bind();
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
      this._dragStart();
      const out = r.closest('.sa-slider').querySelector('.sa-slider-v');
      if (out) out.textContent = this._fmtRange(r);
    });
    root.addEventListener('change', (e) => {
      const r = e.target.closest && e.target.closest('[data-range],[data-zrange]');
      if (!r || r.dataset.k === 'vol_range') return;
      this._dragEnd();
      if (r.dataset.range) this._setNumber(r.dataset.range, Number(r.value));
      else if (r.dataset.zrange) this._setEntityNumber(r.dataset.zrange, Number(r.value));
    });
  }

  // A slider being dragged isn't overwritten by state updates. The hold expires on its own, so a
  // drag that never sends 'change' (touch cancelled, released off the page) can't freeze the sliders.
  _dragStart() {
    this._dragUntil = Date.now() + DRAG_HOLD_MS;
    clearTimeout(this._dragTimer);
    this._dragTimer = setTimeout(() => { if (this._built && !this._isDragging()) this._update(true); }, DRAG_HOLD_MS + 50);
  }

  _dragEnd() { this._dragUntil = 0; clearTimeout(this._dragTimer); }

  _isDragging() { return Date.now() < this._dragUntil; }

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

  /** Step a number by `size` entity steps, from the value last sent if it is still pending. */
  _numStep(key, dir, size = 1) {
    const N = this._numState(key);
    if (!dir || !N.id) return;
    const cur = this._pendingFor(N.id, N.value) ?? N.value;
    if (cur !== null) this._setNumber(key, Number(cur) + dir * size * N.step);
  }

  _run(action, el) {
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
      case 'vol-step':
        this._numStep('volume', Number(el && el.dataset.dir) || 0, cfg(this._config, 'volume_step'));
        break;
      case 'collapse':
        if (this._powerState !== 'on') break;
        this._collapsed = !this._collapsed;
        this._applyCollapse();
        break;
      default: break;
    }
  }

  /** Merge sections into others (section_merge): move their content to the end of the target, under their name. */
  _applyLayout() {
    const c = this._config;
    orderedSections(c).forEach((id) => {
      const target = mergeTarget(c, id);
      if (!target) return;
      const from = this.querySelector(`[data-sec="${id}"]`);
      const to = this.querySelector(`[data-sec="${target}"]`);
      if (!from || !to) return;
      const wrap = document.createElement('div');
      wrap.className = 'sa-merged';
      wrap.dataset.from = id;
      wrap.innerHTML = `<div class="sa-merged-h">${esc(secLabel(c, id))}</div>`;
      [...from.children].filter((el) => el.tagName !== 'SUMMARY').forEach((el) => wrap.appendChild(el));
      to.appendChild(wrap);
      from.classList.add('sa-away');
    });
  }

  /** Hide the settings the user hid (hidden_items); a status arrow shows only between two visible boxes. */
  _applyItems() {
    const c = this._config;
    const hidden = new Set(c.hidden_items || []);
    Object.entries(SECTION_ITEMS).forEach(([sec, items]) => items.forEach(([id, , sel, key]) => {
      if (key || !sel) return;
      const off = hidden.has(`${sec}.${id}`);
      this.querySelectorAll(sel).forEach((el) => el.classList.toggle('sa-uhide', off));
    }));
    this.querySelectorAll('.sa-chain').forEach((chain) => {
      const kids = [...chain.children];
      const boxes = kids.filter((el) => el.classList.contains('sa-box'));
      const shown = boxes.filter((el) => !el.classList.contains('sa-uhide'));
      const isLink = (el) => el.classList.contains('sa-arrow') || el.classList.contains('sa-link');
      kids.forEach((el) => { if (isLink(el)) el.classList.add('sa-uhide'); });
      shown.slice(1).forEach((b) => {
        const prev = kids[kids.indexOf(b) - 1];
        if (prev && isLink(prev)) prev.classList.remove('sa-uhide');
      });
      chain.classList.toggle('sa-uhide', boxes.length > 0 && shown.length === 0);
    });
  }

  _applyCollapse() {
    if (!this._built) return;
    const can = cfg(this._config, 'collapsible') && this._powerState === 'on';
    const collapsed = can && !!this._collapsed && !this._editing();
    this._root.classList.toggle('is-collapsed', collapsed);
    this._k.hchev.hidden = !can;
  }

  _applyVisibility() {
    if (!this._built) return;
    const editing = this._editing();
    const mode = cfg(this._config, 'when_off');
    const hide = mode === 'hide' && this._powerState === 'off' && !editing;
    this.style.display = hide ? 'none' : '';
    // In standby the body collapses to the header unless when_off is 'expanded'; the editor always shows it.
    if (this._k && this._k.body) this._k.body.hidden = !this._found || (this._standbyNow && mode !== 'expanded' && !editing);
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
    })) + JSON.stringify(this._pending) + JSON.stringify([zones.map((z) => z.id), triggers.map((t) => t.id)])
      // The media_player's state stays 'on' while it boots; only these attributes change.
      + JSON.stringify(((m) => (m ? [m.attributes.detailed_state, m.attributes.source] : null))(st('media')));
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
    this._found = found;
    this._standbyNow = !isOn && !isDown;

    // sections on/off (config) + entity availability
    const secShown = {};
    this.querySelectorAll('[data-sec]').forEach((el) => {
      const sec = el.dataset.sec;
      let show = cfg(c, { status: 'show_status' }[sec] || `show_${sec}`);
      if (sec === 'listening') show = show && !!(E.source || E.preset || E.surround_mode);
      if (sec === 'volume') show = show && !!(E.volume || E.mute || E.dim);
      if (sec === 'audio') show = show && AUDIO_KEYS.some((k) => E[k]);
      if (sec === 'decoding') show = show && !!(E.dolby_mode || E.sphereaudio || E.auro_preset || E.drc || E.imax_mode || E.dolby_virtualizer || E.dialog_norm || E.center_spread);
      if (sec === 'video') show = show && !!(E.video_resolution || E.video_encoding);
      if (sec === 'zones') show = show && zones.length > 0;
      if (sec === 'triggers') show = show && triggers.length > 0;
      if (sec === 'frontpanel') show = show && !!(E.fp_color || E.fp_standby_delay || E.fp_active_bright || E.fp_standby_bright);
      el.hidden = !show;
      secShown[sec] = show;
    });
    // A merged section's settings show only when that section would show on its own (its entities
    // exist, HDR is playing…); a target with nothing of its own still shows for merged settings.
    this.querySelectorAll('.sa-merged').forEach((w) => { w.hidden = !secShown[w.dataset.from]; });
    this.querySelectorAll('[data-sec]').forEach((el) => {
      if (el.hidden && sectionShown(c, el.dataset.sec) && el.querySelector(':scope > .sa-merged:not([hidden])')) el.hidden = false;
    });

    // audio flow: what the source sends › what the processor does › what plays
    const sm = st('surround_mode');
    const engaged = sm && sm.attributes ? sm.attributes.engaged : undefined;
    // Input → (processing on the arrow) → Output, e.g. Dolby Digital 5.1 → StormXT → Dolby Digital 7.3.6.
    const F = audioFlow({ stream: v('stream_type'), channels: v('channel_format'), modeRaw: v('surround_mode'), engaged,
      stormxt: v('stormxt'), outputLayout: cfg(c, 'output_layout') });
    set('ain_h', source ? `Input · ${source}` : 'Input');
    set('ain_t', F.src || '—');
    // Same rows on both sides: encoding, then channels. The sample rate has no output counterpart, so it
    // is on the box's tooltip (and in Info) rather than on the channels row.
    set('ain_1', F.srcCh);
    const ainBox = this.querySelector('[data-item="box-ain"]');
    const ainTip = [F.src, F.srcCh, nice(v('sample_rate'))].filter(Boolean).join(' · ');
    if (ainBox && ainBox.title !== ainTip) ainBox.title = ainTip;
    set('aproc_t', F.proc);
    set('aproc_1', F.procSub);
    const procEl = this.querySelector('[data-item="aproc"]');
    if (procEl) {
      procEl.classList.toggle('warn', F.procWarn);
      if (procEl.title !== F.procTitle) procEl.title = F.procTitle;
    }
    set('aout_t', F.out || '—');
    set('aout_1', cfg(c, 'show_speaker_layout') ? F.outCh : '');
    const volNow = this._numState('volume');
    const volPct = volNow.value === null ? null : ((volNow.value - volNow.min) / Math.max(1, volNow.max - volNow.min)) * 100;
    const vw = `${Math.max(0, Math.min(100, volPct || 0)).toFixed(1)}%`;
    if (K.vol_bar && K.vol_bar.style.width !== vw) K.vol_bar.style.width = vw;
    set('aout_2', v('mute') === 'on' ? 'Muted' : (volNow.value === null ? '' : `Vol ${fmtNum(volNow.value, { unit: volNow.unit })}`));
    // Video: the processor passes it through, so one box — the input, the mode, the color.
    const res = v('video_resolution');
    const rate = v('video_refresh');
    const vport = nice(v('video_input')) || source;
    set('vid_h', vport ? `Video · ${vport}` : 'Video');
    set('vid_t', [fmtVideoMode(res, rate), nice(v('video_encoding'))].filter(Boolean).join(' · ') || '—');
    set('vid_1', [nice(v('video_colorspace')), nice(v('video_colordepth')), nice(v('video_mode')), nice(v('video_cp'))].filter(Boolean).join(' · '));
    if (K.aflow) K.aflow.hidden = !cfg(c, 'show_audio_flow') || !(E.stream_type || E.surround_mode || E.active_speaker);
    if (K.vflow) K.vflow.hidden = !cfg(c, 'show_video_flow') || !(E.video_resolution || E.video_encoding || E.video_colorspace);

    // tags
    const tags = [];
    if (isDown) tags.push(['LINK DOWN', 'bad']);
    if (isOn && v('mute') === 'on') tags.push(['MUTED', 'bad']);
    const flowShown = K.aflow && !K.aflow.hidden;
    if (isOn && v('stormxt') === 'on' && !flowShown) tags.push(['STORMXT', 'ctx']);
    // effects that are on (the arrow carries the processing; these don't fit there)
    if (isOn) {
      [['DOLBY', pretty(DOLBY_MODE, this._currentOption('dolby_mode')), 'Off'],
        ['SPHERE', nice(this._currentOption('sphereaudio'), SPHERE_EFFECT), 'Bypass'],
        ['AURO', nice(this._currentOption('auro_preset'), AURO_PRESET), ''],
        ['LOUDNESS', pretty(LOUDNESS, this._currentOption('loudness')), 'Off'],
      ].filter(([, val, off]) => val && val !== off).forEach(([n, val]) => tags.push([`${n} ${String(val).toUpperCase()}`, '']));
    }
    if (isOn && okState(v('video_encoding')) && /hdr|dolby|hlg/i.test(v('video_encoding'))) tags.push([String(v('video_encoding')).toUpperCase(), 'ctx']);
    if (isOn && v('dim') === 'on') tags.push(['DIM', '']);
    html(K.tags, tags.map(([t, cls]) => `<span class="sa-tag ${cls}">${esc(t)}</span>`).join(''));

    // --- Listening section ---
    const vol = this._numState('volume');
    const volShown = this._pendingFor(vol.id, vol.value) ?? vol.value;
    if (!this._isDragging()) {
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
    this._toggles('audio_toggles', [['lfe_dim', 'LFE Dim', 'mdi:volume-low']], E);
    this._toggles('decoding_toggles', [
      ['dolby_virtualizer', 'Dolby Virtualizer', 'mdi:surround-sound'], ['dialog_norm', 'Dialog Norm', 'mdi:account-voice'],
      ['center_spread', 'Center Spread', 'mdi:arrow-expand-horizontal'],
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
    peek('listening', [source, nice(v('surround_mode'), SURROUND_MODE)].filter(Boolean).join(' · '));
    peek('audio', okState(this._currentOption('loudness')) && this._currentOption('loudness') !== 'Off' ? `Loudness ${pretty(LOUDNESS, this._currentOption('loudness'))}` : '');
    const dolbyPeek = pretty(DOLBY_MODE, this._currentOption('dolby_mode'));
    const spherePeek = nice(this._currentOption('sphereaudio'), SPHERE_EFFECT);
    peek('decoding', [dolbyPeek !== 'Off' ? dolbyPeek : '', spherePeek !== 'Bypass' ? spherePeek : ''].filter(Boolean).join(' · '));
    peek('volume', [volShown !== null ? `Vol ${Math.round(volShown)}` : '', v('mute') === 'on' ? 'Muted' : ''].filter(Boolean).join(' · '));
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
      ['Speaker layout', fmtChannels(cfg(c, 'output_layout'))],
      ['Sample rate', nice(v('sample_rate'))],
      ['Stream type', nice(v('stream_type'))],
      ['Channel format', fmtChannels(v('channel_format'))],
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

    this._applyItems();
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
    // No options (unlicensed SphereAudio / Auro, entity unavailable): hide the row instead of an empty label.
    if (row) row.hidden = options.length === 0;
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
    if (this._isDragging()) return;
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
    const all = platformEntities(hass);
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
    if (!this._isDragging()) {
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

/** Eye show/hide toggle (design system: show/hide is an eye icon, never a checkbox). */
function eyeToggle(attrs, on, label = '', what = '') {
  return `<button class="sae-act sae-eye${on ? '' : ' off'}${label ? ' lbl' : ''}" ${attrs} aria-pressed="${on}"
    title="${on ? 'Hide' : 'Show'} ${esc(what || label || 'section')}"><ha-icon icon="${on ? 'mdi:eye-outline' : 'mdi:eye-off-outline'}"></ha-icon>${label ? `<span>${esc(label)}</span>` : ''}</button>`;
}

/** A labelled on/off toggle in a section row that is not show/hide (Start open, Collapsible). */
function rowToggle(attrs, on, label, iconOn, iconOff, title, disabled = false) {
  return `<button class="sae-act sae-eye lbl${on ? '' : ' off'}" ${attrs} aria-pressed="${on}"${disabled ? ' disabled' : ''}
    title="${esc(title)}"><ha-icon icon="${on ? iconOn : iconOff}"></ha-icon><span>${esc(label)}</span></button>`;
}

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
        .sae-slist { display: flex; flex-direction: column; gap: var(--ltek-sp-2); margin-bottom: var(--ltek-sp-3); }
        .sae-srow { display: flex; align-items: center; gap: var(--ltek-sp-2); padding: 6px 8px; border-radius: var(--ltek-r-card);
          background: var(--ltek-c-surface-raised); border: 1px solid var(--ltek-c-border-soft); }
        .sae-srow.off .sae-sname, .sae-srow.off .sae-sicon { opacity: .45; }
        .sae-sicon { flex: 0 0 auto; color: var(--ltek-c-accent); --mdc-icon-size: 20px; }
        .sae-sname { flex: 1 1 auto; min-width: 0; color: var(--ltek-c-text); font-size: var(--ltek-fs-label); font-weight: var(--ltek-fw-normal);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sae-sctl { display: flex; gap: var(--ltek-sp-3); flex: 0 1 auto; flex-wrap: wrap; justify-content: flex-end; }
        .sae-open-gap { flex: 0 0 52px; }
        .sae-preset { padding: 3px 8px; border: 1px solid var(--ltek-c-border); border-radius: var(--ltek-r-ctrl); background: transparent;
          color: var(--ltek-c-text); font-size: var(--ltek-fs-small); cursor: pointer; }
        .sae-preset:hover { border-color: var(--ltek-c-accent); }
        .sae-act { border: none; background: none; padding: 0; color: var(--ltek-c-icon); cursor: pointer; display: flex; }
        .sae-act:hover:not([disabled]) { color: var(--ltek-c-icon-hover); }
        .sae-act[disabled] { opacity: .25; cursor: default; }
        .sae-act ha-icon { --mdc-icon-size: var(--ltek-icon-sm); }
        .sae-eye.off { color: var(--ltek-c-muted); }
        .sae-eye.lbl { gap: var(--ltek-sp-1); align-items: center; font-size: var(--ltek-fs-small); color: var(--ltek-c-label); }
        .sae-eye.lbl.off { color: var(--ltek-c-muted); }
        .sae-eye.lbl.off span { text-decoration: line-through; }
        .sae-blist { display: flex; flex-direction: column; }
        .sae-brow { display: flex; align-items: center; gap: var(--ltek-sp-2); padding: var(--ltek-sp-1); border-top: 1px solid var(--ltek-c-border-soft); }
        .sae-brow:first-child { border-top: none; }
        .sae-brow.off .sae-sname { color: var(--ltek-c-muted); }
        .sae-act.on { color: var(--ltek-c-accent); }
        .sae-warn { color: var(--warning-color, #ff9800); }
        .sae-stag { flex: 0 0 auto; font-size: var(--ltek-fs-small); color: var(--ltek-c-muted); white-space: nowrap; }
        .sae-sedit { margin: calc(-1 * var(--ltek-sp-1)) 0 var(--ltek-sp-1) 28px; padding: var(--ltek-sp-2) var(--ltek-sp-3);
          border: 1px solid var(--ltek-c-accent); border-radius: var(--ltek-r-card); background: var(--ltek-c-surface); }
`;

class StormAudioCardEditor extends HTMLElement {
  constructor() {
    super();
    this._config = {};
    this._open = new Set(['card']);
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
    loadUniqueIds(hass, () => { if (this._hass) this._render(); });
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

  /** The section list (design system "section rows"): icon, name, sub-option eyes, ↑ / ↓, start open, eye.
   *  Every section, status included, can be moved. */
  /** The inline panel under a section row (pencil): name, its settings' eyes, merge. */
  _secEditPanel(id) {
    const c = this._config;
    const items = SECTION_ITEMS[id] || [];
    const hidden = new Set(c.hidden_items || []);
    const m = c.section_merge || {};
    const isTarget = Object.keys(m).some((k) => k !== id && m[k] === id);
    const rows = items.map(([iid, label, , key]) => {
      const on = key ? !!cfg(c, key) : !hidden.has(`${id}.${iid}`);
      const attr = key ? `data-eye="${key}"` : `data-item-eye="${id}.${iid}"`;
      return `<div class="sae-brow${on ? '' : ' off'}"><span class="sae-sname">${esc(label)}</span>${eyeToggle(attr, on, '', label)}</div>`;
    }).join('');
    const targets = MERGE_TARGETS.filter((t) => t !== id && !m[t]);
    const cur = m[id] || '';
    let merge;
    if (NOT_MERGEABLE.includes(id)) merge = '<p class="sae-hint">This section can\'t be shown inside another one.</p>';
    else if (isTarget) merge = '<p class="sae-hint">Other sections are shown inside this one, so it stays a section of its own.</p>';
    else {
      merge = `<div class="sae-row"><label class="lbl">Show its settings in</label>
        <select data-smerge="${id}"><option value="">— its own section —</option>${targets.map((t) => `<option value="${t}"${t === cur ? ' selected' : ''}>${esc(secLabel(c, t))}</option>`).join('')}</select></div>
        ${cur && ALWAYS_SHOWN.includes(cur) && !(cur === 'volume' && cfg(c, 'volume_collapsible')) ? `<p class="sae-hint sae-warn">${esc(secLabel(c, cur))} is always visible, not a collapsed section, so these settings can be changed by a stray tap.</p>` : ''}
        <p class="sae-hint">The section itself disappears from the card; its visible settings appear at the end of the chosen section, under this section's name.${cur && !mergeTarget(c, id) ? ' <b>Not applied now:</b> one of the two sections is hidden.' : ''}</p>`;
    }
    return `<div class="sae-sedit" data-sedit-panel="${id}">
      <div class="sae-row"><label class="lbl">Name</label><input type="text" data-sname="${id}" value="${esc((c.section_names || {})[id] || '')}" placeholder="${esc(defaultSectionName(id))}"></div>
      ${this._secOptions(id)}
      <div class="sae-group">Settings</div>
      ${items.length ? `<div class="sae-blist">${rows}</div>` : '<p class="sae-hint">This section is a single block; use its eye to show or hide it.</p>'}
      <div class="sae-group">Merge</div>
      ${merge}
    </div>`;
  }

  /** Section-specific options shown in its edit panel. */
  _secOptions(id) {
    const c = this._config;
    if (id === 'status') {
      return `<div class="sae-group">Options</div>
      <div class="sae-row"><label class="lbl">Speaker layout</label><input type="text" data-key="output_layout" value="${esc(cfg(c, 'output_layout'))}" placeholder="e.g. 7.3.6"></div>
      <p class="sae-hint">Your speaker layout, shown with its channel count in the Output box when the processor fills all speakers (StormXT, an upmixer, or Atmos / DTS:X / Auro-3D). The processor reports only a config number, not the layout.</p>
      <div class="sae-group">Layout</div>
      <div class="sae-row"><label class="lbl">Stack the boxes</label><select data-key="stack_when_narrow">${STACK_MODES.map(([v, n]) => `<option value="${v}"${v === cfg(c, 'stack_when_narrow') ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
      <p class="sae-hint">Put the boxes one above the other. <b>Only on a very narrow card</b> keeps them side by side on a phone and stacks them when the card is narrower still (e.g. a small grid column).</p>`;
    }
    if (id === 'volume') {
      return `<div class="sae-group">Options</div>
      ${this._slider('volume_step', '− / + step', cfg(c, 'volume_step'), 1, 20, 1, '', (n) => `${n}`)}`;
    }
    return '';
  }

  /** Pencil button for a section row. */
  _secEditBtn(id) {
    const open = this._sedit === id;
    return `<button class="sae-act${open ? ' on' : ''}" data-sedit="${id}" aria-expanded="${open}" title="${open ? 'Close' : 'Edit section'}"><ha-icon icon="mdi:pencil-outline"></ha-icon></button>`;
  }

  /** Tag on a merged section's row: where its settings show. */
  _secMergeTag(id) {
    const t = mergeTarget(this._config, id);
    return t ? `<span class="sae-stag" title="Shown inside ${esc(secLabel(this._config, t))}">→ ${esc(secLabel(this._config, t))}</span>` : '';
  }

  _sectionsControl() {
    const c = this._config;
    const order = orderedSections(c);
    const last = order.length - 1;
    const byId = Object.fromEntries(FOLDS);
    const openSecs = c.open_sections || [];
    const move = (id, dir, disabled, label) => `<button class="sae-act" data-move="${dir < 0 ? 'up' : 'down'}" data-id="${id}"${disabled ? ' disabled' : ''}
      aria-label="Move ${esc(label)} ${dir < 0 ? 'up' : 'down'}" title="Move ${dir < 0 ? 'up' : 'down'}"><ha-icon icon="mdi:arrow-${dir < 0 ? 'up' : 'down'}"></ha-icon></button>`;
    const statusOn = cfg(c, 'show_status');
    const status = (i) => `<div class="sae-srow${statusOn ? '' : ' off'}" data-section="status">
        <ha-icon class="sae-sicon" icon="mdi:transit-connection-variant"></ha-icon>
        <span class="sae-sname">${esc(secLabel(c, 'status'))}</span>${this._secMergeTag('status')}
        ${move('status', -1, i === 0, 'Status')}${move('status', 1, i === last, 'Status')}
        <span class="sae-open-gap"></span>
        ${eyeToggle('data-eye="show_status"', statusOn, '', 'status area')}
        ${this._secEditBtn('status')}
      </div>${this._sedit === 'status' ? this._secEditPanel('status') : ''}`;
    const rows = order.map((id, i) => {
      if (id === 'status') return status(i);
      const label = byId[id];
      const showKey = FOLD_SHOW[id];
      const on = cfg(c, showKey);
      const collapsible = id !== 'volume' || cfg(c, 'volume_collapsible');
      const subs = id === 'volume'
        ? rowToggle('data-eye="volume_collapsible"', cfg(c, 'volume_collapsible'), 'Collapsible', 'mdi:unfold-more-horizontal', 'mdi:pin-outline',
          cfg(c, 'volume_collapsible') ? 'A collapsible section — tap to always show it' : 'Always shown — tap to make it collapsible', !on)
        : '';
      return `<div class="sae-srow${on ? '' : ' off'}" data-section="${id}">
        <ha-icon class="sae-sicon" icon="${esc(iconFor(c, id))}"></ha-icon>
        <span class="sae-sname">${esc(secLabel(c, id))}</span>${this._secMergeTag(id)}
        ${subs ? `<span class="sae-sctl">${subs}</span>` : ''}
        ${move(id, -1, i === 0, label)}${move(id, 1, i === last, label)}
        ${collapsible ? rowToggle(`data-open="${id}"`, openSecs.includes(id), 'Open', 'mdi:unfold-more-horizontal', 'mdi:unfold-less-horizontal',
          openSecs.includes(id) ? 'Starts open — tap to start collapsed' : 'Starts collapsed — tap to start open', !on) : '<span class="sae-open-gap"></span>'}
        ${eyeToggle(`data-eye="${showKey}"`, on, '', label)}
        ${this._secEditBtn(id)}
      </div>${this._sedit === id ? this._secEditPanel(id) : ''}`;
    }).join('');
    return `<div class="sae-slist">${rows}</div>
      ${c.section_order ? '<div class="sae-row"><button class="sae-preset" data-order-reset>Reset to default order</button></div>' : ''}`;
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
        ? `<div class="sae-blist">${items.map((o) => `<div class="sae-brow${hidden.has(o) ? ' off' : ''}"><span class="sae-sname">${esc(pretty(def.labels, o))}</span>
            ${eyeToggle(`data-hide="${key}" data-hval="${esc(o)}"`, !hidden.has(o), '', pretty(def.labels, o))}</div>`).join('')}</div>`
        : '<p class="sae-hint">Not available — the entity is missing or the processor is off.</p>';
      return this._sub(`btn-${key}`, title, body);
    };
    return `<p class="sae-hint">Use the eye to hide a chip from the card. Sources and presets come from the processor.</p>
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
      <p class="sae-hint">The device, the header title, the power button, what the card does in standby, and collapsing.</p>
      <div class="sae-group">Device</div>
      ${deviceBody}
      <div class="sae-group">Header</div>
      <div class="sae-row"><label class="lbl">Title</label><input type="text" data-key="title" value="${esc(cfg(c, 'title'))}"></div>
      <label class="sae-check"><input type="checkbox" data-key="strip_prefix"${cfg(c, 'strip_prefix') ? ' checked' : ''}>
        Strip the device name from zone/trigger labels (e.g. "ISP Zone 2" → "Zone 2")</label>
      <div class="sae-group">Standby</div>
      <div class="sae-row"><label class="lbl">When in standby or off</label>
        <select data-key="when_off">${WHEN_OFF.map(([v, n]) => `<option value="${v}"${v === cfg(c, 'when_off') ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
      <p class="sae-hint">The card editor always shows the card expanded, so every section can be set up.</p>
      ${cfg(c, 'when_off') !== 'hide' ? `
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
      <div class="sae-group">Size</div>
      <label class="sae-check"><input type="checkbox" data-key="shrink_when_narrow"${cfg(c, 'shrink_when_narrow') ? ' checked' : ''}>
        Shrink the card on narrow screens (phones, narrow grid columns)</label>
      <p class="sae-hint">Text, chips, buttons and the status boxes scale down step by step below 420 px, so nothing overflows.</p>
      <div class="sae-group">Collapse</div>
      <label class="sae-check"><input type="checkbox" data-key="collapsible"${cfg(c, 'collapsible') ? ' checked' : ''}>
        Tap the header to collapse the card to just the header (while on)</label>
      ${cfg(c, 'collapsible') ? `<label class="sae-check"><input type="checkbox" data-key="start_collapsed"${cfg(c, 'start_collapsed') ? ' checked' : ''}>
        Start collapsed</label>` : ''}`;
    const sectionsBody = `
      <p class="sae-hint">The order of the sections on the card (↑ / ↓, the status included), which start open, and the eye to show or hide each one. Sections with no (enabled) entities hide themselves.</p>
      <p class="sae-hint">Use the <b>pencil</b> on a section to rename it, hide single settings, or show its settings inside another section.</p>
      ${this._sectionsControl()}`;
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
        ${this._panel('card', 'mdi:card-text-outline', 'Card', cardBody)}
        ${this._panel('sections', 'mdi:view-agenda-outline', 'Sections', sectionsBody)}
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
      const reveals = ['when_off', 'collapsible', 'show_dot', 'standby_text'].includes(key);
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
    this.querySelectorAll('[data-sedit]').forEach((b) => b.addEventListener('click', () => {
      this._sedit = this._sedit === b.dataset.sedit ? '' : b.dataset.sedit;
      this._render();
    }));
    this.querySelectorAll('[data-sname]').forEach((el) => el.addEventListener('change', () => {
      const names = { ...(this._config.section_names || {}) };
      const v = el.value.trim();
      if (v) names[el.dataset.sname] = v; else delete names[el.dataset.sname];
      this._config.section_names = names;
      this._emit();
      this._render();
    }));
    this.querySelectorAll('[data-item-eye]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.itemEye;
      const was = (this._config.hidden_items || []).includes(id);
      const list = (this._config.hidden_items || []).filter((x) => x !== id);
      if (!was) list.push(id);
      this._config.hidden_items = list;
      this._emit();
      this._render();
    }));
    this.querySelectorAll('[data-smerge]').forEach((el) => el.addEventListener('change', () => {
      const m = { ...(this._config.section_merge || {}) };
      if (el.value) m[el.dataset.smerge] = el.value; else delete m[el.dataset.smerge];
      this._config.section_merge = m;
      this._emit();
      this._render();
    }));
    this.querySelectorAll('[data-eye]').forEach((b) => b.addEventListener('click', () => {
      this._set(b.dataset.eye, !cfg(this._config, b.dataset.eye));
      this._render();
    }));
    this.querySelectorAll('[data-hide]').forEach((el) => el.addEventListener('click', () => {
      const key = el.dataset.hide;
      const val = el.dataset.hval;
      const was = (this._config[key] || []).includes(val);
      const list = (this._config[key] || []).filter((x) => x !== val);
      if (!was) list.push(val);
      if (list.length) this._config[key] = list; else delete this._config[key];
      this._emit();
      this._render();
    }));
    this.querySelectorAll('[data-open]').forEach((el) => el.addEventListener('click', () => {
      const was = (this._config.open_sections || []).includes(el.dataset.open);
      const list = (this._config.open_sections || []).filter((s) => s !== el.dataset.open);
      if (!was) list.push(el.dataset.open);
      if (list.length) this._config.open_sections = list; else delete this._config.open_sections;
      this._emit();
      this._render();
    }));
    this.querySelectorAll('[data-order-reset]').forEach((b) => b.addEventListener('click', () => {
      delete this._config.section_order;
      this._emit();
      this._render();
    }));
    this.querySelectorAll('[data-move]').forEach((b) => b.addEventListener('click', () => {
      const ids = orderedSections(this._config);
      const i = ids.indexOf(b.dataset.id);
      const j = b.dataset.move === 'up' ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      this._config.section_order = ids;
      this._emit();
      this._render();
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
  WHEN_OFF, STACK_MODES, SECTION_ITEMS, MERGE_TARGETS, mergeTarget, secLabel, normalizeConfig, normalizeIcon, REGISTRY, platformEntities, rootStyleVars, rootClasses, resolveEntities, listDevices, pretty, fmtNum, stripPrefix, colorMode,
  DOLBY_MODE, LOUDNESS, FP_COLOR, HIDE_LISTS, FOLDS, FOLD_SHOW, nice, SURROUND_MODE, AURO_PRESET, SPHERE_EFFECT, FORMAT_TERMS,
  orderedFolds, orderedSections, SECTION_IDS, channelCount, fmtChannels, audioFlow, AUDIO_KEYS, fmtVideoMode,
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
