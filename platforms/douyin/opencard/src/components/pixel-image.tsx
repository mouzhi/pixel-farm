import { useState } from "react";
import { Image, View } from "@tarojs/components";

interface PixelImageProps {
  src: string;
  className: string;
  mode?: "aspectFit" | "aspectFill" | "scaleToFill" | "center";
  ariaLabel?: string;
  /** 只承接运行时算出的几何（如图集偏移） */
  style?: Record<string, string>;
}

/** 像素图：加载失败时换成同尺寸的色块占位，不留破图 */
export function PixelImage({ src, className, mode = "aspectFit", ariaLabel, style }: PixelImageProps) {
  const [failed, setFailed] = useState(false);
  if (failed || !src) {
    return <View className={`${className} pixel-image-fallback`} style={style} />;
  }
  return (
    <Image
      className={className}
      src={src}
      mode={mode}
      style={style}
      ariaLabel={ariaLabel}
      onError={() => {
        console.error("[pixel-image] load failed", src);
        setFailed(true);
      }}
    />
  );
}
