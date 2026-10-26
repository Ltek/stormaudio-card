# StormAudio Card

A Home Assistant Dashboard card for **StormAudio, Focal and Bryston processors** (ISP / ISR series,
Focal Astral 16, Bryston SP4). See at a glance what the source sends, what the processor does with it
and what reaches your speakers, then reach every setting from one card, set up in a visual editor.

Current build: **v2026.10.26.18** · full history in [CHANGELOG.md](CHANGELOG.md) · every YAML option in [OPTIONS.md](OPTIONS.md)

```
 〜  StormAudio ●                         HDMI 1 · Dolby Surround · Dolby Digital
 ┌ INPUT · HDMI 1 ───────┐   StormXT    ┌ OUTPUT ───────────────┐
 │ Dolby Digital         │   ───────►   │ Dolby Digital         │
 │ 5.1 · 6 ch            │              │ 7.3.6 · 16 ch         │
 │                       │              │ ▬▬▬▬▬▬▬▬░░░░   Vol 42 │
 └───────────────────────┘              └───────────────────────┘
 ┌ VIDEO · HDMI 1 ───────────────────────────────────────────────┐
 │ 2160p60 · HDR10                                               │
 │ BT.2020 · 10-bit                                              │
 └───────────────────────────────────────────────────────────────┘
 [DOLBY MOVIE] [HDR10]
 [−] ━━━━━━━━━━━●━━━━━━━━━━━ [+]  42        [Mute] [Dim]
 ◉ Listening   HDMI 1 · Dolby Surround                       ›
 ♪ Audio                                                     ›
 ▤ Decoding & effects   Movie                                ›
```

---

## Installation

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=Ltek&repository=stormaudio-card&category=plugin)

1. Click the button above. It opens HACS in your Home Assistant with this repository filled in.
2. Add it, then click **Download**. HACS registers the Dashboard resource for you.
3. Hard-refresh the browser (Ctrl/Cmd + Shift + R).
4. On a dashboard: **+ Add card → StormAudio Card**. With one processor there is nothing to set up.

The card is a **custom repository**, so searching HACS won't find it. If the button doesn't work:
HACS → **⋮ → Custom repositories** → `https://github.com/Ltek/stormaudio-card`, category **Dashboard**.

**Requires** the [StormAudio integration](https://github.com/Ltek/StormAudio) (TCP/IP API, firmware
4.6r1 or later). The card uses everything the integration provides.

---

## Features

### See the whole signal path
- **Input → Output** for audio, with what the processor does written on the arrow: **StormXT**, an
  upmixer (Dolby Surround, DTS Neural:X, Auro-Matic), Downmix, or nothing for a native decode.
- Both boxes show the **encoding and the channels**, with the channel count, e.g.
  *Dolby Digital 5.1 · 6 ch → StormXT → Dolby Digital 7.3.6 · 16 ch*.
- Set your speaker layout once and the Output box shows it whenever the processor fills every speaker.
- An upmixer that is selected but **can't run on the current content** is struck through in orange.
- **Video** in one box: HDMI port, `2160p60 · HDR10`, color space, bit depth and copy protection.
- **Tags** for what's switched on right now: muted, Dolby mode, SphereAudio, Auro, Loudness, HDR, dim.

### Control it without the risk
- **Volume** is always at hand: a large slider, − / + and Mute / Dim.
- **Every other control sits in a collapsed section**, so a stray tap can't change your sound. Each
  collapsed header shows the current value.
- **Listening**: source, preset and surround mode. **Audio**: loudness, bass / treble, center /
  surround / LFE enhance, dialog, lip sync. **Decoding & effects**: Dolby mode, SphereAudio, Auro,
  DRC, IMAX and the Dolby options.
- **Zones**, **12V triggers** and the **front panel** appear by themselves once you enable those
  entities in the integration.
- A tapped option shows as *sending* until the processor confirms it.

### Power and standby
- The header icon is the power button, and it shows starting up / shutting down.
- A link dot shows whether Home Assistant can reach the processor.
- In standby, hide the card, collapse it to the header, or keep it expanded.

### Make it yours
- **Reorder, rename, hide and merge sections**, and hide single settings or chips you never use.
- Your own icons, an accent color, and sizes and colors for every part of the card, from your theme or
  your own.
- Everything is in the visual editor; YAML is optional. Only settings you change are saved.

### Works with your setup
- Finds the processor's entities by their unique IDs, so **renamed entities keep working**.
- Settings your processor or license doesn't have simply don't appear: no empty rows, no error tiles.
- **Phone-friendly:** the whole card scales down step by step on a narrow screen, so nothing overflows. The boxes stay side by side on a phone in portrait and stack only on a very narrow card (or choose always / never).

---

## Credits

- **[StormAudio](https://www.stormaudio.com)** for the published TCP/IP API this card and its
  integration are built around. Focal and Bryston units share the same API (front panel color excepted).
- Same design as the [JVC Projector Card](https://github.com/Ltek/jvc-projector-card) and the
  [Lumagen Card](https://github.com/Ltek/lumagen-card).

MIT licensed — see [LICENSE](LICENSE).
