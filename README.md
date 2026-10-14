# StormAudio Card

A Home Assistant Dashboard **custom card** for **StormAudio / Focal / Bryston processors** (ISP / ISR series, Focal Astral 16, Bryston SP4): power, source, audio format and video status at a glance, plus collapsible sections for listening, audio processing, video info, zones, 12V triggers, the front panel and full device info — all in one card with a visual editor. Same design as the [JVC Projector Card](https://github.com/Ltek/jvc-projector-card) and [Lumagen Card](https://github.com/Ltek/lumagen-card).

Current build: **v2026.10.14.2** · full history in [CHANGELOG.md](CHANGELOG.md)

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=Ltek&repository=stormaudio-card&category=plugin)

> Requires the **[StormAudio integration](https://github.com/Ltek/StormAudio)** (TCP/IP API, firmware 4.6r1 or later). The card exposes everything the integration provides.

---

## What it shows

Status sits on top. **Every control is in a collapsed section**, so nothing changes by accident; each collapsed header shows the current value.

```
 〜  StormAudio ●                       HDMI 1 · Dolby Surround · Dolby Atmos
 ┌ SOURCE ─────┐   ┌ FORMAT ────────┐   ┌ VIDEO ─────┐
 │ HDMI 1      │ › │ Dolby Atmos    │ › │ 3840x2160  │
 │ Dolby Surr. │   │ 7.1.4          │   │ 60Hz       │
 │ Movie       │   │ 48 kHz         │   │ BT.2020    │
 └─────────────┘   └────────────────┘   └────────────┘
 [STORM] [STORMXT] [HDR10]
 ◉ Listening  HDMI 1 · Vol 42                      ›
 ♪ Audio      Movie · Bypass                       ›
 ▣ Video      3840x2160 · 60Hz                     ›
 ⌁ Zones      2 zones                              ›
 ⚡ Triggers   1 trigger                            ›
 ▭ Front panel  Blue                               ›
 ⓘ Info       7.1.4                                ›
```

- **Header** — the icon is the power button: tap to toggle the processor on / standby. It shows the power state (context color when on; orange and pulsing while it is starting up or shutting down). The dot is the link: green = the integration reaches the processor, red = it can't; the summary then reads *Offline* in red.
- **Standby** — the card shrinks to its header instead of disappearing, so you can power on from it. Put the "Standby · tap the icon to power on" message below the title, inline, or hidden; or show a power button on the right. Optionally hide the card in standby (it always shows while you edit the Dashboard).
- **Collapse** — optionally tap the header to collapse the card to just the header while the processor is on, and start collapsed.
- **Status** — Source (input, surround mode, Dolby mode) › Format (stream type, channel format, sample rate) › Video (resolution, refresh, color space).
- **Tags** appear only when active: MUTED, STORM (surround mode engaged), STORMXT, the video encoding (HDR10 / Dolby Vision / HLG…), DIM, LINK DOWN.
- **Listening** — a large volume slider with − / +, Mute / Dim pills, and source, preset and surround-mode chips.
- **Audio** — Dolby mode, SphereAudio, Auro, Loudness, DRC, IMAX chips; trim / enhance sliders (Bass, Treble, Center / Surround / LFE enhance, Brightness, Dialog, LipSync, Auro strength); Dolby Virtualizer / Dialog Norm / Center Spread / LFE Dim pills.
- **Video** — resolution, refresh, encoding, color space / depth, mode, input, sync, copy protection (whichever sensors are enabled).
- **Zones** — per-zone volume, mute, EQ and binaural mode, discovered automatically from the device's zone list. Appears only if you have enabled the per-zone entities.
- **Triggers** — the 12V triggers, as on / off pills, discovered automatically. Appears only if you have enabled the trigger entities.
- **Front panel** — color (with a matching swatch), standby delay, active / standby brightness. StormAudio-only (Focal / Bryston don't expose these). Appears only if those entities are enabled.
- **Info** — power, source, preset, surround mode, StormXT, speaker config, sample rate, stream type, channel format, resolution and encoding, plus the connection state and a note listing disabled entities you can enable.

The processor pushes state over its local TCP/IP API, but a tapped option still shows as **sending** (dashed, pulsing) until it confirms.

### Entity resolution

The StormAudio integration sets no `translation_key`, so the card resolves entities by the integration's **`unique_id` suffixes** (via the `media_player`'s unique id as the device prefix). Renamed entity IDs keep working. Entities that are **disabled by default** (zones, triggers, front panel, Video Mode / Input / Sync / Copy Protection, Auro, DRC, IMAX, Zone 2 source) simply don't appear until you enable them — the card hides their rows and sections.

## Installation

### HACS

1. Click the badge above, or in HACS → **⋮ → Custom repositories** add `https://github.com/Ltek/stormaudio-card`, category **Dashboard**.
2. Install **StormAudio Card** and reload the browser.

### Manual

Copy `stormaudio-card.js` to `/config/www/`, then add it under **Settings → Dashboards → ⋮ → Resources** as `/local/stormaudio-card.js` (JavaScript module).

## Setup

Add a card → search **StormAudio Card**. With one processor there is nothing to configure.

Minimal YAML:

```yaml
type: custom:stormaudio-card
```

To show zones, triggers or the front panel, enable those entities in **Settings → Devices & services → StormAudio → device → Entities** — the card then shows the matching section automatically.

## Options

Everything is in the visual editor (Device · Card & sections · Chips · Icons · Appearance). YAML keys are only written when they differ from the default.

| Key | Default | Description |
|---|---|---|
| `device` | first processor | Device ID, if you have more than one StormAudio processor. |
| `title` | `StormAudio` | Header title. |
| `strip_prefix` | `true` | Strip the device name from zone / trigger labels ("ISP Zone 2" → "Zone 2"). |
| `show_when_off` | `true` | `true`: show the card (header only) in standby. `false`: hide it. |
| `standby_text` | `below` | Standby message: `below` the title, `inline` with it, or `hidden`. |
| `standby_message` | stock text | Your own standby message; empty = "Standby · tap the icon to power on". |
| `standby_button` | `false` | In standby, replace the right-hand "Standby" with a power button. |
| `show_dot` | `true` | Show the link dot. |
| `dot_position` | `title` | `title`, `right`, or `icon` (replaces the header icon; it is still the power button). |
| `volume_step` | `1` | How much − / + change the volume (1–20). |
| `collapsible` | `false` | Tap the header to collapse the card to just the header while on. |
| `start_collapsed` | `false` | With `collapsible`, start collapsed. |
| `open_sections` | | Sections already open when the Dashboard loads: `listening`, `audio`, `video`, `zones`, `triggers`, `frontpanel`, `info`. |
| `hide_sources` · `hide_presets` · `hide_dolby` · `hide_sphere` | | Chips to hide, by the integration's value. The editor's **Chips** panel lists them. |
| `show_status` · `show_listening` · `show_audio` · `show_video` · `show_zones` · `show_triggers` · `show_frontpanel` · `show_info` | `true` | Turn parts off (empty sections hide themselves regardless). |
| `accent_color` · `warming_color` | theme primary · orange | Context colors. |
| `icons:` | | `header`, `listening`, `audio`, `video`, `zones`, `triggers`, `frontpanel`, `info` — any MDI name; `mdi:` is optional. |
| `styles:` | | Sizes (px) and colors (any CSS color or theme variable) — see below. |

**`styles:` keys** — sizes: `card_radius` `card_padding` `standby_indent` `header_icon_size` `title_size` `summary_size` `section_icon_size` `section_title_size` `subtitle_size` `text_size` `secondary_size` `chip_size` `icon_size`; colors: `card_background` `card_border_color` `box_background` `divider_color` `header_icon_color` `title_color` `summary_color` `section_icon_color` `section_title_color` `subtitle_color` `text_color` `secondary_color` `chip_color` `chip_background` `chip_border_color` `icon_color`.

Backgrounds and borders (`card_background`, `card_border_color`, `box_background`, `divider_color`, `chip_background`, `chip_border_color`) also accept `transparent` — the editor offers it as a choice.

Example — a blue accent, listening open on load, no "Analog" source chip:

```yaml
type: custom:stormaudio-card
title: Theater
open_sections: [listening]
hide_sources: [Analog]
accent_color: '#2196F3'
styles:
  card_border_color: '#2196F3'
```

## Credits

- **[StormAudio](https://www.stormaudio.com)** for the published TCP/IP API this card and its integration are built around.
- Focal and Bryston units share the same API (Front Panel Color excepted).

MIT licensed — see [LICENSE](LICENSE).
