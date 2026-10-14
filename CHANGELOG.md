# Changelog

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
