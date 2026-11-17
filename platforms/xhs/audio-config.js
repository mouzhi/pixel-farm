/* 小工具预览/提审只允许 html/css/js/图片/字体/json，不能带 mp3。
   录音通过 pack.py 写成 assets/audio-data.js，由 audio.js 用 Web Audio 解码。
   不设置文件路径，避免 <audio> 去加载不存在的包内媒体。 */
window.PF_AUDIO_NO_HUD = true;
window.PF_AUDIO_DEFAULTS = { music: false, sfx: false };
window.PF_MUSIC_TRACKS = {};
