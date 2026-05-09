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
        // Pinch sends many small-delta events (~1-5); a real mouse wheel
        // sends fewer large-delta events (~100). Use a steeper factor for
        // small deltas so pinches feel responsive without making wheel
        // clicks fly past the zoom.
        const factor = Math.abs(e.deltaY) < 50 ? 0.98 : 0.999;
        let zoom = canvas.getZoom();
        zoom *= Math.pow(factor, e.deltaY);
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
