import { useState } from "react";
import { Image, View } from "@tarojs/components";

interface PixelImageProps {
  src: string;
  className: string;
  mode?: "aspectFit" | "aspectFill" | "scaleToFill" | "center";
  ariaLabel?: string;
}

/** 像素图：加载失败时换成同尺寸的色块占位，不留破图 */
export function PixelImage({ src, className, mode = "aspectFit", ariaLabel }: PixelImageProps) {
  const [failed, setFailed] = useState(false);
  if (failed || !src) {
    return <View className={`${className} pixel-image-fallback`} />;
  }
  return (
    <Image
      className={className}
      src={src}
      mode={mode}
      ariaLabel={ariaLabel}
      onError={() => {
        console.error("[pixel-image] load failed", src);
        setFailed(true);
      }}
    />
  );
}
