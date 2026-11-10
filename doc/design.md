# Design

Design document for promptcut. The processing and screen flows live in [`workflow.md`](workflow.md); the storage layout lives in [`db-schema.md`](db-schema.md).

## Module boundaries

| Module | Responsibility | May depend on |
|---|---|---|
| `engine` | Turn an edit plan into a video file with ffmpeg | ffmpeg, the plan schema |
| `storage` | SQLite metadata and cache, project JSON read and write | SQLite, the plan schema |
| `planner` | Turn a request plus context into an edit plan, per AI provider | the plan schema, an HTTP client |
| `server` | HTTP and WebSocket endpoints the UI calls | engine, storage, planner |
| `ui` | Browser front end | nothing — it talks to `server` over HTTP |

The dependency arrows point one way. `engine` never imports `server`, `planner` or `storage`, which is what keeps it runnable from the command line and testable without a UI.

## The edit plan

[`../schema/edit-plan.schema.json`](../schema/edit-plan.schema.json) is the machine-readable contract; [`../example/edit-plan.example.json`](../example/edit-plan.example.json) is a complete example.

Shape:

```
plan
├─ schema_version      format version, so old files stay readable
├─ output              resolution, fps, fit, codec, quality
├─ subjects[]          name + birth date, for age captions
├─ title_card          optional opening card
├─ caption_styles{}    named styles referenced by captions
├─ clips[]             final playback order
│   ├─ source, in_ms, out_ms, speed, mute
│   ├─ recorded_at     drives date and age captions
│   ├─ captions[]      date | age | text, with timing and style_ref
│   └─ transition_out  into the next clip
├─ color_grade         warm | cool | vintage | mono
└─ audio               background music and source gain
```

Two decisions worth stating:

- **Clip order is the array order.** No separate sort field, so the plan cannot disagree with itself.
- **Timings inside a clip are relative to its trimmed start**, not to the film. Re-trimming a clip does not invalidate its captions.

### Validation beyond the schema

JSON Schema cannot express these, so the validator checks them separately. Every one of them is a plausible mistake for a language model to make, which is why they are enumerated rather than assumed:

1. `out_ms` is greater than `in_ms` on every clip.
2. `id` values are unique within `clips`, within `subjects`, and within each clip's `captions`.
3. Every `caption.subject_ids` entry exists in `subjects`.
4. Every `caption.style_ref` and `title_card.style_ref` exists in `caption_styles`.
5. A caption with `kind: "text"` has a non-empty `text`.
6. A caption with `kind: "age"` has at least one subject id, and every referenced clip has a non-null `recorded_at`.
7. A caption with `kind: "date"` sits on a clip with a non-null `recorded_at`.
8. `start_ms` is within the clip's trimmed length.
9. Every `source` path exists and is readable.
10. `in_ms` and `out_ms` are within the source's actual duration.

A plan that fails validation is never rendered. For AI output the layer retries; for UI edits the control is rejected with an inline message.

## Render pipeline

The engine processes a validated plan in a fixed order:

1. Trim each clip to `in_ms`–`out_ms`, applying `speed` if set.
2. Normalize resolution, frame rate, pixel format and rotation to `output`. Letterbox or crop per `fit`.
3. Give silent clips a generated audio track, so concatenation does not drift.
4. Concatenate, applying `transition_out` between neighbours.
5. Draw the title card, if present.
6. Burn in captions.
7. Apply `color_grade`.
8. Mix background music against the source audio at `source_gain_db`.
9. Encode to the output file.

Mixed inputs cannot be stream-copied, so steps 1–4 re-encode. This is the slowest part of the program and the first thing to optimise if renders feel long.

## Command-line contract

The engine runs without the UI:

```
python -m promptcut.engine render --plan plan.json --out film.mp4
python -m promptcut.engine render --plan plan.json --out preview.mp4 --preview
python -m promptcut.engine validate --plan plan.json
python -m promptcut.engine probe /path/to/video.mp4
```

- `--preview` renders at low resolution with fast settings.
- Exit code 0 on success, 1 on a validation error, 2 on an ffmpeg failure.
- Progress is written to stderr as `progress <percent>` lines, which the server forwards to the UI.

## Directory layout

```
promptcut/
├─ doc/                  documentation
├─ schema/               JSON Schema for the edit plan
├─ example/              example plan
├─ ui/                   browser front end (step 3)
│   ├─ index.html
│   ├─ app.css
│   ├─ app.js
│   └─ mock-data.js      stand-in data until the backend exists
├─ src/promptcut/        Python package (steps 4–7)
│   ├─ engine/
│   ├─ storage/
│   ├─ planner/
│   └─ server/
├─ tests/
└─ run.sh                serve the UI locally
```

## Running the UI locally

Requires Python 3 only; no install step and no backend yet.

```
./run.sh
```

This serves `ui/` on http://localhost:8765 and opens it. The UI runs on mock data, so no video files, API keys or ffmpeg are needed at this stage.

## Open decisions

- **Default output resolution.** 1920×1080 for now. Portrait-heavy sources may warrant choosing orientation from the majority of clips instead.
- **Transition implementation.** `xfade` is the straightforward route but forces a full re-encode across the boundary. Measure before committing.
- **Caption rendering.** ffmpeg's `drawtext` is simple but limited on line breaking for Korean text. Rendering captions to PNG with Pillow and overlaying them is the fallback.
