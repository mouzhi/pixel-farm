# Credits / 第三方素材与许可

## 声音（audio.js）

- 背景音乐曲目 `assets/audio/morning.mp3`、`afternoon.mp3`、`evening.mp3`、`night.mp3`：
  由 **ElevenLabs Eleven Music**（模型 eleven_music_v2_5）于 2026-11-17 生成，生成时账号为 ElevenLabs **Starter** 付费档。
  依据 ElevenLabs Music Terms（2026-10-09 版）附录 A：Starter 档允许线上线下商业使用（不含影视、电视、广播和 "Studio Games"；
  本作按条款定义属于 Indie Game），Starter 档无需署名，不得作为独立音乐库分发或上架流媒体。
  处理：去头尾静音、个别曲目去掉结尾淡出、响度标准化（白天 -16 LUFS，夜晚 -18 LUFS）、128 kbps MP3。
- 音效 `sfx/*.mp3`（首屏用：点击、锄地、浇水、收获、金币）和 `assets/audio/sfx/*.mp3`（其余：播种、打水、摘果、砍树、喂草、
  抛竿、出水、购买、解锁、闪光、清理、鸡、羊、牛、猪、猫、狗、鸟叫）：由 **ElevenLabs Sound Effects**（eleven_text_to_sound_v2）
  于 2026-11-17 生成，账号为 ElevenLabs **Starter** 付费档（付费档可商用、无需署名；免费档才要求署名）。
  处理：截取单次动作、单声道、去低频、按响度统一、短淡出、64 kbps MP3。文件缺失或未加载时用下方 ZzFX 合成音效代替。
- 程序生成的背景音乐（音频文件加载前或加载失败时使用）、环境声（鸟叫、虫鸣）、提示音：运行时用 WebAudio 生成，本仓库原创。
- 音效合成器：音效的采样生成函数改写自 **ZzFX**（Zuper Zmall Zound Zynth），MIT 许可。
  - Copyright (c) 2019 Frank Force — https://github.com/KilledByAPixel/ZzFX
  - MIT License：Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
    documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to
    whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission
    notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT
    WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.

以后加入或替换音频文件（`window.PF_MUSIC_TRACKS` / `PFAudio.setTracks`）时，请在这里逐条写明来源、作者和许可。
