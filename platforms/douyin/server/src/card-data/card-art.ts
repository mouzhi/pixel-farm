/**
 * 兴趣卡卡面素材：由《像素放置农场》游戏引擎同一视角渲染（演示存档，不含任何玩家存档）。
 * 地址必须是平台上传后返回的 https 地址；上传前保持空字符串，卡面会显示色块占位。
 * 源文件：upload-assets/ 下同名文件（见 DESIGN.md 素材清单）。
 */
export const CARD_ART = {
  sceneDay: '', // card-scene-day.png 704×680
  sceneNight: '', // card-scene-night.png 704×680
  cropsDay: '', // card-crops-day.png 272×272
  cropsNight: '', // card-crops-night.png 272×272
  familyDay: '', // card-family-day.png 480×84
  familyNight: '', // card-family-night.png 480×84
  propsDay: '', // card-props-day.png 432×112
  propsNight: '', // card-props-night.png 432×112
} as const;
