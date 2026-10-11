'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type AnchorRef = { current: HTMLElement | null };

export default function AnchoredPopover({
  open,
  anchorRef,
  width,
  className,
  children,
}: {
  open: boolean;
  anchorRef: AnchorRef;
  width: number;
  className: string;
  children: ReactNode;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number; width: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    const place = () => {
      const anchor = anchorRef.current;
      const popover = popoverRef.current;
      if (!anchor || !popover) return;
      const anchorRect = anchor.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight;
      const actualWidth = Math.min(width, Math.max(0, viewportWidth - 16));
      const actualHeight = Math.min(popover.scrollHeight, Math.max(0, viewportHeight - 16));
      let top = anchorRect.top - actualHeight - 10;
      if (top < 8) top = anchorRect.bottom + 10;
      top = Math.max(8, Math.min(top, viewportHeight - actualHeight - 8));
      const left = Math.max(8, Math.min(anchorRect.left, viewportWidth - actualWidth - 8));
      setPosition({ left, top, width: actualWidth });
    };

    place();
    const popover = popoverRef.current;
    const observer = typeof ResizeObserver !== 'undefined' && popover ? new ResizeObserver(place) : null;
    if (popover) observer?.observe(popover);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchorRef, open, width]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={popoverRef}
      style={position ? { left: position.left, top: position.top, width: position.width } : { left: 8, top: 8, width: Math.min(width, 320) }}
      className={`fixed z-[400] box-border max-h-[calc(100dvh-16px)] overflow-y-auto ${className}`}
    >
      {children}
    </div>,
    document.body,
  );
}
