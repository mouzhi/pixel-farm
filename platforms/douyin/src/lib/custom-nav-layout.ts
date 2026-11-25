import Taro from '@tarojs/taro'

export type CustomNavLayout = {
  paddingTop: number
  paddingLeft: number
  paddingRight: number
  source: 'tt' | 'menu-button' | 'system-info' | 'web' | 'fallback'
}

const FALLBACK_NAV_HEIGHT = 44
const FALLBACK_LEFT = 12
const FALLBACK_RIGHT = 96

const toNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

type GetCustomButtonBoundingClientRect = NonNullable<
  DouyinMiniProgramRuntime['getCustomButtonBoundingClientRect']
>
type CustomNavRect = ReturnType<GetCustomButtonBoundingClientRect>

const ttRuntime: DouyinMiniProgramRuntime | undefined =
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  typeof tt !== 'undefined' ? tt : undefined

const layoutFromTtRect = (rect: CustomNavRect | undefined): CustomNavLayout | null => {
  if (!rect) return null

  const nav = rect.customNavigation
  const capsule = rect.capsule
  const leftIcon = rect.leftIcon
  if (!nav && !capsule) return null

  const paddingTop = nav
    ? toNumber(nav.marginTop) + toNumber(nav.height)
    : toNumber(capsule?.bottom)

  const paddingLeft = leftIcon?.right != null
    ? toNumber(leftIcon.right)
    : nav?.marginLeft != null
      ? toNumber(nav.marginLeft)
      : FALLBACK_LEFT

  const paddingRight = nav?.marginRight != null
    ? toNumber(nav.marginRight)
    : capsule
      ? toNumber(capsule.width) + 8
      : FALLBACK_RIGHT

  if (paddingTop <= 0) return null

  return {
    paddingTop,
    paddingLeft,
    paddingRight,
    source: 'tt',
  }
}

export const measureCustomNavLayout = (): CustomNavLayout => {
  try {
    const rect = ttRuntime?.getCustomButtonBoundingClientRect?.({
      measurementUnit: 'px',
    })
    const fromTt = layoutFromTtRect(rect)
    if (fromTt) return fromTt
  } catch (error) {
    console.warn('[custom-nav] getCustomButtonBoundingClientRect failed', error)
  }

  try {
    const menu = Taro.getMenuButtonBoundingClientRect?.()
    const sys = Taro.getSystemInfoSync()
    if (menu && toNumber(menu.width) > 0 && toNumber(menu.height) > 0) {
      const statusBarHeight = toNumber(sys.statusBarHeight)
      const gap = Math.max(toNumber(menu.top) - statusBarHeight, 0)
      return {
        paddingTop: toNumber(menu.bottom) + gap,
        paddingLeft: FALLBACK_LEFT,
        paddingRight: Math.max(toNumber(sys.windowWidth) - toNumber(menu.left), 0),
        source: 'menu-button',
      }
    }
  } catch (error) {
    console.warn('[custom-nav] getMenuButtonBoundingClientRect failed', error)
  }

  try {
    const sys = Taro.getSystemInfoSync()
    const statusBarHeight = toNumber(sys.statusBarHeight)
    if (statusBarHeight <= 0) {
      return {
        paddingTop: 0,
        paddingLeft: 0,
        paddingRight: 0,
        source: 'web',
      }
    }
    return {
      paddingTop: statusBarHeight + FALLBACK_NAV_HEIGHT,
      paddingLeft: FALLBACK_LEFT,
      paddingRight: FALLBACK_RIGHT,
      source: 'system-info',
    }
  } catch (error) {
    console.warn('[custom-nav] getSystemInfoSync failed', error)
  }

  return {
    paddingTop: FALLBACK_NAV_HEIGHT + 44,
    paddingLeft: FALLBACK_LEFT,
    paddingRight: FALLBACK_RIGHT,
    source: 'fallback',
  }
}
