# promptcut

Prompt-driven video editor for macOS — describe the edit, AI plans it, ffmpeg renders it.

## Status

Planning stage. No implementation yet.

## How it works

1. Add several video files. Originals stay where they are; only their paths are stored.
2. ffprobe reads the recording date, duration, resolution and rotation; thumbnails and a low-resolution proxy are generated.
3. Type a request in the chat panel, for example "join these in date order and add a date caption".
4. The AI returns an edit plan as JSON. Review it, then run it.
5. ffmpeg trims, joins, captions and mixes audio according to the plan, producing a new file.

Originals are never modified. Actual encoding happens only on preview render and export.

## Scope (first release)

- Automatic ordering by recording date, manual reordering, trimming
- Captions: date, age derived from a subject's birth date, free text
- Transitions, color grading, resolution and orientation normalization
- Background music with source-volume control
- Project save and load

## Technical direction

- Target: macOS (Apple Silicon)
- Engine: Python + ffmpeg, decoupled from the UI and runnable from the command line
- UI: web front end wired to a Python backend, packaged as a Mac app
- AI: pluggable provider. First provider is the Google AI Studio (Gemini) free API

## Design principles

- The edit plan JSON is the only contract between the engine and every other layer. The UI, the AI layer and the command line all produce that JSON, and the engine reads nothing else.
- Captions, transitions and color effects are separated so that adding one means adding a single file.
- The AI call site is isolated per provider, and every response is validated before use.
- Project files carry a schema version so older files stay readable.

## Privacy

Only metadata is sent to the AI: recording dates, durations, file names and subject details. Frame-level scene analysis, which would send extracted images, is deferred and will be opt-in.

## Documentation

- [`doc/plan.md`](doc/plan.md) — development order and known risks
- [`doc/workflow.md`](doc/workflow.md) — module structure, processing flow, error handling
- [`doc/db-schema.md`](doc/db-schema.md) — SQLite schema and ERD

## First use case

Joining pet videos in recording-date order into a keepsake film with date and age captions.
