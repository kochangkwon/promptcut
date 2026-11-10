/**
 * Stand-in data for the UI until the backend exists.
 *
 * In the real app these rows come from the `media_files` table, filled in by
 * ffprobe when a file is added. `color` is only here because there are no real
 * thumbnails yet: it tints the placeholder so clips are distinguishable.
 */
window.MOCK = {
  projectName: 'Our years together',

  media: [
    {
      id: 'm1',
      path: '/Users/example/Movies/VID_20190512.mp4',
      name: 'VID_20190512.mp4',
      duration_ms: 42000,
      width: 1920, height: 1080, rotation: 0, fps: 30,
      has_audio: true,
      recorded_at: '2019-05-12T10:22:00+09:00',
      recorded_at_estimated: false,
      video_codec: 'h264',
      color: '#4d3d2e'
    },
    {
      id: 'm2',
      path: '/Users/example/Movies/IMG_4021.mov',
      name: 'IMG_4021.mov',
      duration_ms: 65000,
      width: 1080, height: 1920, rotation: 90, fps: 30,
      has_audio: true,
      recorded_at: '2021-08-03T16:40:00+09:00',
      recorded_at_estimated: false,
      video_codec: 'hevc',
      color: '#33414a'
    },
    {
      id: 'm3',
      path: '/Users/example/Movies/birthday.mp4',
      name: 'birthday.mp4',
      duration_ms: 58000,
      width: 1920, height: 1080, rotation: 0, fps: 60,
      has_audio: true,
      recorded_at: '2023-12-25T19:05:00+09:00',
      recorded_at_estimated: false,
      video_codec: 'h264',
      color: '#40323d'
    },
    {
      id: 'm4',
      path: '/Users/example/Movies/VID_20261020.mp4',
      name: 'VID_20261020.mp4',
      duration_ms: 37000,
      width: 3840, height: 2160, rotation: 0, fps: 30,
      has_audio: false,
      recorded_at: '2026-10-20T09:05:00+09:00',
      recorded_at_estimated: true,
      video_codec: 'hevc',
      color: '#394735'
    }
  ],

  subjects: [
    { id: 's1', name: 'Coco', birth_date: '2013-04-02' },
    { id: 's2', name: 'Momo', birth_date: '2015-07-19' }
  ],

  /** Clips reference media by id; order here is playback order. */
  clips: [
    { mediaId: 'm1', in_ms: 0, out_ms: 42000 },
    { mediaId: 'm2', in_ms: 5000, out_ms: 65000 },
    { mediaId: 'm3', in_ms: 0, out_ms: 58000 },
    { mediaId: 'm4', in_ms: 0, out_ms: 37000 }
  ],

  music: {
    source: '/Users/example/Music/memory_song.mp3',
    gain_db: -6,
    fade_in_ms: 1500,
    fade_out_ms: 2500,
    loop: true
  }
};
