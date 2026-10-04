"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { HoverGifImage } from "@/components/HoverGifImage";

export function CroppedProfileImage({
  src,
  positionX = 50,
  positionY = 50,
  zoom = 100,
  pauseGif = true,
  isHovered,
  alt = "",
  className,
  onImageDimensions,
}: {
  src: string;
  positionX?: number | null;
  positionY?: number | null;
  zoom?: number | null;
  pauseGif?: boolean;
  isHovered?: boolean;
  alt?: string;
  className?: string;
  onImageDimensions?: (width: number, height: number) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [naturalSize, setNaturalSize] = useState<{ src: string; width: number; height: number } | null>(null);
  const scale = Math.max(100, Math.min(250, zoom ?? 100)) / 100;
  const loadedSize = naturalSize?.src === src ? naturalSize : null;

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const update = () => {
      const bounds = element.getBoundingClientRect();
      setViewport((current) => current.width === bounds.width && current.height === bounds.height
        ? current
        : { width: bounds.width, height: bounds.height });
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(element);
    window.addEventListener("resize", update);
    return () => { observer?.disconnect(); window.removeEventListener("resize", update); };
  }, []);

  function reportDimensions(width: number, height: number) {
    if (!width || !height) return;
    setNaturalSize((current) => current?.src === src && current.width === width && current.height === height
      ? current
      : { src, width, height });
    onImageDimensions?.(width, height);
  }

  let imageStyle: CSSProperties = {
    position: "absolute",
    left: 0,
    top: 0,
    width: "100%",
    height: "100%",
    maxWidth: "none",
    objectFit: "cover",
    objectPosition: `${positionX ?? 50}% ${positionY ?? 50}%`,
    transform: `scale(${scale})`,
    transformOrigin: "center center",
  };

  if (loadedSize && viewport.width > 0 && viewport.height > 0) {
    const coverScale = Math.max(viewport.width / loadedSize.width, viewport.height / loadedSize.height) * scale;
    const renderedWidth = loadedSize.width * coverScale;
    const renderedHeight = loadedSize.height * coverScale;
    const overflowX = Math.max(0, renderedWidth - viewport.width);
    const overflowY = Math.max(0, renderedHeight - viewport.height);
    imageStyle = {
      position: "absolute",
      left: -overflowX * (Math.max(0, Math.min(100, positionX ?? 50)) / 100),
      top: -overflowY * (Math.max(0, Math.min(100, positionY ?? 50)) / 100),
      width: renderedWidth,
      height: renderedHeight,
      maxWidth: "none",
      maxHeight: "none",
      objectFit: "fill",
    };
  }

  return (
    <div ref={viewportRef} className={cn("absolute inset-0 overflow-hidden", className)}>
      <HoverGifImage
        src={src}
        alt={alt}
        className="absolute select-none"
        style={imageStyle}
        isHovered={pauseGif ? isHovered : true}
        onImageLoad={reportDimensions}
      />
    </div>
  );
}

export function ProfileBanner({
  src,
  positionX = 50,
  positionY = 50,
  zoom = 100,
  className,
  style,
  children,
}: {
  src?: string | null;
  positionX?: number | null;
  positionY?: number | null;
  zoom?: number | null;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <header className={cn("relative isolate overflow-hidden bg-theme-gradient", className)} style={style}>
      {src && <CroppedProfileImage src={src} alt="" positionX={positionX} positionY={positionY} zoom={zoom} pauseGif={false} className="pointer-events-none" />}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/5 via-black/10 to-black/30" />
      <div className="relative z-10 h-full">{children}</div>
    </header>
  );
}
