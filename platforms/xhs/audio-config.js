/* 小工具预览/提审只允许 html/css/js/图片/字体/json，不能带 mp3。
   录音通过 pack.py 写成 assets 下的 base64 JS，由 audio.js 用 Web Audio 解码。
   首屏只拉 audio-data.js（清晨曲 + 核心音效）；其余时段和额外音效按 PF_AUDIO_LAZY 懒加载。
   不设置文件路径，避免 <audio> 去加载不存在的包内媒体。 */
window.PF_AUDIO_NO_HUD = true;
window.PF_AUDIO_DEFAULTS = { music: false, sfx: false };
window.PF_MUSIC_TRACKS = {};
window.PF_AUDIO_LAZY = {
  afternoon: 'assets/audio-afternoon.js',
  evening: 'assets/audio-evening.js',
  night: 'assets/audio-night.js',
  sfxMore: 'assets/audio-sfx-more.js'
};
