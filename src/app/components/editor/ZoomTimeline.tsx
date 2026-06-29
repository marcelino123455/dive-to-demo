"use client";

import { useCallback, useRef, useState } from "react";
import type { ZoomKeyframe } from "@/app/types/zoom";

interface ZoomTimelineProps {
  keyframes: ZoomKeyframe[];
  duration: number;
  currentTime: number;
  onKeyframesChange: (keyframes: ZoomKeyframe[]) => void;
  onSeek: (time: number) => void;
}

type DragType = "move" | "resize-start" | "resize-end" | null;

export default function ZoomTimeline({
  keyframes,
  duration,
  currentTime,
  onKeyframesChange,
  onSeek,
}: ZoomTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<{
    type: DragType;
    keyframeId: string;
    startX: number;
    originalStart: number;
    originalEnd: number;
  } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const timeToPercent = (time: number) => (time / duration) * 100;

  const percentToTime = useCallback(
    (percent: number) => (percent / 100) * duration,
    [duration]
  );

  const getMousePercent = useCallback(
    (clientX: number) => {
      if (!trackRef.current) return 0;
      const rect = trackRef.current.getBoundingClientRect();
      return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    },
    []
  );

  const handleTrackClick = useCallback(
    (e: React.MouseEvent) => {
      if (dragState) return;
      const target = e.target as HTMLElement;
      if (target.closest("[data-zoom-block]")) return;

      const percent = getMousePercent(e.clientX);
      onSeek(percentToTime(percent));
      setSelectedId(null);
    },
    [dragState, getMousePercent, onSeek, percentToTime]
  );

  const handleBlockMouseDown = useCallback(
    (e: React.MouseEvent, kf: ZoomKeyframe, type: DragType) => {
      e.stopPropagation();
      e.preventDefault();
      setSelectedId(kf.id);
      setDragState({
        type,
        keyframeId: kf.id,
        startX: e.clientX,
        originalStart: kf.startTime,
        originalEnd: kf.endTime,
      });
    },
    []
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragState || !trackRef.current) return;

      const rect = trackRef.current.getBoundingClientRect();
      const deltaX = e.clientX - dragState.startX;
      const deltaPercent = (deltaX / rect.width) * 100;
      const deltaTime = percentToTime(deltaPercent);

      const updated = keyframes.map((kf) => {
        if (kf.id !== dragState.keyframeId) return kf;

        if (dragState.type === "move") {
          const newDuration = kf.endTime - kf.startTime;
          let newStart = dragState.originalStart + deltaTime;
          let newEnd = newStart + newDuration;

          if (newStart < 0) {
            newStart = 0;
            newEnd = newDuration;
          }
          if (newEnd > duration) {
            newEnd = duration;
            newStart = duration - newDuration;
          }

          return { ...kf, startTime: newStart, endTime: newEnd };
        }

        if (dragState.type === "resize-start") {
          const newStart = Math.max(0, Math.min(kf.endTime - 0.5, dragState.originalStart + deltaTime));
          return { ...kf, startTime: newStart };
        }

        if (dragState.type === "resize-end") {
          const newEnd = Math.min(duration, Math.max(kf.startTime + 0.5, dragState.originalEnd + deltaTime));
          return { ...kf, endTime: newEnd };
        }

        return kf;
      });

      onKeyframesChange(updated);
    },
    [dragState, keyframes, duration, onKeyframesChange, percentToTime]
  );

  const handleMouseUp = useCallback(() => {
    setDragState(null);
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      onKeyframesChange(keyframes.filter((kf) => kf.id !== id));
      if (selectedId === id) setSelectedId(null);
    },
    [keyframes, onKeyframesChange, selectedId]
  );

  const handleScaleChange = useCallback(
    (id: string, scale: number) => {
      onKeyframesChange(
        keyframes.map((kf) => (kf.id === id ? { ...kf, scale } : kf))
      );
    },
    [keyframes, onKeyframesChange]
  );

  const activeZoom = keyframes.find(
    (kf) => currentTime >= kf.startTime && currentTime <= kf.endTime
  );

  return (
    <div className="space-y-1.5">
      {/* Inline header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-[var(--color-black)]/50 uppercase tracking-wide">
            Zoom
          </span>
          {keyframes.length > 0 && (
            <span className="text-[10px] text-[var(--color-black)]/30">
              ({keyframes.length})
            </span>
          )}
        </div>
        {activeZoom && (
          <span className="text-[10px] bg-[var(--color-accent)]/10 text-[var(--color-seaweed)] px-1.5 py-0.5 rounded-full font-medium">
            {activeZoom.scale.toFixed(1)}x
          </span>
        )}
      </div>

      {/* Timeline track */}
      <div
        ref={trackRef}
        className="relative h-9 bg-[var(--color-surface-overlay)] rounded-lg cursor-crosshair select-none overflow-visible shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]"
        onClick={handleTrackClick}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Zoom blocks */}
        {keyframes.map((kf) => {
          const left = timeToPercent(kf.startTime);
          const width = timeToPercent(kf.endTime - kf.startTime);
          const isSelected = selectedId === kf.id;
          const isActive = currentTime >= kf.startTime && currentTime <= kf.endTime;

          return (
            <div
              key={kf.id}
              data-zoom-block
              className={`absolute top-1.5 bottom-1.5 rounded-md transition-shadow cursor-grab active:cursor-grabbing ${
                isSelected
                  ? "bg-[var(--color-accent)]/30 ring-2 ring-[var(--color-accent)] shadow-[0_2px_8px_var(--color-accent-glow)]"
                  : isActive
                    ? "bg-[var(--color-accent)]/25 ring-1 ring-[var(--color-accent)]/50"
                    : "bg-[var(--color-celadon)]/40 ring-1 ring-[var(--color-celadon)]"
              }`}
              style={{ left: `${left}%`, width: `${Math.max(width, 1)}%` }}
              onMouseDown={(e) => handleBlockMouseDown(e, kf, "move")}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedId(kf.id);
              }}
              title={kf.reason || `Zoom ${kf.scale}x`}
            >
              {/* Resize handles */}
              <div
                className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize rounded-l-md hover:bg-[var(--color-accent)]/40"
                onMouseDown={(e) => handleBlockMouseDown(e, kf, "resize-start")}
              />
              <div
                className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize rounded-r-md hover:bg-[var(--color-accent)]/40"
                onMouseDown={(e) => handleBlockMouseDown(e, kf, "resize-end")}
              />

              {/* Label */}
              {width > 4 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-[10px] font-medium text-[var(--color-seaweed)] truncate px-2">
                    {kf.scale.toFixed(1)}x
                  </span>
                </div>
              )}
            </div>
          );
        })}

        {/* Playhead */}
        <div
          className="absolute top-0 h-full w-0.5 bg-[var(--color-accent)] z-10 pointer-events-none"
          style={{ left: `${timeToPercent(currentTime)}%` }}
        >
          <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-[var(--color-accent)] rounded-full shadow-sm" />
        </div>
      </div>

      {/* Selected keyframe editor */}
      {selectedId && (() => {
        const kf = keyframes.find((k) => k.id === selectedId);
        if (!kf) return null;

        return (
          <div className="p-3 rounded-xl bg-[var(--color-surface-overlay)] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--color-black)]/60">
                Editing zoom
              </span>
              <button
                onClick={() => handleDelete(selectedId)}
                className="text-[var(--color-danger)]/60 hover:text-[var(--color-danger)] text-xs cursor-pointer transition-colors flex items-center gap-1"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
                </svg>
                Delete
              </button>
            </div>

            {/* Scale slider */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-[var(--color-black)]/50 w-12">Scale</span>
              <input
                type="range"
                min="1.2"
                max="3"
                step="0.1"
                value={kf.scale}
                onChange={(e) => handleScaleChange(kf.id, parseFloat(e.target.value))}
                className="flex-1 accent-[var(--color-accent)]"
              />
              <span className="text-xs font-mono tabular-nums text-[var(--color-black)]/60 w-10 text-right">
                {kf.scale.toFixed(1)}x
              </span>
            </div>

            {/* Time info */}
            <div className="flex items-center gap-4 text-xs text-[var(--color-black)]/50 font-mono tabular-nums">
              <span>Start: {kf.startTime.toFixed(1)}s</span>
              <span>End: {kf.endTime.toFixed(1)}s</span>
              <span>Duration: {(kf.endTime - kf.startTime).toFixed(1)}s</span>
            </div>

            {/* Reason */}
            {kf.reason && (
              <p className="text-xs text-[var(--color-black)]/40 italic">
                &ldquo;{kf.reason}&rdquo;
              </p>
            )}

            {/* Position controls */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-[var(--color-black)]/50 w-12">Position</span>
              <div className="flex-1 grid grid-cols-2 gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-[var(--color-black)]/40">X</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={kf.x}
                    onChange={(e) => {
                      onKeyframesChange(
                        keyframes.map((k) =>
                          k.id === kf.id ? { ...k, x: parseFloat(e.target.value) } : k
                        )
                      );
                    }}
                    className="flex-1 accent-[var(--color-accent)]"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-[var(--color-black)]/40">Y</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={kf.y}
                    onChange={(e) => {
                      onKeyframesChange(
                        keyframes.map((k) =>
                          k.id === kf.id ? { ...k, y: parseFloat(e.target.value) } : k
                        )
                      );
                    }}
                    className="flex-1 accent-[var(--color-accent)]"
                  />
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Empty state */}
      {keyframes.length === 0 && (
        <p className="text-[10px] text-[var(--color-black)]/30 text-center">
          No zooms. Use &ldquo;Analyze zooms with AI&rdquo; to detect them.
        </p>
      )}
    </div>
  );
}
