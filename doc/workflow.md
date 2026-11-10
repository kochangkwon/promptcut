# Workflow

Program flow for promptcut: module structure, processing flow, screen flow and error handling.

## Module structure

```
   ┌──────────────┐        ┌──────────────────┐
   │   UI (web)   │        │   AI planning    │
   │ list·preview │        │ Gemini call and  │
   │  ·timeline   │        │   validation     │
   └──────┬───────┘        └────────┬─────────┘
          │                         │
          ▼                         ▼
   ┌─────────────────────────────────────────┐
   │             Edit plan JSON              │
   │    the only contract between layers     │
   └──────┬───────────────────────┬──────────┘
          │                       │
          ▼                       ▼
   ┌──────────────┐        ┌──────────────────┐
   │    Engine    │        │     Storage      │
   │ ffmpeg calls │        │ SQLite·JSON file │
   └──────┬───────┘        └──────────────────┘
          │
          ▼
   ┌──────────────┐
   │ Finished mp4 │
   └──────────────┘
```

The UI and the AI planning layer each produce an edit plan JSON, and the engine reads nothing but that JSON. Swapping the AI provider or the UI technology therefore leaves the engine untouched.

## Processing flow

```
  Add video (probe metadata, build thumbnails)
        │
        ▼
  Enter request (describe the edit)  ◄──────┐
        │                                  │
        ▼                                  │ revise
  AI edit plan (review and adjust) ────────┘
        │
        ▼
  Render (join → captions → music)
        │
        ▼
  Finished mp4
```

ffmpeg only runs at two points: adding video and rendering. Everything in between changes the plan alone, which is cheap.

## Step detail

### 1. Add video

The user picks files or drops them in.

1. Files are not copied; only paths are stored. Originals are never modified.
2. ffprobe reads recording date, duration, resolution, rotation, frame rate, codecs and whether audio is present.
3. The result is written to `media_files`. If the same path is already stored with an unchanged mtime, the existing row is reused.
4. In the background, a poster thumbnail, a strip of timeline thumbnails and a low-resolution proxy are generated and recorded in `media_cache`.
5. The item appears in the list as soon as step 2 finishes; thumbnails fill in as they become available.

Files without a recording date fall back to file mtime, and the list marks the value as estimated.

### 2. Enter request

The user types an edit request. If a clip is selected, the request carries which clip it refers to.

What is sent to the AI:

- Per-video recording date, duration, resolution, orientation and file name
- Subject names and birth dates, for age captions
- The current edit plan
- The selected clip identifier
- The request text and prior conversation turns

No video frames and no video files are sent.

### 3. AI edit plan

1. The AI planning layer calls the selected provider.
2. The response is validated against the edit plan JSON schema. Malformed output, or a plan referring to a clip that does not exist, triggers a retry.
3. A plan that passes validation is shown to the user. Nothing renders automatically.
4. On confirmation the flow moves on; on a revision request it returns to step 2.
5. The call is logged in `ai_requests`, which feeds the usage readout in the status bar.

Clip in and out points and caption text can also be edited directly on the timeline. Those edits change the plan without calling the AI.

### 4. Render

The engine takes the edit plan JSON and processes it in order.

1. Trim each clip to its in and out points.
2. Normalize resolution, frame rate, codec and rotation to the output target. Silent clips get a generated audio track.
3. Join the clips. Mixed inputs cannot be stream-copied, so this re-encodes.
4. Apply transitions.
5. Burn in captions.
6. Apply color grading.
7. Mix background music and adjust source volume.
8. Write the output file.

A preview render runs the same pipeline at low resolution with fast settings. Progress and outcome are recorded in `render_jobs`.

## Screen flow

### Clicking a clip

1. The clip gets a selection outline.
2. The preview seeks to the clip's start, and the timeline playhead follows.
3. An inspector shows file name, recording date, duration, in and out points, caption text and an exclude button.
4. Subsequent chat requests are interpreted against this clip.

### Changing settings

Changing subjects, background music or caption style updates the plan and the timeline immediately. No video file is touched.

### Saving and loading a project

Projects are saved as JSON holding media paths, the edit plan, settings and a schema version. On load, a path with no file is shown as a missing clip and can be relinked.

## Error handling

| Situation | Handling |
|---|---|
| ffprobe cannot read metadata | List the file with a warning; fall back to file mtime for the date |
| No recording date | Use file mtime and mark the value as estimated |
| AI response fails schema validation | Retry; on repeated failure notify the user and leave the plan unchanged |
| AI free-tier quota exceeded | Report the error and when a retry is possible |
| ffmpeg fails mid-render | Show the failing clip and the error; keep the previous output |
| Source file moved or deleted | Show a missing clip; offer relink or exclude |
| Output path not writable | Prompt for a different location |

## Call ceiling

To stop a bug from looping the same request, the number of AI calls per edit operation is capped. On reaching the cap the operation stops and the user is told.
