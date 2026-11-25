/// <reference types="@open-dy/vibecoding-sdk-opencard/types/opencard" />

export default defineAppConfig({
  renderType: 'lynx',
  pages: ['pages/index/index'],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTitleText: '首页',
    navigationBarTextStyle: 'black',
  },
  compileType: 'card',
  cardRenderType: 'webview',
});
