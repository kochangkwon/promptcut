# Development plan

Development order and deliverables for promptcut.

## Order

### 1. Lock the technical stack

Record decisions already made:

- Target: macOS (Apple Silicon)
- Engine: Python + ffmpeg
- UI: web front end (HTML/CSS/JS) wired to a Python backend
- Data: SQLite for media metadata and cache, JSON files for edit plans and projects
- AI: pluggable provider; first provider is the Google AI Studio (Gemini) free API

### 2. Write the design document

- Edit plan JSON schema — the only contract between the engine and every other layer
- Module boundaries — engine, storage, AI planning, UI
- SQLite schema
- Processing workflow, from adding video to export
- Screen workflow — clip selection, chat request, plan review, render

### 3. Build the UI

A UI that works against mock data: clicks and panel switching functional, no backend yet.

- Media list, preview, chat panel, timeline
- Settings panels — subjects, background music, caption style
- Dark theme

### 4. Build the engine, with unit tests

- **Clip concatenation** — the core feature. Clips with differing resolution, frame rate, codec and rotation are normalized to one target and then joined. Silent clips get a generated audio track so sound does not drift. Mixed inputs cannot be stream-copied, so re-encoding is required and takes time.
- Ordering by recording date, manual order, trimming
- Captions — date, age, free text
- Transitions and color grading
- Background music with source-volume control
- Command-line entry point (JSON in, video out)
- Unit tests: join test clips that differ in resolution and orientation, then verify the result

### 5. Build the storage layer, with unit tests

- SQLite — media metadata, thumbnail and proxy cache
- JSON — edit plans and project files, carrying a schema version
- Unit tests: round-trip read and write, reading an older schema version

### 6. Build the AI planning layer, with unit tests

- Gemini API calls, isolated per provider
- Response validation and retry
- Rate-limit handling
- Payload limited to metadata: recording dates, durations, file names, subject details
- Unit tests: behaviour on malformed responses

### 7. Wire the UI to the backend

- File selection and path handover
- Progress, errors and API usage display
- Preview render and export

### 8. Package the Mac app

- Decide how ffmpeg is bundled
- Build script
- Document the unsigned-app warning on first launch

### 9. Integration testing with real footage

Run the whole flow on real video and fix what surfaces.

## Known risks

- **The engine is validated late.** Building the UI first means the riskiest part, step 4, is confirmed late. Problems with iPhone codecs or rotation metadata could shake the design. Moving the engine to step 3 is an option.
- **Preview fidelity.** Captions and color grading cannot be reflected live. The plan is to render a short low-resolution clip and play that instead.
- **AI quality is unverified.** Whether Gemini turns edit requests into correct plans has to be measured in step 6. If it falls short, swap providers.
- **Free-tier limits and terms can change.** Gemini free-tier quotas and data-use terms are subject to change.

## Record of order changes

The original order was: build UI, write design document, create DB, create workflow, choose language, develop, unit test. Three changes were made:

- Choosing the language moved to the front. The UI cannot be built before the language and approach are settled.
- Workflow creation folded into the design document. Kept separate, the two documents drift apart.
- Unit tests distributed to immediately after each layer is built. Deferred to the end, fixes cost far more.
