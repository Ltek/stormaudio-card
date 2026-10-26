# StormAudio Card — options

Every option is in the visual editor; this page is for YAML users and for looking up what a setting
does. Only settings that differ from the default are saved, so a new card is just:

```yaml
type: custom:stormaudio-card
```

Editor panels: **Card** (device, title, power & standby) · **Sections** (order, show / hide, and the
pencil on each row for its name, settings, merge and options) · **Chips** · **Icons** · **Appearance**.

---

## Card

| Key | Default | Description |
|---|---|---|
| `device` | first processor | Device ID, if you have more than one StormAudio processor. |
| `title` | `StormAudio` | Header title. |
| `strip_prefix` | `true` | Strip the device name from zone and trigger labels ("ISP Zone 2" → "Zone 2"). |
| `collapsible` | `false` | Tap the header to collapse the card to just the header while the processor is on. |
| `start_collapsed` | `false` | With `collapsible`, start collapsed. |
| `show_dot` | `true` | Show the link dot (green: reachable, red: not). |
| `dot_position` | `title` | `title` (right of the title), `right` (far right) or `icon` (replaces the header icon; it is still the power button). |
| `shrink_when_narrow` | `true` | Scale the whole card down step by step on a narrow card (phones, narrow grid columns): to 92 % below 420 px wide, 85 % below 360, 78 % below 300, 75 % below 240. Under 300 px row labels also move above their chips and long chip names wrap. `false` keeps the full size. Editor: Card → Size. |
| `stack_when_narrow` | `auto` | Put the status boxes one above the other: `auto` only when the status area is narrower than 260 px (a phone in portrait stays side by side; a small grid column stacks), `always`, or `never`. Editor: Sections → pencil on **Status** → Options. |

## Power & standby

| Key | Default | Description |
|---|---|---|
| `when_off` | `collapse` | In standby / off: `hide` (hide the whole card), `collapse` (header only, so you can still power on) or `expanded` (keep every section). The editor always shows the card expanded. The old `show_when_off: false` still works and means `hide`. |
| `standby_text` | `below` | The standby message: `below` the title, `inline` with it, or `hidden`. |
| `standby_message` | stock text | Your own standby message. Empty = "Standby · tap the icon to power on". |
| `standby_button` | `false` | In standby, show a power button on the right instead of the "Standby" text. |

## Status

| Key | Default | Description |
|---|---|---|
| `show_status` | `true` | The whole status area: audio flow, video box and tags. |
| `show_audio_flow` | `true` | The audio **Input → Output** boxes. |
| `show_video_flow` | `true` | The **Video** box. |
| `output_layout` | | Your speaker layout, e.g. `7.3.6`. Shown with its channel count (`7.3.6 · 16 ch`) in the Output box when the processor fills every speaker (StormXT, an upmixer, or Atmos / DTS:X / Auro-3D / MPEG-H / IMAX), and in Info. The processor reports only a speaker-config number, so the card needs it from you; without it an upmix reads *All speakers*. Editor: Sections → pencil on **Status** → Options. |
| `show_speaker_layout` | `true` | Show the channels line in the Output box. |

**How the Output channels are worked out:** your `output_layout` when the processor fills every
speaker; the source's own layout when it decodes a channel-based format natively; `2.0` for a downmix.

## Volume

| Key | Default | Description |
|---|---|---|
| `show_volume` | `true` | The Volume block. |
| `volume_collapsible` | `false` | `false`: Volume is always shown under the status. `true`: it is a collapsible section like the others. |
| `volume_step` | `1` | How much − / + change the volume (1–20). Editor: Sections → pencil on **Volume** → Options. |

## Sections

| Key | Default | Description |
|---|---|---|
| `show_listening` · `show_audio` · `show_decoding` · `show_video` · `show_zones` · `show_triggers` · `show_frontpanel` · `show_info` | `true` | Turn a section off. Sections whose entities don't exist hide themselves anyway. |
| `section_order` | card order | Order of the sections: `status`, `volume`, `listening`, `audio`, `decoding`, `video`, `zones`, `triggers`, `frontpanel`, `info`. List only the ones you want to move; the rest follow in the default order. Editor: Sections → ↑ / ↓. |
| `open_sections` | | Sections already open when the dashboard loads: `volume` (with `volume_collapsible`), `listening`, `audio`, `decoding`, `video`, `zones`, `triggers`, `frontpanel`, `info`. Editor: Sections → **Open**. |
| `section_names` | | Your own name per section, e.g. `{ decoding: Effects }`. Editor: pencil → Name. |
| `section_merge` | | Show a section's settings inside another one, e.g. `{ decoding: audio }`. The section disappears and its visible settings appear at the end of the target, under its name. Not into a hidden section, and no chains. Editor: pencil → Merge. |
| `hidden_items` | | Single settings to hide, as `section.setting` (list below). Editor: pencil → Settings, one eye per setting. |

### `hidden_items` ids

| Section | Ids |
|---|---|
| `status` | `ain` (Input box), `aproc` (processing label on the arrow), `aout` (Output box), `vdet` (video details line), `tags` |
| `volume` | `slider`, `mute`, `dim` |
| `listening` | `source`, `preset`, `surround` |
| `audio` | `loudness`, `bass`, `treble`, `center_enhance`, `surround_enhance`, `lfe_enhance`, `brightness`, `dialog_control`, `lipsync`, `auro_strength`, `lfe_dim` |
| `decoding` | `dolby_mode`, `sphereaudio`, `auro_preset`, `drc`, `imax_mode`, `dolby_virtualizer`, `dialog_norm`, `center_spread` |
| `video` | `details`, `note` |
| `frontpanel` | `fp_color`, `fp_standby_delay`, `fp_active_bright`, `fp_standby_bright` |
| `info` | `details`, `link`, `missing` |

The audio flow, video box and channel line have their own keys (`show_audio_flow`, `show_video_flow`,
`show_speaker_layout`) instead.

## Chips

| Key | Description |
|---|---|
| `hide_sources` · `hide_presets` · `hide_dolby` · `hide_sphere` | Chips to hide, by the integration's value, e.g. `hide_sources: [Analog]`. The editor's **Chips** panel lists your processor's options with an eye on each. |

## Icons & colors

| Key | Default | Description |
|---|---|---|
| `icons:` | | Per part: `header`, `volume`, `listening`, `audio`, `decoding`, `video`, `zones`, `triggers`, `frontpanel`, `info`. Any MDI name; `mdi:` is optional. |
| `accent_color` | theme primary | The card's context color (active chips, bars, the arrow label). |
| `warming_color` | orange | Power icon while starting up / shutting down. |

## Appearance (`styles:`)

Sizes are in px; colors take any CSS color or theme variable (e.g. `var(--accent-color)`).

- **Sizes:** `card_radius` `card_padding` `standby_indent` `header_icon_size` `title_size` `summary_size` `section_icon_size` `section_title_size` `subtitle_size` `text_size` `secondary_size` `chip_size` `icon_size`
- **Colors:** `card_background` `card_border_color` `box_background` `divider_color` `header_icon_color` `title_color` `summary_color` `section_icon_color` `section_title_color` `subtitle_color` `text_color` `secondary_color` `chip_color` `chip_background` `chip_border_color` `icon_color`
- `card_background`, `card_border_color`, `box_background`, `divider_color`, `chip_background` and `chip_border_color` also accept `transparent`.

---

## Entities

The integration sets no translation keys, so the card finds entities by the integration's **unique
ID suffixes**, with the media player's unique ID as the device prefix. Renamed entity IDs keep working.

Some entities are **disabled by default** in the integration: zones, triggers, the front panel,
Video Mode / Input / Sync / Copy Protection, Auro preset / strength, DRC, IMAX and the Zone 2 source.
Their rows and sections stay hidden until you enable them in **Settings → Devices & services →
StormAudio → device → Entities**; the Info section lists the ones you can enable.

## Example

A theater card with your speaker layout, Listening open on load, no "Analog" source and a blue border:

```yaml
type: custom:stormaudio-card
title: Theater
output_layout: 7.3.6
open_sections: [listening]
hide_sources: [Analog]
accent_color: '#2196F3'
styles:
  card_border_color: '#2196F3'
```
