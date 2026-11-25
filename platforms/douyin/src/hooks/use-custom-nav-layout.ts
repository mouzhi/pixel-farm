import { useCallback, useState } from 'react'
import { useDidShow, useReady } from '@tarojs/taro'
import {
  measureCustomNavLayout,
  type CustomNavLayout,
} from '@/lib/custom-nav-layout'

export const useCustomNavLayout = () => {
  const [layout, setLayout] = useState<CustomNavLayout>(measureCustomNavLayout)

  const refresh = useCallback(() => {
    setLayout(measureCustomNavLayout())
  }, [])

  useReady(refresh)
  useDidShow(refresh)

  return layout
}
