"use client";

import { useEffect, useRef, useState } from "react";

const PEN_COLORS = ["#ff3b30", "#ffcc00", "#34c759", "#0a84ff", "#ffffff"];

/**
 * Shows a captured video frame and lets the reviewer draw on it to point at the
 * exact spot. The base frame and the strokes live on the same canvas, so the
 * exported PNG is the annotated frame — which also becomes the AI start-frame.
 */
export function FrameCanvas({
  baseDataUrl,
  onCommit,
  onCancel,
}: {
  baseDataUrl: string;
  onCommit: (dataUrl: string) => void;
  onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseImgRef = useRef<HTMLImageElement | null>(null);
  const drawingRef = useRef(false);
  const [color, setColor] = useState(PEN_COLORS[0]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      baseImgRef.current = img;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0);
      setReady(true);
    };
    img.src = baseDataUrl;
  }, [baseDataUrl]);

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const ctx = canvas.getContext("2d")!;
    const p = pointFromEvent(e);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(3, canvas.width / 240);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pointFromEvent(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function endStroke() {
    drawingRef.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    const img = baseImgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
  }

  function commit() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onCommit(canvas.toDataURL("image/png"));
  }

  return (
    <div className="mt-3 rounded-lg border border-line bg-paper p-3" data-testid="frame-annotator">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
          Draw on the frame
        </span>
        <div className="flex items-center gap-1.5">
          {PEN_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`pen ${c}`}
              onClick={() => setColor(c)}
              className={`h-5 w-5 rounded-full border ${
                color === c ? "ring-2 ring-reel ring-offset-1" : "border-line"
              }`}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>

      <canvas
        ref={canvasRef}
        data-testid="frame-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerLeave={endStroke}
        className="w-full cursor-crosshair touch-none rounded-md border border-line bg-black"
      />

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          className="btn-primary px-3 py-1.5 text-xs"
          onClick={commit}
          disabled={!ready}
          data-testid="frame-attach"
        >
          Attach frame
        </button>
        <button
          type="button"
          className="btn-ghost px-3 py-1.5 text-xs"
          onClick={clear}
        >
          Clear drawing
        </button>
        <button
          type="button"
          className="btn-ghost px-3 py-1.5 text-xs"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
