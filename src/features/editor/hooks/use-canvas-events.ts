import { fabric } from "fabric";
import { useEffect } from "react";

interface UseCanvasEventsProps {
  save: () => void;
  canvas: fabric.Canvas | null;
  setSelectedObjects: (objects: fabric.Object[]) => void;
  clearSelectionCallback?: () => void;
};

export const useCanvasEvents = ({
  save,
  canvas,
  setSelectedObjects,
  clearSelectionCallback,
}: UseCanvasEventsProps) => {
  useEffect(() => {
    if (!canvas) return;

    const onObjectAdded = () => save();
    const onObjectRemoved = () => save();
    const onObjectModified = () => save();
    const onSelectionCreated = (e: fabric.IEvent) => {
      // @ts-ignore — fabric IEvent.selected is present on selection events
      setSelectedObjects(e.selected || []);
    };
    const onSelectionUpdated = (e: fabric.IEvent) => {
      // @ts-ignore
      setSelectedObjects(e.selected || []);
    };
    const onSelectionCleared = () => {
      setSelectedObjects([]);
      clearSelectionCallback?.();
    };

    canvas.on("object:added", onObjectAdded);
    canvas.on("object:removed", onObjectRemoved);
    canvas.on("object:modified", onObjectModified);
    canvas.on("selection:created", onSelectionCreated);
    canvas.on("selection:updated", onSelectionUpdated);
    canvas.on("selection:cleared", onSelectionCleared);

    return () => {
      canvas.off("object:added", onObjectAdded);
      canvas.off("object:removed", onObjectRemoved);
      canvas.off("object:modified", onObjectModified);
      canvas.off("selection:created", onSelectionCreated as never);
      canvas.off("selection:updated", onSelectionUpdated as never);
      canvas.off("selection:cleared", onSelectionCleared);
    };
  },
  [
    save,
    canvas,
    clearSelectionCallback,
    setSelectedObjects // No need for this, this is from setState
  ]);
};
