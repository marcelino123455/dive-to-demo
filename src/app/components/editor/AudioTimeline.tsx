"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface AudioSegmentData {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  audioUrl: string; // object URL for playback
}

interface AudioTimelineProps {
  segments: AudioSegmentData[];
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  onSeek: (time: number) => void;
  isGenerating: boolean;
}

export default function AudioTimeline({
  segments,
  duration,
  currentTime,
  isPlaying,
  onSeek,
  isGenerating,
}: AudioTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeSegIdRef = useRef<string | null>(null);

  // Track which segment has already been played to avoid re-triggering
  const playedSegIdRef = useRef<string | null>(null);

  // Pre-load audio elements for each segment so presigned URLs are ready
  const preloadedAudioRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const prevSegmentsRef = useRef<AudioSegmentData[]>([]);

  // Pre-load audio elements when segments change (e.g., project loaded from cloud)
  useEffect(() => {
    if (segments.length === 0) {
      preloadedAudioRef.current.clear();
      prevSegmentsRef.current = [];
      return;
    }

    // Only rebuild if the segments array actually changed
    if (prevSegmentsRef.current === segments) return;
    prevSegmentsRef.current = segments;

    // Clean up old preloaded elements that are no longer in the segment list
    const currentIds = new Set(segments.map((s) => s.id));
    for (const [id, audio] of preloadedAudioRef.current) {
      if (!currentIds.has(id)) {
        audio.pause();
        preloadedAudioRef.current.delete(id);
      }
    }

    // Preload new segments
    for (const seg of segments) {
      if (!preloadedAudioRef.current.has(seg.id)) {
        const audio = new Audio();
        audio.preload = "auto";
        audio.src = seg.audioUrl;
        preloadedAudioRef.current.set(seg.id, audio);
      } else {
        // Update URL if it changed (e.g. new presigned URL)
        const existing = preloadedAudioRef.current.get(seg.id)!;
        if (existing.src !== seg.audioUrl) {
          existing.src = seg.audioUrl;
          existing.load();
        }
      }
    }
  }, [segments]);

  // Auto-play audio segments synced with video playback
  useEffect(() => {
    if (segments.length === 0) return;

    const activeSegment = segments.find(
      (seg) => currentTime >= seg.startTime && currentTime <= seg.endTime
    );

    if (isPlaying && activeSegment) {
      // Only trigger playback once per segment entry
      if (activeSegIdRef.current === activeSegment.id) return;
      // If this segment already finished playing, don't replay it
      if (playedSegIdRef.current === activeSegment.id) return;

      // Stop previous audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current = null;
      }

      activeSegIdRef.current = activeSegment.id;
      setPlayingId(activeSegment.id);

      // Use preloaded audio element if available, otherwise create one
      let audio = preloadedAudioRef.current.get(activeSegment.id);
      if (!audio) {
        audio = new Audio(activeSegment.audioUrl);
      } else {
        // Reset to start
        audio.currentTime = 0;
      }

      audio.onended = () => {
        setPlayingId(null);
        // Mark as played so it won't re-trigger while still in the same segment
        playedSegIdRef.current = activeSegment.id;
      };

      // Wait for audio to be ready before playing
      const tryPlay = () => {
        audio!.play().catch((err) => {
          console.warn("TTS audio play failed:", err.message);
          setPlayingId(null);
          activeSegIdRef.current = null;
        });
      };

      if (audio.readyState >= 3) {
        tryPlay();
      } else {
        audio.addEventListener("canplay", tryPlay, { once: true });
      }
      audioRef.current = audio;
    } else if (!activeSegment) {
      // Left any segment region — reset tracking so re-entry will play again
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current = null;
      }
      activeSegIdRef.current = null;
      playedSegIdRef.current = null;
      setPlayingId(null);
    }

    // If video paused, pause the TTS audio too (but don't reset tracking)
    if (!isPlaying && audioRef.current) {
      audioRef.current.pause();
    }
  }, [currentTime, isPlaying, segments]);

  const timeToPercent = (time: number) => (time / duration) * 100;

  const handleTrackClick = useCallback(
    (e: React.MouseEvent) => {
      if (!trackRef.current) return;
      const target = e.target as HTMLElement;
      if (target.closest("[data-audio-block]")) return;

      const rect = trackRef.current.getBoundingClientRect();
      const percent = Math.max(
        0,
        Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)
      );
      onSeek((percent / 100) * duration);
    },
    [onSeek, duration]
  );

  const playSegment = useCallback((seg: AudioSegmentData) => {
    // Stop current playback
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }

    if (playingId === seg.id) {
      setPlayingId(null);
      activeSegIdRef.current = null;
      return;
    }

    // Use preloaded audio element if available
    let audio = preloadedAudioRef.current.get(seg.id);
    if (!audio) {
      audio = new Audio(seg.audioUrl);
    } else {
      audio.currentTime = 0;
    }

    audio.onended = () => {
      setPlayingId(null);
      activeSegIdRef.current = null;
    };

    const tryPlay = () => {
      audio!.play().catch((err) => {
        console.warn("TTS segment play failed:", err.message);
        setPlayingId(null);
        activeSegIdRef.current = null;
      });
    };

    if (audio.readyState >= 3) {
      tryPlay();
    } else {
      audio.addEventListener("canplay", tryPlay, { once: true });
    }
    audioRef.current = audio;
    activeSegIdRef.current = seg.id;
    setPlayingId(seg.id);
  }, [playingId]);

  const activeSegment = segments.find(
    (seg) => currentTime >= seg.startTime && currentTime <= seg.endTime
  );

  return (
    <div className="space-y-1.5">
      {/* Inline header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-[var(--color-black)]/50 uppercase tracking-wide">
            Audio TTS
          </span>
          {segments.length > 0 && (
            <span className="text-[10px] text-[var(--color-black)]/30">
              ({segments.length})
            </span>
          )}
          {isGenerating && (
            <span className="text-[10px] text-[var(--color-info)] animate-pulse">
              Generating...
            </span>
          )}
        </div>
        {activeSegment && (
          <span className="text-[10px] bg-purple-500/10 text-purple-600 px-1.5 py-0.5 rounded-full font-medium truncate max-w-[200px]">
            🔊 {activeSegment.text}
          </span>
        )}
      </div>

      {/* Timeline track */}
      <div
        ref={trackRef}
        className="relative h-9 bg-[var(--color-surface-overlay)] rounded-lg cursor-crosshair select-none overflow-visible shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]"
        onClick={handleTrackClick}
      >
        {/* Audio blocks */}
        {segments.map((seg) => {
          const left = timeToPercent(seg.startTime);
          const width = timeToPercent(seg.endTime - seg.startTime);
          const isActive =
            currentTime >= seg.startTime && currentTime <= seg.endTime;
          const isPlaying = playingId === seg.id;

          return (
            <div
              key={seg.id}
              data-audio-block
              className={`absolute top-1.5 bottom-1.5 rounded-md transition-shadow cursor-pointer ${
                isPlaying
                  ? "bg-purple-500/30 ring-2 ring-purple-500 shadow-[0_2px_8px_rgba(168,85,247,0.2)]"
                  : isActive
                    ? "bg-purple-500/25 ring-1 ring-purple-500/50"
                    : "bg-purple-500/15 ring-1 ring-purple-500/30"
              }`}
              style={{ left: `${left}%`, width: `${Math.max(width, 0.8)}%` }}
              onClick={(e) => {
                e.stopPropagation();
                playSegment(seg);
              }}
              title={`🔊 ${seg.text}`}
            >
              {/* Audio icon */}
              {width > 3 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-[9px] font-medium text-purple-600 truncate px-2 opacity-80 flex items-center gap-0.5">
                    {isPlaying ? "⏸" : "▶"} {seg.text}
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

      {/* Empty state */}
      {segments.length === 0 && !isGenerating && (
        <p className="text-[10px] text-[var(--color-black)]/30 text-center">
          No audio generated. Use &ldquo;Generate audio&rdquo; to synthesize voice
          from subtitles.
        </p>
      )}
    </div>
  );
}
