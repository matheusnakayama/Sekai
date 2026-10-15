"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

/** Campos mínimos de um canal para poder ser reordenado entre categorias. */
export interface ReorderableChannel {
  id: string;
  categoryId: string | null;
  categoryName: string;
  categoryPosition?: number;
}

export interface DropIndicator {
  top: number;
  left: number;
  width: number;
}

const MOVE_THRESHOLD_PX = 5;
const TOUCH_HOLD_MS = 280;
const SCROLL_EDGE_PX = 36;
const SCROLL_MAX_SPEED = 14;

/**
 * Move `sourceId` para antes/depois de `targetId`, herdando a categoria do destino.
 * Função pura: devolve a nova lista (ou null se nada mudaria).
 */
export function moveChannel<T extends ReorderableChannel>(channels: T[], sourceId: string, targetId: string, after: boolean): T[] | null {
  const source = channels.find((channel) => channel.id === sourceId);
  const target = channels.find((channel) => channel.id === targetId);
  if (!source || !target || source.id === target.id) return null;
  const moved: T = { ...source, categoryId: target.categoryId, categoryName: target.categoryName, categoryPosition: target.categoryPosition };
  const next = channels.filter((channel) => channel.id !== sourceId);
  const targetIndex = next.findIndex((channel) => channel.id === targetId);
  next.splice(targetIndex + (after ? 1 : 0), 0, moved);
  const unchanged = next.length === channels.length && next.every((channel, index) => channel.id === channels[index].id && channel.categoryId === channels[index].categoryId);
  return unchanged ? null : next;
}

/** Move genérico (listas planas, como a de servidores). */
export function moveItem<T extends { id: string }>(items: T[], sourceId: string, targetId: string, after: boolean): T[] | null {
  const source = items.find((item) => item.id === sourceId);
  if (!source || sourceId === targetId || !items.some((item) => item.id === targetId)) return null;
  const next = items.filter((item) => item.id !== sourceId);
  next.splice(next.findIndex((item) => item.id === targetId) + (after ? 1 : 0), 0, source);
  return next.every((item, index) => item.id === items[index].id) ? null : next;
}

interface DragSession {
  id: string;
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  row: HTMLElement;
  startRowTop: number;
  startScrollTop: number;
  started: boolean;
  holdTimer: number | null;
  raf: number | null;
  target: { id: string; after: boolean } | null;
}

/**
 * Reordenação de canais por ponteiro (mouse, caneta e toque), sem dependências e sem a "imagem fantasma"
 * do drag-and-drop nativo. O item arrastado acompanha o cursor via `transform` (sem re-render a cada
 * movimento) e uma linha de destino desliza suavemente entre as posições possíveis.
 *
 * - `rowProps(id)`: espalhe no elemento de cada canal (precisa de `data-reorder-id`, já incluso).
 * - `containerRef`: contêiner rolável com `position: relative` que contém as linhas e o indicador.
 * - Teclado: Alt + ↑/↓ no botão do canal chama `onMove` com a vizinhança correspondente.
 */
export function useChannelReorder<T extends { id: string }>({
  enabled,
  channels,
  onReorder,
  move = moveItem,
  gap = 0,
  indicatorWidth,
  shift = false,
  dragScale = 1.015,
}: {
  enabled: boolean;
  /** Itens na MESMA ordem em que aparecem na tela. */
  channels: T[];
  onReorder?: (next: T[]) => void;
  /** Como aplicar o movimento (canais herdam a categoria do destino). Padrão: lista plana. */
  move?: (items: T[], sourceId: string, targetId: string, after: boolean) => T[] | null;
  /** Espaço entre itens, para centralizar o indicador na folga. */
  gap?: number;
  /** Largura fixa (centralizada) do indicador; por padrão usa a largura do item. */
  indicatorWidth?: number;
  /** Em vez de uma linha indicadora, os itens vizinhos deslizam para abrir espaço (listas planas). */
  shift?: boolean;
  /** Escala do item enquanto é arrastado. */
  dragScale?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<DragSession | null>(null);
  const suppressClickRef = useRef(false);
  const markedRef = useRef<HTMLElement | null>(null);
  const channelsRef = useRef(channels);
  const onReorderRef = useRef(onReorder);
  const moveRef = useRef(move);
  moveRef.current = move;
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [indicator, setIndicator] = useState<DropIndicator | null>(null);

  useEffect(() => { channelsRef.current = channels; }, [channels]);
  useEffect(() => { onReorderRef.current = onReorder; }, [onReorder]);

  /** Marca (via atributo) o item que será substituído, para destacá-lo no CSS. */
  const markTarget = useCallback((element: HTMLElement | null, after = false) => {
    const previous = markedRef.current;
    if (previous && previous !== element) previous.removeAttribute("data-drop-target");
    if (element) element.setAttribute("data-drop-target", after ? "after" : "before");
    markedRef.current = element;
  }, []);

  const cleanup = useCallback(() => {
    markTarget(null);
    const session = sessionRef.current;
    if (session) {
      if (session.holdTimer != null) window.clearTimeout(session.holdTimer);
      if (session.raf != null) window.cancelAnimationFrame(session.raf);
      session.row.style.transform = "";
      session.row.style.transition = "";
      session.row.removeAttribute("data-dragging");
      try { session.row.releasePointerCapture(session.pointerId); } catch { /* ponteiro já liberado */ }
    }
    const shiftContainer = containerRef.current;
    if (shiftContainer) {
      shiftContainer.removeAttribute("data-reorder-shifting");
      shiftContainer.querySelectorAll<HTMLElement>("[data-reorder-id]").forEach((element) => { if (element.style.transform) element.style.transform = ""; });
    }
    document.body.classList.remove("list-reordering");
    sessionRef.current = null;
    setDraggingId(null);
    setIndicator(null);
  }, [markTarget]);

  /** Descobre o destino sob o cursor e posiciona o indicador. */
  const updateTarget = useCallback((session: DragSession) => {
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    if (shift) {
      // Mede pela posição de layout (offsetTop), ignorando os transforms de deslize, para não oscilar.
      const all = Array.from(container.querySelectorAll<HTMLElement>("[data-reorder-id]"));
      const layoutTop = (element: HTMLElement) => containerRect.top - container.scrollTop + element.offsetTop;
      let nearest: { element: HTMLElement; after: boolean; distance: number } | null = null;
      for (const element of all) {
        if (element === session.row || element.offsetHeight === 0) continue;
        const mid = layoutTop(element) + element.offsetHeight / 2;
        const distance = Math.abs(session.lastY - mid);
        if (!nearest || distance < nearest.distance) nearest = { element, after: session.lastY > mid, distance };
      }
      if (!nearest) { session.target = null; return; }
      session.target = { id: nearest.element.dataset.reorderId!, after: nearest.after };
      const sourceIndex = all.indexOf(session.row);
      const insertAt = all.indexOf(nearest.element) + (nearest.after ? 1 : 0);
      const newIndex = sourceIndex < insertAt ? insertAt - 1 : insertAt;
      const step = session.row.offsetHeight + gap;
      all.forEach((element, index) => {
        if (element === session.row) return;
        let offset = 0;
        if (newIndex > sourceIndex && index > sourceIndex && index <= newIndex) offset = -step;
        else if (newIndex < sourceIndex && index >= newIndex && index < sourceIndex) offset = step;
        const value = offset ? `translate3d(0, ${offset}px, 0)` : "";
        if (element.style.transform !== value) element.style.transform = value;
      });
      return;
    }
    const rows = Array.from(container.querySelectorAll<HTMLElement>("[data-reorder-id]")).filter((element) => element !== session.row);
    let best: { element: HTMLElement; after: boolean; distance: number } | null = null;
    for (const element of rows) {
      const rect = element.getBoundingClientRect();
      if (rect.height === 0) continue;
      const mid = rect.top + rect.height / 2;
      const distance = Math.abs(session.lastY - mid);
      if (!best || distance < best.distance) best = { element, after: session.lastY > mid, distance };
    }
    if (!best) { session.target = null; markTarget(null); setIndicator(null); return; }
    const id = best.element.dataset.reorderId!;
    session.target = { id, after: best.after };
    markTarget(best.element, best.after);
    const rect = best.element.getBoundingClientRect();
    const y = (best.after ? rect.bottom + gap / 2 : rect.top - gap / 2) - containerRect.top + container.scrollTop;
    const width = indicatorWidth ? Math.min(indicatorWidth, rect.width) : rect.width;
    const left = rect.left - containerRect.left + (rect.width - width) / 2;
    setIndicator((current) => {
      const next = { top: Math.round(y) - 1, left, width };
      return current && current.top === next.top && current.left === next.left && current.width === next.width ? current : next;
    });
  }, [gap, indicatorWidth, markTarget, shift]);

  const applyTransform = useCallback((session: DragSession) => {
    const container = containerRef.current;
    const scrollDelta = container ? container.scrollTop - session.startScrollTop : 0;
    const dy = session.lastY - session.startY + scrollDelta;
    session.row.style.transform = `translate3d(0, ${dy}px, 0) scale(${dragScale})`;
  }, [dragScale]);

  /** Rolagem automática ao arrastar perto das bordas da lista. */
  const autoScroll = useCallback((session: DragSession) => {
    const tick = () => {
      if (sessionRef.current !== session || !session.started) return;
      const container = containerRef.current;
      const scroller = container?.closest<HTMLElement>("[data-reorder-scroll]") ?? container;
      if (scroller) {
        const rect = scroller.getBoundingClientRect();
        let speed = 0;
        if (session.lastY < rect.top + SCROLL_EDGE_PX) speed = -SCROLL_MAX_SPEED * (1 - Math.max(0, session.lastY - rect.top) / SCROLL_EDGE_PX);
        else if (session.lastY > rect.bottom - SCROLL_EDGE_PX) speed = SCROLL_MAX_SPEED * (1 - Math.max(0, rect.bottom - session.lastY) / SCROLL_EDGE_PX);
        if (speed) {
          const before = scroller.scrollTop;
          scroller.scrollTop += speed;
          if (scroller.scrollTop !== before) { applyTransform(session); updateTarget(session); }
        }
      }
      session.raf = window.requestAnimationFrame(tick);
    };
    session.raf = window.requestAnimationFrame(tick);
  }, [applyTransform, updateTarget]);

  const beginDrag = useCallback((session: DragSession) => {
    session.started = true;
    session.row.setAttribute("data-dragging", "true");
    session.row.style.transition = "box-shadow 160ms ease, opacity 160ms ease";
    try { session.row.setPointerCapture(session.pointerId); } catch { /* sem captura: segue pelos eventos da janela */ }
    document.body.classList.add("list-reordering");
    if (shift) containerRef.current?.setAttribute("data-reorder-shifting", "true");
    setDraggingId(session.id);
    applyTransform(session);
    updateTarget(session);
    autoScroll(session);
  }, [applyTransform, autoScroll, shift, updateTarget]);

  useEffect(() => {
    if (!enabled) return;

    const onMove = (event: PointerEvent) => {
      const session = sessionRef.current;
      if (!session || event.pointerId !== session.pointerId) return;
      session.lastX = event.clientX;
      session.lastY = event.clientY;
      if (!session.started) {
        const moved = Math.hypot(event.clientX - session.startX, event.clientY - session.startY);
        if (session.pointerType === "touch") {
          // Em toque, mover antes do "segurar" cancela: o usuário só queria rolar a lista.
          if (moved > MOVE_THRESHOLD_PX * 2) cleanup();
          return;
        }
        if (moved < MOVE_THRESHOLD_PX) return;
        beginDrag(session);
        return;
      }
      event.preventDefault();
      applyTransform(session);
      updateTarget(session);
    };

    const onUp = (event: PointerEvent) => {
      const session = sessionRef.current;
      if (!session || event.pointerId !== session.pointerId) return;
      if (session.started) {
        suppressClickRef.current = true;
        window.setTimeout(() => { suppressClickRef.current = false; }, 0);
        const target = session.target;
        if (target) {
          const next = moveRef.current(channelsRef.current, session.id, target.id, target.after);
          if (next) onReorderRef.current?.(next);
        }
      }
      cleanup();
    };

    const onCancel = (event: PointerEvent) => {
      if (sessionRef.current && event.pointerId === sessionRef.current.pointerId) cleanup();
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && sessionRef.current?.started) { event.preventDefault(); cleanup(); }
    };

    // Em toque, depois do "segurar" a rolagem da página precisa ser bloqueada.
    const onTouchMove = (event: TouchEvent) => {
      if (sessionRef.current?.started && event.cancelable) event.preventDefault();
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("touchmove", onTouchMove);
      cleanup();
    };
  }, [enabled, applyTransform, beginDrag, cleanup, updateTarget]);

  const rowProps = useCallback((id: string) => ({
    "data-reorder-id": id,
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || sessionRef.current) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      // Botões de ação (convite/configurações) e campos não iniciam arraste.
      if ((event.target as HTMLElement).closest("[data-no-drag]")) return;
      const row = event.currentTarget;
      const session: DragSession = {
        id,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        row,
        startRowTop: row.getBoundingClientRect().top,
        startScrollTop: containerRef.current?.scrollTop ?? 0,
        started: false,
        holdTimer: null,
        raf: null,
        target: null,
      };
      sessionRef.current = session;
      if (event.pointerType === "touch") {
        session.holdTimer = window.setTimeout(() => {
          if (sessionRef.current === session) beginDrag(session);
        }, TOUCH_HOLD_MS);
      }
    },
    // Depois de um arraste, o clique que o navegador dispara ao soltar não deve abrir o canal.
    onClickCapture: (event: React.MouseEvent) => {
      if (suppressClickRef.current) { event.preventDefault(); event.stopPropagation(); }
    },
    onDragStart: (event: React.DragEvent) => event.preventDefault(),
  }), [beginDrag, enabled]);

  /** Alt + ↑/↓: move o canal uma posição (equivalente por teclado do arraste). */
  const onKeyboardMove = useCallback((event: React.KeyboardEvent, id: string) => {
    if (!enabled || !event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    const list = channelsRef.current;
    const index = list.findIndex((channel) => channel.id === id);
    const neighbour = list[index + (event.key === "ArrowUp" ? -1 : 1)];
    if (index < 0 || !neighbour) return;
    const next = moveRef.current(list, id, neighbour.id, event.key === "ArrowDown");
    if (next) onReorderRef.current?.(next);
  }, [enabled]);

  return { containerRef, draggingId, indicator, rowProps, onKeyboardMove };
}
