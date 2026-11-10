/**
 * promptcut UI — first version, mock data only.
 *
 * No backend, no ffmpeg, no AI call. The chat panel runs a local rule-based
 * stand-in for the planner (see mockPlanner) so the interaction can be
 * exercised end to end. Everything the real app would send to the engine is
 * produced by buildPlan(), which emits the documented edit plan JSON.
 */
'use strict';

/* ---------------------------------------------------------------- state */

const PX_PER_SEC_BASE = 3;
let uid = 0;
const nextId = (prefix) => `${prefix}${++uid}`;

const state = {
  projectName: MOCK.projectName,
  media: MOCK.media.map((m) => ({ ...m })),
  subjects: MOCK.subjects.map((s) => ({ ...s })),
  clips: [],
  captionStyle: {
    font_family: 'Apple SD Gothic Neo',
    font_size_px: 48,
    color: '#FFFFFF',
    position: 'bottom-center',
    margin_px: 64,
    shadow: true,
    fade_ms: 300
  },
  captions: { date: true, age: true },
  colorGrade: { kind: 'warm', intensity: 0.4 },
  transition: { kind: 'fade', duration_ms: 500 },
  audio: { music: { ...MOCK.music }, source_gain_db: -12 },
  output: { width: 1920, height: 1080, fps: 30, fit: 'contain', background: '#000000',
            video_codec: 'h264', audio_codec: 'aac', crf: 20, preset: 'veryfast' },
  selectedClipId: null,
  playheadMs: 0,
  zoom: 4,
  chat: [],
  pendingChange: null,
  render: { status: 'idle', percent: 0, kind: null },
  usage: { calls: 0 }
};

function makeClip(mediaId, inMs, outMs) {
  const media = state.media.find((m) => m.id === mediaId);
  const clip = {
    id: nextId('c'),
    mediaId,
    in_ms: inMs ?? 0,
    out_ms: outMs ?? (media ? media.duration_ms : 1000),
    speed: 1,
    mute: media ? !media.has_audio : false,
    text: null,
    captions: []
  };
  rebuildCaptions(clip);
  return clip;
}

/* ------------------------------------------------------------- helpers */

const mediaOf = (clip) => state.media.find((m) => m.id === clip.mediaId);
const clipLength = (clip) => Math.max(0, clip.out_ms - clip.in_ms);
const totalLength = () => state.clips.reduce((sum, c) => sum + clipLength(c), 0);

function clipStart(clip) {
  let acc = 0;
  for (const c of state.clips) {
    if (c.id === clip.id) return acc;
    acc += clipLength(c);
  }
  return acc;
}

function clipAt(ms) {
  let acc = 0;
  for (const c of state.clips) {
    const len = clipLength(c);
    if (ms < acc + len || c === state.clips[state.clips.length - 1]) {
      return { clip: c, offset: Math.max(0, ms - acc) };
    }
    acc += len;
  }
  return null;
}

function fmtTime(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function fmtDate(iso, format = 'YYYY.MM.DD') {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return format
    .replace('YYYY', String(d.getFullYear()))
    .replace('MM', String(d.getMonth() + 1).padStart(2, '0'))
    .replace('DD', String(d.getDate()).padStart(2, '0'));
}

/** Korean age label at a given date: "8살", or months while under one year. */
function ageLabel(birthDate, atIso) {
  if (!birthDate || !atIso) return '';
  const birth = new Date(`${birthDate}T00:00:00`);
  const at = new Date(atIso);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(at.getTime())) return '';
  let years = at.getFullYear() - birth.getFullYear();
  let months = at.getMonth() - birth.getMonth();
  if (at.getDate() < birth.getDate()) months -= 1;
  if (months < 0) { years -= 1; months += 12; }
  if (years < 0) return '';
  if (years === 0) return `${months}개월`;
  return `${years}살`;
}

/** Captions are regenerated from the current toggles plus any free text. */
function rebuildCaptions(clip) {
  const media = mediaOf(clip);
  const recordedAt = media ? media.recorded_at : null;
  const caps = [];
  if (state.captions.date && recordedAt) {
    caps.push({ id: nextId('cap'), kind: 'date', date_format: 'YYYY.MM.DD',
                start_ms: 0, duration_ms: 3000, style_ref: 'default' });
  }
  if (state.captions.age && recordedAt && state.subjects.length) {
    caps.push({ id: nextId('cap'), kind: 'age',
                subject_ids: state.subjects.map((s) => s.id),
                start_ms: state.captions.date ? 3200 : 0, duration_ms: 3000,
                style_ref: 'default' });
  }
  if (clip.text) {
    const start = Math.min(Math.max(0, clipLength(clip) - 5000), 8000);
    caps.push({ id: nextId('cap'), kind: 'text', text: clip.text,
                start_ms: start, duration_ms: 4000, style_ref: 'default' });
  }
  clip.captions = caps;
}

const rebuildAllCaptions = () => state.clips.forEach(rebuildCaptions);

function captionText(clip, cap) {
  const media = mediaOf(clip);
  const recordedAt = media ? media.recorded_at : null;
  if (cap.kind === 'date') return fmtDate(recordedAt, cap.date_format);
  if (cap.kind === 'text') return cap.text || '';
  if (cap.kind === 'age') {
    return (cap.subject_ids || [])
      .map((sid) => state.subjects.find((s) => s.id === sid))
      .filter(Boolean)
      .map((s) => `${s.name} ${ageLabel(s.birth_date, recordedAt)}`.trim())
      .filter((t) => t.length)
      .join(' · ');
  }
  return '';
}

function captionLabel(cap) {
  if (cap.kind === 'date') return '날짜';
  if (cap.kind === 'age') return '나이';
  return cap.text || '문구';
}

/* ------------------------------------------------------- the edit plan */

/** Emits the documented edit plan JSON — the contract the engine reads. */
function buildPlan() {
  const clips = state.clips.map((clip, i) => {
    const media = mediaOf(clip);
    const out = {
      id: clip.id,
      source: media ? media.path : '',
      in_ms: clip.in_ms,
      out_ms: clip.out_ms,
      speed: clip.speed,
      mute: clip.mute,
      recorded_at: media ? media.recorded_at : null,
      recorded_at_estimated: media ? !!media.recorded_at_estimated : false,
      captions: clip.captions.map((cap) => {
        const c = { id: cap.id, kind: cap.kind, start_ms: cap.start_ms,
                    duration_ms: cap.duration_ms, style_ref: cap.style_ref };
        if (cap.kind === 'date') c.date_format = cap.date_format;
        if (cap.kind === 'age') c.subject_ids = cap.subject_ids.slice();
        if (cap.kind === 'text') c.text = cap.text;
        return c;
      })
    };
    if (i < state.clips.length - 1 && state.transition.kind !== 'none') {
      out.transition_out = { ...state.transition };
    }
    return out;
  });

  return {
    schema_version: 1,
    output: { ...state.output },
    subjects: state.subjects.map((s) => ({ ...s })),
    caption_styles: { default: { ...state.captionStyle } },
    clips,
    color_grade: { ...state.colorGrade },
    audio: {
      music: state.audio.music && state.audio.music.source ? { ...state.audio.music } : null,
      source_gain_db: state.audio.source_gain_db
    }
  };
}

/** The cross-field checks from doc/design.md that run without disk access. */
function validatePlan(plan) {
  const errors = [];
  const seen = new Set();
  const subjectIds = new Set(plan.subjects.map((s) => s.id));

  if (!plan.clips.length) errors.push('클립이 없습니다.');

  plan.clips.forEach((clip, i) => {
    const where = `클립 ${i + 1}`;
    if (clip.out_ms <= clip.in_ms) errors.push(`${where}: out_ms가 in_ms보다 크지 않습니다.`);
    if (seen.has(clip.id)) errors.push(`${where}: 중복된 id (${clip.id}).`);
    seen.add(clip.id);
    if (!clip.source) errors.push(`${where}: source 경로가 비어 있습니다.`);

    const len = clip.out_ms - clip.in_ms;
    const capIds = new Set();
    clip.captions.forEach((cap) => {
      if (capIds.has(cap.id)) errors.push(`${where}: 중복된 자막 id (${cap.id}).`);
      capIds.add(cap.id);
      if (!plan.caption_styles[cap.style_ref]) {
        errors.push(`${where}: 존재하지 않는 자막 스타일 (${cap.style_ref}).`);
      }
      if (cap.start_ms >= len) errors.push(`${where}: 자막 시작이 클립 길이를 넘습니다.`);
      if (cap.kind === 'text' && !cap.text) errors.push(`${where}: 문구 자막에 text가 없습니다.`);
      if (cap.kind === 'age') {
        if (!cap.subject_ids || !cap.subject_ids.length) {
          errors.push(`${where}: 나이 자막에 피사체가 없습니다.`);
        }
        (cap.subject_ids || []).forEach((sid) => {
          if (!subjectIds.has(sid)) errors.push(`${where}: 존재하지 않는 피사체 (${sid}).`);
        });
        if (!clip.recorded_at) errors.push(`${where}: 촬영일이 없어 나이를 계산할 수 없습니다.`);
      }
      if (cap.kind === 'date' && !clip.recorded_at) {
        errors.push(`${where}: 촬영일이 없어 날짜 자막을 넣을 수 없습니다.`);
      }
    });
  });

  return errors;
}

/* -------------------------------------------------------- mock planner */

const ORDINALS = { '첫': 1, '두': 2, '세': 3, '네': 4, '다섯': 5, '여섯': 6 };

/**
 * Rule-based stand-in for the AI planning layer. Returns a proposal the user
 * confirms, mirroring the real flow: nothing is applied without confirmation.
 */
function mockPlanner(text) {
  const t = text.trim();
  const steps = [];
  const actions = [];

  if (/(시간순|날짜순|촬영일|시간 순|정렬)/.test(t)) {
    steps.push('클립을 촬영일 순서로 정렬');
    actions.push(() => {
      state.clips.sort((a, b) => {
        const am = mediaOf(a), bm = mediaOf(b);
        return new Date(am ? am.recorded_at : 0) - new Date(bm ? bm.recorded_at : 0);
      });
    });
  }

  if (/역순|거꾸로|최신순/.test(t)) {
    steps.push('클립 순서를 뒤집기');
    actions.push(() => state.clips.reverse());
  }

  const removeMatch = t.match(/(\d+|첫|두|세|네|다섯|여섯)\s*(?:번째|째)?\s*(?:영상|클립)?[^.]*?(빼|제외|삭제|지워)/);
  if (removeMatch) {
    const raw = removeMatch[1];
    const index = (ORDINALS[raw] || parseInt(raw, 10)) - 1;
    if (index >= 0 && index < state.clips.length) {
      steps.push(`${index + 1}번째 클립 제외`);
      const id = state.clips[index].id;
      actions.push(() => {
        state.clips = state.clips.filter((c) => c.id !== id);
        if (state.selectedClipId === id) state.selectedClipId = null;
      });
    } else {
      steps.push(`${index + 1}번째 클립을 찾지 못했습니다`);
    }
  }

  if (/자막.*(크게|키워)|(크게|키워).*자막/.test(t)) {
    steps.push('자막 크기 키우기');
    actions.push(() => {
      state.captionStyle.font_size_px = Math.min(120, state.captionStyle.font_size_px + 10);
    });
  }
  if (/자막.*(작게|줄여)|(작게|줄여).*자막/.test(t)) {
    steps.push('자막 크기 줄이기');
    actions.push(() => {
      state.captionStyle.font_size_px = Math.max(20, state.captionStyle.font_size_px - 10);
    });
  }
  if (/날짜.*자막|자막.*날짜/.test(t) && !/(빼|제외|없)/.test(t)) {
    steps.push('날짜 자막 켜기');
    actions.push(() => { state.captions.date = true; rebuildAllCaptions(); });
  }
  if (/나이.*자막|자막.*나이|나이 표시/.test(t) && !/(빼|제외|없)/.test(t)) {
    steps.push('나이 자막 켜기');
    actions.push(() => { state.captions.age = true; rebuildAllCaptions(); });
  }
  if (/자막.*(빼|없애|없이|제외)/.test(t)) {
    steps.push('자막 끄기');
    actions.push(() => {
      state.captions.date = false; state.captions.age = false; rebuildAllCaptions();
    });
  }

  const grades = [
    [/따뜻|웜/, 'warm', '따뜻한 톤'],
    [/차분|차갑|쿨/, 'cool', '차분한 톤'],
    [/빈티지|옛날|레트로/, 'vintage', '빈티지'],
    [/흑백|모노/, 'mono', '흑백'],
    [/원본 색|색감 없|보정 없/, 'none', '원본 색감']
  ];
  for (const [re, kind, label] of grades) {
    if (re.test(t)) {
      steps.push(`색감: ${label}`);
      actions.push(() => { state.colorGrade.kind = kind; });
      break;
    }
  }

  if (/전환.*(없|빼)/.test(t)) {
    steps.push('전환 효과 없음');
    actions.push(() => { state.transition = { kind: 'none', duration_ms: 0 }; });
  } else if (/전환|페이드|디졸브|부드럽게/.test(t)) {
    const kind = /디졸브/.test(t) ? 'dissolve' : 'fade';
    steps.push(`전환 효과: ${kind === 'dissolve' ? '디졸브' : '부드럽게 사라짐'} 0.5초`);
    actions.push(() => { state.transition = { kind, duration_ms: 500 }; });
  }

  if (/음악.*(크게|키워)/.test(t)) {
    steps.push('음악 음량 올리기');
    actions.push(() => {
      state.audio.music.gain_db = Math.min(6, state.audio.music.gain_db + 3);
    });
  }
  if (/음악.*(작게|줄여)/.test(t)) {
    steps.push('음악 음량 내리기');
    actions.push(() => {
      state.audio.music.gain_db = Math.max(-30, state.audio.music.gain_db - 3);
    });
  }
  if (/(원본 소리|원본 음량).*(빼|없애|끄)|무음/.test(t)) {
    steps.push('원본 소리 끄기');
    actions.push(() => { state.audio.source_gain_db = -60; });
  }

  if (/세로/.test(t)) {
    steps.push('세로 1080 × 1920 출력');
    actions.push(() => { state.output.width = 1080; state.output.height = 1920; });
  } else if (/가로/.test(t)) {
    steps.push('가로 1920 × 1080 출력');
    actions.push(() => { state.output.width = 1920; state.output.height = 1080; });
  }

  if (!steps.length) {
    return {
      reply: '요청을 해석하지 못했습니다. 이 버전은 AI 없이 규칙으로만 동작합니다.\n' +
             '예: "시간순으로 정렬해 줘", "3번째 영상 빼 줘", "자막 크게", "따뜻한 톤으로", "음악 작게"',
      steps: null,
      apply: null
    };
  }

  return {
    reply: null,
    steps,
    apply: () => actions.forEach((fn) => fn())
  };
}

/* ----------------------------------------------------------------- DOM */

const $ = (id) => document.getElementById(id);
const el = {
  projectName: $('projectName'),
  mediaList: $('mediaList'),
  subjectRows: $('subjectRows'),
  subjectsSummary: $('subjectsSummary'),
  musicSummary: $('musicSummary'),
  captionSummary: $('captionSummary'),
  outputSummary: $('outputSummary'),
  monitorFrame: $('monitorFrame'),
  monitorEmpty: $('monitorEmpty'),
  monitorCaption: $('monitorCaption'),
  timeLeft: $('timeLeft'),
  timeRight: $('timeRight'),
  inspector: $('inspector'),
  chatLog: $('chatLog'),
  chatForm: $('chatForm'),
  chatInput: $('chatInput'),
  ruler: $('ruler'),
  trackVideo: $('trackVideo'),
  trackCaption: $('trackCaption'),
  trackMusic: $('trackMusic'),
  trackArea: $('trackArea'),
  trackScroll: $('trackScroll'),
  playhead: $('playhead'),
  statusLeft: $('statusLeft'),
  statusRight: $('statusRight'),
  planDialog: $('planDialog'),
  planJson: $('planJson'),
  planValidation: $('planValidation'),
  btnPlay: $('btnPlay')
};

const pxPerMs = () => (PX_PER_SEC_BASE * state.zoom) / 1000;

/* ------------------------------------------------------------- renders */

function renderAll() {
  renderMediaList();
  renderSettings();
  renderTimeline();
  renderPreview();
  renderInspector();
  renderStatus();
}

function renderMediaList() {
  const used = new Set(state.clips.map((c) => c.mediaId));
  el.mediaList.replaceChildren(...state.media.map((m) => {
    const clip = state.clips.find((c) => c.mediaId === m.id);
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'media-item';
    if (clip && clip.id === state.selectedClipId) item.classList.add('selected');
    if (!used.has(m.id)) item.classList.add('unused');
    item.innerHTML = `
      <div class="media-thumb" style="background:${m.color}">
        <span class="media-dur">${fmtTime(m.duration_ms)}</span>
      </div>
      <div class="media-meta">
        <span>${fmtDate(m.recorded_at)}${m.recorded_at_estimated ? ' <span class="est">추정</span>' : ''}</span>
        <span>${m.width}×${m.height}</span>
      </div>`;
    item.title = `${m.name}\n${m.path}\n${m.video_codec} · ${m.fps}fps${m.has_audio ? '' : ' · 무음'}`;
    item.addEventListener('click', () => {
      if (clip) selectClip(clip.id);
      else addClipFromMedia(m.id);
    });
    return item;
  }));
}

function renderSettings() {
  el.projectName.textContent = state.projectName;
  el.subjectsSummary.textContent = `${state.subjects.length}명`;
  el.musicSummary.textContent = state.audio.music.source
    ? state.audio.music.source.split('/').pop() : '없음';
  const on = [];
  if (state.captions.date) on.push('날짜');
  if (state.captions.age) on.push('나이');
  el.captionSummary.textContent = on.length ? on.join(' · ') : '끄기';
  el.outputSummary.textContent = `${state.output.width}×${state.output.height}`;

  $('musicPath').value = state.audio.music.source || '';
  $('musicGain').value = state.audio.music.gain_db;
  $('musicGainOut').textContent = `${state.audio.music.gain_db} dB`;
  $('sourceGain').value = state.audio.source_gain_db;
  $('sourceGainOut').textContent = `${state.audio.source_gain_db} dB`;
  $('fontSize').value = state.captionStyle.font_size_px;
  $('fontSizeOut').textContent = `${state.captionStyle.font_size_px} px`;
  $('captionPosition').value = state.captionStyle.position;
  $('capDate').checked = state.captions.date;
  $('capAge').checked = state.captions.age;
  $('outputSize').value = `${state.output.width}x${state.output.height}`;
  $('colorGrade').value = state.colorGrade.kind;
  $('transition').value = state.transition.kind;

  el.subjectRows.replaceChildren(...state.subjects.map((s) => {
    const row = document.createElement('div');
    row.className = 'subject-row';
    const name = document.createElement('input');
    name.type = 'text'; name.value = s.name; name.placeholder = '이름';
    name.ariaLabel = '피사체 이름';
    name.addEventListener('change', () => { s.name = name.value; rebuildAllCaptions(); renderAll(); });
    const birth = document.createElement('input');
    birth.type = 'text'; birth.value = s.birth_date; birth.placeholder = 'YYYY-MM-DD';
    birth.ariaLabel = '생일';
    birth.addEventListener('change', () => { s.birth_date = birth.value; rebuildAllCaptions(); renderAll(); });
    const del = document.createElement('button');
    del.type = 'button'; del.textContent = '×'; del.ariaLabel = '피사체 삭제';
    del.addEventListener('click', () => {
      state.subjects = state.subjects.filter((x) => x.id !== s.id);
      rebuildAllCaptions(); renderAll();
    });
    row.append(name, birth, del);
    return row;
  }));
}

function renderTimeline() {
  const total = totalLength();
  const scale = pxPerMs();
  const width = Math.max(total * scale, 10);
  el.trackArea.style.width = `${width}px`;

  // ruler: pick a tick step that keeps labels ~70px apart
  const candidates = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  const stepSec = candidates.find((s) => s * 1000 * scale >= 70) || 600;
  const ticks = [];
  for (let sec = 0; sec * 1000 <= total; sec += stepSec) {
    const tick = document.createElement('span');
    tick.className = 'tick';
    tick.style.left = `${sec * 1000 * scale}px`;
    tick.textContent = fmtTime(sec * 1000);
    ticks.push(tick);
  }
  el.ruler.replaceChildren(...ticks);

  el.trackVideo.replaceChildren(...state.clips.map((clip) => {
    const media = mediaOf(clip);
    const len = clipLength(clip);
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'tl-clip';
    if (clip.id === state.selectedClipId) node.classList.add('selected');
    node.style.left = `${clipStart(clip) * scale}px`;
    node.style.width = `${Math.max(len * scale, 8)}px`;
    const segments = Math.max(1, Math.round((len * scale) / 60));
    const strips = Array.from({ length: segments }, (_, i) => {
      const shade = i % 2 ? 'brightness(1.12)' : 'brightness(0.94)';
      return `<span class="strip" style="background:${media ? media.color : '#444'};filter:${shade}"></span>`;
    }).join('');
    node.innerHTML = `${strips}
      <span class="clip-label">${media ? fmtDate(media.recorded_at) : '?'} · ${fmtTime(len)}</span>
      ${clip.mute ? '<span class="clip-mute">무음</span>' : ''}`;
    node.addEventListener('click', (e) => {
      e.stopPropagation();
      selectClip(clip.id);
      setPlayhead(clipStart(clip));
    });
    return node;
  }));

  const capNodes = [];
  state.clips.forEach((clip) => {
    const base = clipStart(clip);
    clip.captions.forEach((cap) => {
      const len = cap.duration_ms || (clipLength(clip) - cap.start_ms);
      const node = document.createElement('div');
      node.className = 'tl-caption';
      node.style.left = `${(base + cap.start_ms) * scale}px`;
      node.style.width = `${Math.max(len * scale, 20)}px`;
      node.textContent = captionLabel(cap);
      node.title = captionText(clip, cap);
      capNodes.push(node);
    });
  });
  el.trackCaption.replaceChildren(...capNodes);

  if (state.audio.music.source && total > 0) {
    const node = document.createElement('div');
    node.className = 'tl-music';
    node.style.width = `${width}px`;
    const bars = Array.from({ length: Math.max(4, Math.floor(width / 7)) }, (_, i) => {
      const h = 8 + Math.round(Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.23)) * 26);
      return `<i style="height:${Math.min(h, 34)}px"></i>`;
    }).join('');
    node.innerHTML = `<span class="music-name">${state.audio.music.source.split('/').pop()}</span>
                      <span class="bars">${bars}</span>`;
    el.trackMusic.replaceChildren(node);
  } else {
    const hint = document.createElement('span');
    hint.className = 'empty-hint';
    hint.textContent = '배경음악 없음';
    el.trackMusic.replaceChildren(hint);
  }

  renderPlayhead();
}

function renderPlayhead() {
  el.playhead.style.left = `${state.playheadMs * pxPerMs()}px`;
}

function renderPreview() {
  const total = totalLength();
  const found = total > 0 ? clipAt(state.playheadMs) : null;
  el.monitorFrame.classList.toggle('portrait', state.output.height > state.output.width);

  if (!found) {
    el.monitorEmpty.hidden = false;
    el.monitorFrame.style.background = '#15151a';
    el.monitorCaption.textContent = '';
    el.timeLeft.textContent = '0:00 / 0:00';
    el.timeRight.textContent = '';
    return;
  }

  el.monitorEmpty.hidden = true;
  const media = mediaOf(found.clip);
  el.monitorFrame.style.background = media ? media.color : '#15151a';

  const lines = found.clip.captions
    .filter((cap) => {
      const end = cap.duration_ms ? cap.start_ms + cap.duration_ms : clipLength(found.clip);
      return found.offset >= cap.start_ms && found.offset < end;
    })
    .map((cap) => captionText(found.clip, cap))
    .filter((t) => t.length);

  el.monitorCaption.className = `monitor-caption pos-${state.captionStyle.position}`;
  el.monitorCaption.textContent = lines.join('\n');
  // 48px of a 1080-tall frame, scaled to however wide the monitor is drawn
  const rect = el.monitorFrame.getBoundingClientRect();
  const scale = rect.height ? rect.height / state.output.height : 0.3;
  el.monitorCaption.style.fontSize = `${Math.max(9, state.captionStyle.font_size_px * scale)}px`;

  el.timeLeft.textContent = `${fmtTime(state.playheadMs)} / ${fmtTime(total)}`;
  el.timeRight.textContent = media ? media.name : '';
}

function renderInspector() {
  const clip = state.clips.find((c) => c.id === state.selectedClipId);
  if (!clip) {
    el.inspector.innerHTML = '<p class="inspector-empty">클립을 선택하면 구간과 자막을 고칠 수 있습니다.</p>';
    return;
  }
  const media = mediaOf(clip);
  const index = state.clips.indexOf(clip);

  el.inspector.innerHTML = `
    <div class="inspector-title">${index + 1}. ${media ? media.name : '?'}</div>
    <div class="inspector-grid">
      <label class="field"><span>시작 (초)</span>
        <input type="number" class="w-sm" id="inIn" min="0" step="0.1" value="${(clip.in_ms / 1000).toFixed(1)}"></label>
      <label class="field"><span>끝 (초)</span>
        <input type="number" class="w-sm" id="inOut" min="0" step="0.1" value="${(clip.out_ms / 1000).toFixed(1)}"></label>
      <label class="field"><span>자막 문구</span>
        <input type="text" class="w-md" id="inText" placeholder="예: 첫 산책 날" value="${clip.text ? clip.text.replace(/"/g, '&quot;') : ''}"></label>
      <label class="check"><input type="checkbox" id="inMute" ${clip.mute ? 'checked' : ''}> 소리 끄기</label>
      <button type="button" class="btn btn-xs" id="btnUp" ${index === 0 ? 'disabled' : ''}>앞으로</button>
      <button type="button" class="btn btn-xs" id="btnDown" ${index === state.clips.length - 1 ? 'disabled' : ''}>뒤로</button>
      <button type="button" class="btn btn-xs" id="btnDrop">제외</button>
    </div>
    <p class="inspector-note">
      원본 ${media ? `${fmtTime(media.duration_ms)} · ${media.width}×${media.height} · ${media.video_codec} · ${media.fps}fps` : '?'}
      ${media && media.rotation ? ` · 회전 ${media.rotation}°` : ''}
      ${media && !media.has_audio ? ' · 무음 원본' : ''}
      ${media && media.recorded_at_estimated ? ' · 촬영일 추정값' : ''}
    </p>`;

  const inIn = $('inIn'), inOut = $('inOut');
  inIn.addEventListener('change', () => {
    const v = Math.max(0, Math.round(parseFloat(inIn.value || '0') * 1000));
    clip.in_ms = Math.min(v, clip.out_ms - 100);
    rebuildCaptions(clip); renderAll();
  });
  inOut.addEventListener('change', () => {
    const max = media ? media.duration_ms : clip.out_ms;
    const v = Math.round(parseFloat(inOut.value || '0') * 1000);
    clip.out_ms = Math.max(clip.in_ms + 100, Math.min(v, max));
    rebuildCaptions(clip); renderAll();
  });
  $('inText').addEventListener('change', (e) => {
    clip.text = e.target.value.trim() || null;
    rebuildCaptions(clip); renderAll();
  });
  $('inMute').addEventListener('change', (e) => { clip.mute = e.target.checked; renderTimeline(); });
  $('btnUp').addEventListener('click', () => moveClip(clip.id, -1));
  $('btnDown').addEventListener('click', () => moveClip(clip.id, 1));
  $('btnDrop').addEventListener('click', () => {
    state.clips = state.clips.filter((c) => c.id !== clip.id);
    state.selectedClipId = null;
    clampPlayhead(); renderAll();
  });
}

function renderStatus() {
  const total = totalLength();
  const r = state.render;
  let left = `클립 ${state.clips.length}개 · 총 ${fmtTime(total)}`;
  if (r.status === 'running') {
    left += ` · ${r.kind === 'preview' ? '미리보기' : '내보내기'} ${r.percent}%` +
            `<span class="progress"><i style="width:${r.percent}%"></i></span>`;
  } else if (r.status === 'done') {
    left += ` · ${r.kind === 'preview' ? '미리보기' : '내보내기'} 완료 (mock)`;
  }
  el.statusLeft.innerHTML = left;
  el.statusRight.textContent = `AI 호출 ${state.usage.calls}회 · mock planner (API 미연결)`;
}

/* ------------------------------------------------------------ chat log */

function pushChat(entry) {
  state.chat.push(entry);
  renderChat();
}

function renderChat() {
  const nodes = state.chat.map((entry) => {
    if (entry.type === 'me' || entry.type === 'sys') {
      const b = document.createElement('div');
      b.className = `bubble ${entry.type}`;
      b.textContent = entry.text;
      return b;
    }
    const card = document.createElement('div');
    card.className = 'plan-card' + (entry.applied ? ' applied' : '');
    const list = entry.steps.map((s) => `<li>${s}</li>`).join('');
    card.innerHTML = `<h3>편집 계획</h3><ul>${list}</ul>`;
    if (entry.applied) {
      const tag = document.createElement('p');
      tag.className = 'applied-tag';
      tag.textContent = entry.applied === 'cancelled' ? '취소했습니다' : '적용했습니다';
      card.append(tag);
    } else {
      const actions = document.createElement('div');
      actions.className = 'plan-actions';
      const ok = document.createElement('button');
      ok.type = 'button'; ok.className = 'btn btn-xs btn-primary'; ok.textContent = '이대로 적용';
      ok.addEventListener('click', () => {
        entry.apply();
        entry.applied = 'applied';
        state.pendingChange = null;
        clampPlayhead();
        renderAll();
        renderChat();
      });
      const no = document.createElement('button');
      no.type = 'button'; no.className = 'btn btn-xs'; no.textContent = '취소';
      no.addEventListener('click', () => {
        entry.applied = 'cancelled';
        state.pendingChange = null;
        renderChat();
      });
      actions.append(ok, no);
      card.append(actions);
    }
    return card;
  });
  el.chatLog.replaceChildren(...nodes);
  el.chatLog.scrollTop = el.chatLog.scrollHeight;
}

/* ------------------------------------------------------------- actions */

function selectClip(id) {
  state.selectedClipId = id;
  renderMediaList();
  renderTimeline();
  renderInspector();
}

function addClipFromMedia(mediaId) {
  const clip = makeClip(mediaId);
  state.clips.push(clip);
  state.selectedClipId = clip.id;
  renderAll();
}

function moveClip(id, delta) {
  const i = state.clips.findIndex((c) => c.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= state.clips.length) return;
  [state.clips[i], state.clips[j]] = [state.clips[j], state.clips[i]];
  renderAll();
}

function setPlayhead(ms) {
  state.playheadMs = Math.max(0, Math.min(ms, totalLength()));
  renderPlayhead();
  renderPreview();
}

function clampPlayhead() {
  state.playheadMs = Math.max(0, Math.min(state.playheadMs, totalLength()));
}

let playing = false;
let lastFrame = 0;

function togglePlay() {
  playing = !playing;
  el.btnPlay.textContent = playing ? '❚❚' : '▶';
  el.btnPlay.ariaLabel = playing ? '일시정지' : '재생';
  if (playing) {
    lastFrame = performance.now();
    requestAnimationFrame(step);
  }
}

function step(now) {
  if (!playing) return;
  const dt = now - lastFrame;
  lastFrame = now;
  const total = totalLength();
  let next = state.playheadMs + dt;
  if (next >= total) { next = total; playing = false; el.btnPlay.textContent = '▶'; }
  setPlayhead(next);
  if (playing) requestAnimationFrame(step);
}

/** Stand-in for a render: the real thing shells out to ffmpeg. */
function fakeRender(kind) {
  if (!state.clips.length) {
    pushChat({ type: 'sys', text: '클립이 없어 렌더할 수 없습니다.' });
    return;
  }
  const errors = validatePlan(buildPlan());
  if (errors.length) {
    pushChat({ type: 'sys', text: `편집 계획에 문제가 있어 중단했습니다.\n- ${errors.join('\n- ')}` });
    return;
  }
  state.render = { status: 'running', percent: 0, kind };
  renderStatus();
  const timer = setInterval(() => {
    state.render.percent = Math.min(100, state.render.percent + 7);
    if (state.render.percent >= 100) {
      clearInterval(timer);
      state.render.status = 'done';
      pushChat({
        type: 'sys',
        text: kind === 'preview'
          ? '미리보기 렌더를 마쳤습니다. (mock — 실제 ffmpeg는 4단계에서 붙습니다)'
          : 'mp4 내보내기를 마쳤습니다. (mock — 실제 파일은 생성되지 않았습니다)'
      });
    }
    renderStatus();
  }, 120);
}

/* -------------------------------------------------------------- events */

el.chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = el.chatInput.value.trim();
  if (!text) return;
  el.chatInput.value = '';
  pushChat({ type: 'me', text });
  state.usage.calls += 1;
  renderStatus();

  const result = mockPlanner(text);
  if (!result.steps) {
    pushChat({ type: 'sys', text: result.reply });
    return;
  }
  pushChat({ type: 'plan', steps: result.steps, apply: result.apply, applied: null });
});

el.trackScroll.addEventListener('click', (e) => {
  if (e.target.closest('.tl-clip')) return;
  const rect = el.trackArea.getBoundingClientRect();
  setPlayhead((e.clientX - rect.left) / pxPerMs());
});

$('btnPlay').addEventListener('click', togglePlay);
$('btnPrev').addEventListener('click', () => {
  const found = clipAt(state.playheadMs);
  if (!found) return;
  const i = state.clips.indexOf(found.clip);
  if (found.offset > 500 || i === 0) setPlayhead(clipStart(found.clip));
  else setPlayhead(clipStart(state.clips[i - 1]));
});
$('btnNext').addEventListener('click', () => {
  const found = clipAt(state.playheadMs);
  if (!found) return;
  const i = state.clips.indexOf(found.clip);
  if (i < state.clips.length - 1) setPlayhead(clipStart(state.clips[i + 1]));
  else setPlayhead(totalLength());
});

$('zoom').addEventListener('input', (e) => {
  state.zoom = parseInt(e.target.value, 10);
  renderTimeline();
});
$('btnZoomIn').addEventListener('click', () => {
  state.zoom = Math.min(12, state.zoom + 1);
  $('zoom').value = state.zoom;
  renderTimeline();
});
$('btnZoomOut').addEventListener('click', () => {
  state.zoom = Math.max(1, state.zoom - 1);
  $('zoom').value = state.zoom;
  renderTimeline();
});

$('btnAddMedia').addEventListener('click', () => {
  pushChat({
    type: 'sys',
    text: '파일 선택은 백엔드가 붙는 7단계에서 동작합니다. 지금은 왼쪽 목록의 ' +
          '목 데이터를 클릭해 타임라인에 올릴 수 있습니다.'
  });
});

$('btnAddSubject').addEventListener('click', () => {
  state.subjects.push({ id: nextId('s'), name: '새 피사체', birth_date: '2020-01-01' });
  rebuildAllCaptions();
  renderAll();
});

$('musicPath').addEventListener('change', (e) => {
  state.audio.music.source = e.target.value.trim();
  renderAll();
});
$('musicGain').addEventListener('input', (e) => {
  state.audio.music.gain_db = parseInt(e.target.value, 10);
  $('musicGainOut').textContent = `${state.audio.music.gain_db} dB`;
});
$('sourceGain').addEventListener('input', (e) => {
  state.audio.source_gain_db = parseInt(e.target.value, 10);
  $('sourceGainOut').textContent = `${state.audio.source_gain_db} dB`;
});
$('fontSize').addEventListener('input', (e) => {
  state.captionStyle.font_size_px = parseInt(e.target.value, 10);
  $('fontSizeOut').textContent = `${state.captionStyle.font_size_px} px`;
  renderPreview();
});
$('captionPosition').addEventListener('change', (e) => {
  state.captionStyle.position = e.target.value;
  renderPreview();
});
$('capDate').addEventListener('change', (e) => {
  state.captions.date = e.target.checked;
  rebuildAllCaptions(); renderAll();
});
$('capAge').addEventListener('change', (e) => {
  state.captions.age = e.target.checked;
  rebuildAllCaptions(); renderAll();
});
$('outputSize').addEventListener('change', (e) => {
  const [w, h] = e.target.value.split('x').map(Number);
  state.output.width = w; state.output.height = h;
  renderAll();
});
$('colorGrade').addEventListener('change', (e) => {
  state.colorGrade.kind = e.target.value;
  renderSettings();
});
$('transition').addEventListener('change', (e) => {
  state.transition = { kind: e.target.value, duration_ms: e.target.value === 'none' ? 0 : 500 };
  renderSettings();
});

$('btnPreview').addEventListener('click', () => fakeRender('preview'));
$('btnExport').addEventListener('click', () => fakeRender('export'));

$('btnPlanJson').addEventListener('click', () => {
  const plan = buildPlan();
  const errors = validatePlan(plan);
  el.planJson.textContent = JSON.stringify(plan, null, 2);
  el.planValidation.className = `dialog-note ${errors.length ? 'bad' : 'ok'}`;
  el.planValidation.textContent = errors.length
    ? `검증 실패 ${errors.length}건\n- ${errors.join('\n- ')}`
    : '검증 통과 — schema/edit-plan.schema.json 및 doc/design.md의 교차 검증 규칙';
  el.planDialog.showModal();
});
$('btnClosePlan').addEventListener('click', () => el.planDialog.close());

document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea')) return;
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
});

window.addEventListener('resize', renderPreview);

/* ---------------------------------------------------------------- init */

// Built here rather than beside the state literal: makeClip reaches for the
// helpers below it, which are const and would still be in their dead zone.
state.clips = MOCK.clips.map((c) => makeClip(c.mediaId, c.in_ms, c.out_ms));

pushChat({
  type: 'sys',
  text: '1차 버전입니다. AI는 아직 연결되지 않았고, 규칙 기반 mock planner가 대신 동작합니다.\n' +
        '예: "시간순으로 정렬해 줘", "3번째 영상 빼 줘", "자막 크게", "따뜻한 톤으로"'
});
renderAll();
