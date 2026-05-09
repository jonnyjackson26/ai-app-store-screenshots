import { fabric } from "fabric";
import { useEffect } from "react";

interface UsePanProps {
  canvas: fabric.Canvas | null;
  isPanning: boolean;
}

export const usePan = ({ canvas, isPanning }: UsePanProps) => {
  useEffect(() => {
    if (!canvas || !isPanning) return;

    const prevSelection = canvas.selection;
    const prevSkipTargetFind = canvas.skipTargetFind;
    const prevDefaultCursor = canvas.defaultCursor;
    const prevHoverCursor = canvas.hoverCursor;
    const upperEl = (canvas as unknown as { upperCanvasEl?: HTMLCanvasElement }).upperCanvasEl;
    const prevDomCursor = upperEl?.style.cursor ?? "";

    canvas.selection = false;
    canvas.skipTargetFind = true;
    canvas.defaultCursor = "grab";
    canvas.hoverCursor = "grab";
    if (upperEl) upperEl.style.cursor = "grab";
    canvas.discardActiveObject();
    canvas.requestRenderAll();

    let isDragging = false;
    let lastX = 0;
    let lastY = 0;

    const onMouseDown = (opt: fabric.IEvent) => {
      const e = opt.e as MouseEvent;
      isDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.defaultCursor = "grabbing";
      canvas.hoverCursor = "grabbing";
      if (upperEl) upperEl.style.cursor = "grabbing";
      canvas.setCursor("grabbing");
    };

    const onMouseMove = (opt: fabric.IEvent) => {
      if (!isDragging) return;
      const e = opt.e as MouseEvent;
      const vpt = canvas.viewportTransform;
      if (!vpt) return;
      vpt[4] += e.clientX - lastX;
      vpt[5] += e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.requestRenderAll();
    };

    const onMouseUp = () => {
      isDragging = false;
      canvas.defaultCursor = "grab";
      canvas.hoverCursor = "grab";
      if (upperEl) upperEl.style.cursor = "grab";
      canvas.setCursor("grab");
    };

    canvas.on("mouse:down", onMouseDown);
    canvas.on("mouse:move", onMouseMove);
    canvas.on("mouse:up", onMouseUp);

    return () => {
      canvas.off("mouse:down", onMouseDown as never);
      canvas.off("mouse:move", onMouseMove as never);
      canvas.off("mouse:up", onMouseUp as never);

      canvas.selection = prevSelection;
      canvas.skipTargetFind = prevSkipTargetFind;
      canvas.defaultCursor = prevDefaultCursor;
      canvas.hoverCursor = prevHoverCursor;
      if (upperEl) upperEl.style.cursor = prevDomCursor;
      canvas.setCursor(prevDefaultCursor ?? "default");
    };
  }, [canvas, isPanning]);
};
