import { View } from '@tarojs/components'
import { useCustomNavLayout } from '@/hooks/use-custom-nav-layout'

/**
 * 自定义导航栏顶部占位：只负责避开状态栏、左上角 logo/返回、右上角胶囊。
 * 中间可绘制区域留给官方关注组件，禁止放标题或其他业务内容。
 * 本组件透明且没有独立视觉语义；顶部背景需要连续时，将它放在对应的首屏顶部视觉容器内。
 * 页面根容器请用 flex flex-col；本组件下方内容不要再写死 min-h-screen / h-screen。
 */
export function CustomNavSpace() {
  const { paddingTop } = useCustomNavLayout()

  return (
    <View className="w-full shrink-0" style={{ height: `${paddingTop}px` }} />
  )
}
