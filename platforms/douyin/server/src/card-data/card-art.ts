/**
 * 兴趣卡卡面素材：由《像素放置农场》游戏引擎同一视角渲染（演示存档，不含任何玩家存档）。
 * 地址必须是平台上传后返回的 https 地址；上传前保持空字符串，卡面会显示色块占位。
 * 源文件：upload-assets/ 下同名文件（见 DESIGN.md 素材清单）。
 */
export const CARD_ART = {
  sceneDay: 'https://lf-aihub.douyinpic.com/obj/developer/card_7712032872262617898_ext/654953acd76c.png', // card-scene-day.png 704×680
  sceneNight: 'https://lf-aihub.douyinpic.com/obj/developer/card_7712032872262617898_ext/5f90e82246c2.png', // card-scene-night.png 704×680
  cropsDay: 'https://lf-aihub.douyinpic.com/obj/developer/card_7712032872262617898_ext/5aeae43e9c1e.png', // card-crops-day.png 340×272
  cropsNight: 'https://lf-aihub.douyinpic.com/obj/developer/card_7712032872262617898_ext/b2b49c9d6f32.png', // card-crops-night.png 340×272
  familyDay: 'https://lf-aihub.douyinpic.com/obj/developer/card_7712032872262617898_ext/01031b34c771.png', // card-family-day.png 480×84
  familyNight: 'https://lf-aihub.douyinpic.com/obj/developer/card_7712032872262617898_ext/d90c80db29bd.png', // card-family-night.png 480×84
  propsDay: 'https://lf-aihub.douyinpic.com/obj/developer/card_7712032872262617898_ext/bb7f0c9e5488.png', // card-props-day.png 432×112
  propsNight: 'https://lf-aihub.douyinpic.com/obj/developer/card_7712032872262617898_ext/cb665c04c935.png', // card-props-night.png 432×112
} as const;
