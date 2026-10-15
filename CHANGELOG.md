# Changelog

## v2026.10.15.12

- The **Device** picker moved into the **Card** panel (it was a whole panel for one setting).
- The volume **− / + step** moved from Card to the **Volume** section's options (Sections → pencil on Volume).
- A section's edit panel (pencil) can now carry options of its own.

## v2026.10.15.11

- **Sections** is its own top-level panel in the editor (it was at the bottom of *Card & sections*, now just **Card**).
- **The preview no longer refreshes on every change.** A config change now patches the card in place instead of rebuilding it, so the editor preview keeps its icons, open sections and position; a change that leaves the config the same does nothing.

## v2026.10.15.10

- **Edit a section** — a **pencil** on every row in Card & sections → Sections opens that section's settings under the row:
  - **Name**: rename the section (`section_names`); the card and the editor use your name.
  - **Settings**: an eye for each setting in the section (each row, slider, button or status box), so you can hide just the ones you don't use (`hidden_items`). Options the card already had (e.g. menu shortcuts, Low / Mid / High, flows) moved here from the row.
  - **Merge**: show the section's visible settings inside another section instead (`section_merge`). The section disappears from the card and its settings appear at the end of the chosen one, under the section's name. A section other sections merge into stays its own, and nothing merges into a hidden section.
- Status boxes close up when one is hidden (the arrows follow).

## v2026.10.15.9

- **When in standby or off** (Card & sections → Power & standby, YAML `when_off`): **Hide the entire card**, **Collapse to the header** (default, as before) or **Keep expanded** — the last shows every section in standby too. Replaces the "Show the card while off" checkbox; `show_when_off: false` from older configs is read as `hide`.
- **The card editor always shows the card expanded** — in standby, with *Hide* or *Collapse*, and with *Start collapsed* — so every section can be set up. This no longer depends on Home Assistant passing an edit/preview flag to the card.

## v2026.10.15.8

- **Every section can be moved, the status area included** (Card & sections → Sections, ↑ / ↓ on the Status row too). YAML: `section_order` now includes `status`. An order saved by v2026.10.15.6 / .7 (without `status`) keeps status on top.

## v2026.10.15.7

- **Eye icons instead of checkboxes** for show/hide, per the design guide (same as the Lumagen and JVC cards). The **Sections** list is now one row per section — its icon, name, ↑ / ↓, **Open** (start open) and an eye. The status row stays pinned on top and carries eyes for the audio flow, video flow and channel layout; Volume's row has a **Collapsible** toggle (and Open once it is collapsible). The separate "Other section options" and "Start open" lists are gone. The **Chips** panel uses an eye per chip. Hidden rows are dimmed; **Reset to default order** appears once the order changes.

## v2026.10.15.6

- **Reorder the sections.** Card & sections → Sections now lists every body section with ▲ / ▼ buttons; the order you set is the order they render. The status area stays pinned on top. Saved as `section_order` (only when it differs from the default). The per-section show / hide checkboxes live on the same rows.
- **Channel count on the audio format.** Where the source reports an `X.Y.Z` layout (e.g. 7.1.4), the Source audio box, the optional Output layout line and the Info row now show the total channel count too (`7.1.4 · 12 ch`). Non-layout formats (Dolby Atmos, PCM…) are unchanged. The processor does not expose an output speaker layout (only an opaque config ID), so the readable count is taken from the source format.

## v2026.10.14.5

- **Volume** is its own block (slider, − / +, Mute, Dim) right under the status, always shown. `volume_collapsible: true` makes it a collapsible section instead.
- **Audio flow shows the encoding at input and output.** Source audio: what the source sends (Dolby Atmos, DTS:X, PCM…). Processing: *Native*, *Upmix* or *Downmix*, plus the effects that are on (Dolby mode, SphereAudio, Auro, Loudness, StormXT). Output: what the processor renders — the source's format when decoding natively, the upmixer (Dolby Surround, DTS Neural:X, Auro-Matic) when upmixing, Stereo for a downmix — with the volume.
- The speaker layout (7.1.4) under Output is now optional: `show_speaker_layout` (off by default).
- **Audio** section is now the everyday settings: Loudness, trims & enhance, LFE Dim. Dolby mode, SphereAudio, Auro preset, DRC, IMAX and the Dolby Virtualizer / Dialog Norm / Center Spread options moved to a new **Decoding & effects** section (`show_decoding`).
- A setting with no options (e.g. SphereAudio without its license) no longer leaves an empty labelled row.
- LFE Dim had no icon.
- Listening's collapsed header shows source and surround mode (volume has its own block).

## v2026.10.14.4

- Status is now two flows that can each be hidden (`show_audio_flow`, `show_video_flow`; Card & sections in the editor):
  - **Audio:** Source audio (stream type, channel format, sample rate, input) › Processing (surround mode, then Dolby mode / SphereAudio / Auro when on; "Not engaged with this source" in orange when the selected upmixer can't run on the content) › Output (active speaker layout, volume bar, volume or Muted).
  - **Video:** Video in (input, HDMI port, copy protection) › Signal (resolution, refresh rate, HDR) › Color (color space, depth, mode).
- Replaces the Source › Format › Video row.

## v2026.10.14.3

- Fix: on a real Home Assistant only the source showed; every other box, row and section stayed empty. The card matched entities by their unique ID, which Home Assistant doesn't give Dashboard cards. It now reads the unique IDs from the entity registry, and until then (or if that isn't allowed) matches the integration's default entity IDs (`sensor.stormaudio_isp_stream_type`…).

## v2026.10.14.2

- Fix: the card could stay on "Starting up…" after the processor had finished booting. The processor's main state stays "on" while it boots and only its detailed state changes, which the card didn't notice until something else changed.

## v2026.10.13.1

First release. Same design as the JVC Projector and Lumagen cards.

- Header: power button (tap to toggle on / standby) that shows the power state — starting up / shutting down (orange, pulsing); link dot; live summary (source · surround mode · stream type); red "Offline" when the integration can't reach the processor.
- Standby: collapses to a one-line bar instead of disappearing (option to hide the card instead; always shown while editing). Standby message below / inline / hidden or your own text, optional power button on the right.
- Status: Source (input, surround mode, Dolby mode) › Format (stream type, channel format, sample rate) › Video (resolution, refresh, color space). Tags: MUTED, STORM (surround mode engaged), STORMXT, video encoding, DIM, LINK DOWN.
- **Listening** section: large volume slider with − / +, Mute / Dim pills, source / preset / surround chips.
- **Audio** section: Dolby mode, SphereAudio, Auro, Loudness, DRC, IMAX chips; Bass / Treble / Center / Surround / LFE enhance / Brightness / Dialog / LipSync / Auro-strength sliders; Dolby Virtualizer / Dialog Norm / Center Spread / LFE Dim pills.
- **Video** section: resolution, refresh, encoding, color space / depth, mode, input, sync, copy protection (whichever sensors are enabled).
- **Zones** and **Triggers** sections: per-zone volume / mute / EQ / binaural and 12V triggers, discovered automatically from the device; shown only when those (disabled-by-default) entities are enabled.
- **Front panel** section: color (with a matching swatch), standby delay, active / standby brightness (StormAudio only).
- **Info** section: full device readout plus connection state and a note listing disabled entities you can enable.
- Readable names for the processor's values: surround modes (DTS Neural:X, Auro-Matic…), SphereAudio effects, and audio / video formats (Dolby TrueHD, DTS:X, PCM, HDR10, BT.2020, YCbCr 4:2:2, 10-bit, HDCP 2.2…). Values not in the list are shown as the device sends them.
- Resolves entities by the integration's `unique_id` suffixes (no `translation_key` in the integration), so renamed entity IDs keep working; disabled entities hide their rows / sections.
- Visual editor (Device · Card & sections · Chips · Icons · Appearance); byte-stable config (only non-default keys written).
