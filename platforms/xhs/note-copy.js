/* 一键发笔记的默认文案。改这个文件即可，不必动其它代码。
 * postNote 官方字段只有 title（≤20字）、content（≤1000字）、pageType、mediaInfo。
 * 没有话题 / 标签 / 小工具卡片绑定参数；话题写在正文里的 #标签，卡片由发布页或 share API 处理。
 */
(function (root) {
  'use strict';
  root.PFNoteCopy = {
    title: "像素农场，南瓜比人高",
    content: "挂机也能看田里热闹。农夫一家从清晨忙到夜里，南瓜能长得比人还高，成熟的作物会发光，路过的猫有时会叼来种子。日子一天天过，慢慢就能和阿禾把小屋修成一个家。\n\n打开「像素放置农场」，看他们种田、收菜、过日子。\n\n#像素游戏 #放置游戏 #小红书小工具 #种田游戏 #像素农场",
    topics: ["像素游戏", "放置游戏", "小红书小工具", "种田游戏", "像素农场"],
    pageType: 'photo_publish',
    images: ['note/evening.jpg', 'note/home.jpg']
  };
})(typeof window !== 'undefined' ? window : globalThis);
