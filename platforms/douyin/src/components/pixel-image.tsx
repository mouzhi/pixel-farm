import { useState } from 'react'
import { Image, View } from '@tarojs/components'

interface PixelImageProps {
  src: string
  className: string
  mode?: 'aspectFit' | 'aspectFill' | 'scaleToFill'
}

/** 像素图：加载失败时换成色块占位，不留破图 */
export function PixelImage({ src, className, mode = 'aspectFit' }: PixelImageProps) {
  const [failed, setFailed] = useState(false)
  if (failed || !src) {
    return <View className={`${className} rounded bg-[#885f3f]/60`} />
  }
  return (
    <Image
      className={className}
      src={src}
      mode={mode}
      onError={() => {
        console.error('[pixel-image] load failed', src)
        setFailed(true)
      }}
    />
  )
}
