import { fabric } from "fabric";
import { useEffect } from "react";

interface UseCanvasWheelProps {
  canvas: fabric.Canvas | null;
}

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 5;

export const useCanvasWheel = ({ canvas }: UseCanvasWheelProps) => {
  useEffect(() => {
    if (!canvas) return;
    const el = (canvas as unknown as { upperCanvasEl?: HTMLCanvasElement }).upperCanvasEl;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();

      // Browsers send wheel events with ctrlKey=true for trackpad pinch-zoom.
      if (e.ctrlKey || e.metaKey) {
        let zoom = canvas.getZoom();
        zoom *= Math.pow(0.999, e.deltaY);
        if (zoom > MAX_ZOOM) zoom = MAX_ZOOM;
        if (zoom < MIN_ZOOM) zoom = MIN_ZOOM;
        canvas.zoomToPoint(new fabric.Point(e.offsetX, e.offsetY), zoom);
        return;
      }

      const vpt = canvas.viewportTransform;
      if (!vpt) return;
      vpt[4] -= e.deltaX;
      vpt[5] -= e.deltaY;
      canvas.requestRenderAll();
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [canvas]);
};
