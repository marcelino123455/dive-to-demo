"use client";

import { useCallback, useRef, useState } from "react";
import type { SubtitleSegment } from "@/app/types/subtitle";

interface SubtitleTimelineProps {
  segments: SubtitleSegment[];
  duration: number;
  currentTime: number;
  onSegmentsChange: (segments: SubtitleSegment[]) => void;
  onSeek: (time: number) => void;
}

type DragType = "move" | "resize-start" | "resize-end" | null;

export default function SubtitleTimeline({
  segments,
  duration,
  currentTime,
  onSegmentsChange,
  onSeek,
}: SubtitleTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<{
    type: DragType;
    segmentId: string;
    startX: number;
    originalStart: number;
    originalEnd: number;
  } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  const timeToPercent = (time: number) => (time / duration) * 100;

  const percentToTime = useCallback(
    (percent: number) => (percent / 100) * duration,
    [duration]
  );

  const getMousePercent = useCallback((clientX: number) => {
    if (!trackRef.current) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
  }, []);

  const handleTrackClick = useCallback(
    (e: React.MouseEvent) => {
      if (dragState) return;
      const target = e.target as HTMLElement;
      if (target.closest("[data-subtitle-block]")) return;

      const percent = getMousePercent(e.clientX);
      onSeek(percentToTime(percent));
      setSelectedId(null);
    },
    [dragState, getMousePercent, onSeek, percentToTime]
  );

  const handleBlockMouseDown = useCallback(
    (e: React.MouseEvent, seg: SubtitleSegment, type: DragType) => {
      e.stopPropagation();
      e.preventDefault();
      setSelectedId(seg.id);
      setEditingText(seg.text);
      setDragState({
        type,
        segmentId: seg.id,
        startX: e.clientX,
        originalStart: seg.startTime,
        originalEnd: seg.endTime,
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

      const updated = segments.map((seg) => {
        if (seg.id !== dragState.segmentId) return seg;

        if (dragState.type === "move") {
          const segDuration = seg.endTime - seg.startTime;
          let newStart = dragState.originalStart + deltaTime;
          let newEnd = newStart + segDuration;

          if (newStart < 0) {
            newStart = 0;
            newEnd = segDuration;
          }
          if (newEnd > duration) {
            newEnd = duration;
            newStart = duration - segDuration;
          }

          return { ...seg, startTime: newStart, endTime: newEnd };
        }

        if (dragState.type === "resize-start") {
          const newStart = Math.max(0, Math.min(seg.endTime - 0.3, dragState.originalStart + deltaTime));
          return { ...seg, startTime: newStart };
        }

        if (dragState.type === "resize-end") {
          const newEnd = Math.min(duration, Math.max(seg.startTime + 0.3, dragState.originalEnd + deltaTime));
          return { ...seg, endTime: newEnd };
        }

        return seg;
      });

      onSegmentsChange(updated);
    },
    [dragState, segments, duration, onSegmentsChange, percentToTime]
  );

  const handleMouseUp = useCallback(() => {
    setDragState(null);
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      onSegmentsChange(segments.filter((s) => s.id !== id));
      if (selectedId === id) setSelectedId(null);
    },
    [segments, onSegmentsChange, selectedId]
  );

  const handleTextChange = useCallback(
    (id: string, newText: string) => {
      setEditingText(newText);
      onSegmentsChange(
        segments.map((s) => (s.id === id ? { ...s, text: newText } : s))
      );
    },
    [segments, onSegmentsChange]
  );

  const activeSegment = segments.find(
    (seg) => currentTime >= seg.startTime && currentTime <= seg.endTime
  );

  return (
    <div className="space-y-1.5">
      {/* Inline header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-[var(--color-black)]/50 uppercase tracking-wide">
            Subtitles
          </span>
          {segments.length > 0 && (
            <span className="text-[10px] text-[var(--color-black)]/30">
              ({segments.length})
            </span>
          )}
        </div>
        {activeSegment && (
          <span className="text-[10px] bg-[var(--color-warning)]/10 text-[var(--color-warning)] px-1.5 py-0.5 rounded-full font-medium truncate max-w-[200px]">
            {activeSegment.text}
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
        {/* Subtitle blocks */}
        {segments.map((seg) => {
          const left = timeToPercent(seg.startTime);
          const width = timeToPercent(seg.endTime - seg.startTime);
          const isSelected = selectedId === seg.id;
          const isActive = currentTime >= seg.startTime && currentTime <= seg.endTime;

          return (
            <div
              key={seg.id}
              data-subtitle-block
              className={`absolute top-1.5 bottom-1.5 rounded-md transition-shadow cursor-grab active:cursor-grabbing ${
                isSelected
                  ? "bg-[var(--color-warning)]/30 ring-2 ring-[var(--color-warning)] shadow-[0_2px_8px_rgba(217,119,6,0.2)]"
                  : isActive
                    ? "bg-[var(--color-warning)]/25 ring-1 ring-[var(--color-warning)]/50"
                    : "bg-[var(--color-warning)]/15 ring-1 ring-[var(--color-warning)]/30"
              }`}
              style={{ left: `${left}%`, width: `${Math.max(width, 0.8)}%` }}
              onMouseDown={(e) => handleBlockMouseDown(e, seg, "move")}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedId(seg.id);
                setEditingText(seg.text);
              }}
              title={seg.text}
            >
              {/* Resize handles */}
              <div
                className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize rounded-l-md hover:bg-[var(--color-warning)]/40"
                onMouseDown={(e) => handleBlockMouseDown(e, seg, "resize-start")}
              />
              <div
                className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize rounded-r-md hover:bg-[var(--color-warning)]/40"
                onMouseDown={(e) => handleBlockMouseDown(e, seg, "resize-end")}
              />

              {/* Label */}
              {width > 3 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-[9px] font-medium text-[var(--color-warning)] truncate px-2 opacity-80">
                    {seg.text}
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

      {/* Selected segment editor */}
      {selectedId &&
        (() => {
          const seg = segments.find((s) => s.id === selectedId);
          if (!seg) return null;

          return (
            <div className="p-3 rounded-xl bg-[var(--color-surface-overlay)] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--color-black)]/60">
                  Editing subtitle
                </span>
                <button
                  onClick={() => handleDelete(selectedId)}
                  className="text-[var(--color-danger)]/60 hover:text-[var(--color-danger)] text-xs cursor-pointer transition-colors flex items-center gap-1"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
                  </svg>
                  Delete
                </button>
              </div>

              {/* Text editor */}
              <div className="space-y-1">
                <label className="text-xs text-[var(--color-black)]/50">Text</label>
                <input
                  type="text"
                  value={editingText}
                  onChange={(e) => handleTextChange(seg.id, e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] text-[var(--color-black)] focus:outline-none focus:ring-2 focus:ring-[var(--color-warning)]/30 focus:border-[var(--color-warning)]/50"
                />
              </div>

              {/* Time info */}
              <div className="flex items-center gap-4 text-xs text-[var(--color-black)]/50 font-mono tabular-nums">
                <span>Start: {seg.startTime.toFixed(1)}s</span>
                <span>End: {seg.endTime.toFixed(1)}s</span>
                <span>Duration: {(seg.endTime - seg.startTime).toFixed(1)}s</span>
                <span>Confidence: {(seg.confidence * 100).toFixed(0)}%</span>
              </div>
            </div>
          );
        })()}

      {/* Empty state */}
      {segments.length === 0 && (
        <p className="text-[10px] text-[var(--color-black)]/30 text-center">
          No subtitles. Use &ldquo;Generate subtitles&rdquo; to transcribe the audio.
        </p>
      )}
    </div>
  );
}
