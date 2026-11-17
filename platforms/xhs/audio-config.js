/* 小工具预览/提审只允许 html/css/js/图片/字体/json，不能带 mp3。
   录音通过 pack.py 写成 assets 下的 base64 JS，由 audio.js 用 Web Audio 解码。
   音频数据不在首屏关键路径：清晨曲 + 核心音效也按 PF_AUDIO_LAZY 在首帧之后
   空闲时或玩家打开音乐/音效时再加载。不设置文件路径，避免 <audio> 去加载不存在的包内媒体。 */
window.PF_AUDIO_NO_HUD = true;
window.PF_AUDIO_DEFAULTS = { music: false, sfx: false };
window.PF_MUSIC_TRACKS = {};
window.PF_AUDIO_LAZY = {
  morning: 'assets/audio-data.js',
  afternoon: 'assets/audio-afternoon.js',
  evening: 'assets/audio-evening.js',
  night: 'assets/audio-night.js',
  sfxMore: 'assets/audio-sfx-more.js'
};
