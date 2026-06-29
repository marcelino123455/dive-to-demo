"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface MusicTrackData {
  id: string;
  audioUrl: string; // object URL for playback
  prompt: string;
  durationMs: number;
}

interface MusicTimelineProps {
  track: MusicTrackData | null;
  duration: number; // video duration in seconds
  currentTime: number;
  isPlaying: boolean;
  volume: number; // 0-1
  onSeek: (time: number) => void;
  isGenerating: boolean;
}

export default function MusicTimeline({
  track,
  duration,
  currentTime,
  isPlaying,
  volume,
  onSeek,
  isGenerating,
}: MusicTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);

  const timeToPercent = (time: number) => (time / duration) * 100;

  // Keep a ref to track the audioUrl currently loaded
  const loadedUrlRef = useRef<string | null>(null);

  // Sync music playback with video
  useEffect(() => {
    if (!track) {
      // No track — stop and clean up
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      loadedUrlRef.current = null;
      setIsMusicPlaying(false);
      return;
    }

    // If the URL changed (e.g., blob: → presigned URL after reload), recreate the element
    if (audioRef.current && loadedUrlRef.current !== track.audioUrl) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    if (!audioRef.current) {
      const audio = new Audio();
      audio.loop = true;
      audio.volume = volume;
      audio.preload = "auto";

      // Handle load errors
      audio.onerror = () => {
        console.error("Music audio load error:", audio.error?.message);
      };

      audio.src = track.audioUrl;
      audio.load();
      audioRef.current = audio;
      loadedUrlRef.current = track.audioUrl;
    }

    const audio = audioRef.current;
    audio.volume = volume;

    if (isPlaying && !isMusicPlaying) {
      // Sync position to video time (modulo music duration)
      const musicDuration = track.durationMs / 1000;
      const musicTime = currentTime % musicDuration;

      // Wait for audio to be ready before playing
      const tryPlay = () => {
        audio.currentTime = musicTime;
        audio.play().catch((err) => {
          console.warn("Music play failed:", err.message);
        });
        setIsMusicPlaying(true);
      };

      if (audio.readyState >= 3) {
        // HAVE_FUTURE_DATA or better — can play
        tryPlay();
      } else {
        // Not ready yet — wait for canplay event
        audio.addEventListener("canplay", tryPlay, { once: true });
      }
    } else if (!isPlaying && isMusicPlaying) {
      audio.pause();
      setIsMusicPlaying(false);
    }
  }, [isPlaying, track, volume, isMusicPlaying, currentTime]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      loadedUrlRef.current = null;
    };
  }, []);

  // Update volume in real-time
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const handleTrackClick = useCallback(
    (e: React.MouseEvent) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const percent = Math.max(
        0,
        Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)
      );
      onSeek((percent / 100) * duration);
    },
    [onSeek, duration]
  );

  return (
    <div className="space-y-1.5">
      {/* Inline header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-[var(--color-black)]/50 uppercase tracking-wide">
            Background Music
          </span>
          {track && (
            <span className="text-[10px] text-[var(--color-black)]/30">
              ({Math.round(track.durationMs / 1000)}s)
            </span>
          )}
          {isGenerating && (
            <span className="text-[10px] text-pink-500 animate-pulse">
              Generating...
            </span>
          )}
        </div>
        {track && (
          <span className="text-[10px] bg-pink-500/10 text-pink-600 px-1.5 py-0.5 rounded-full font-medium truncate max-w-[200px]">
            🎵 {track.prompt}
          </span>
        )}
      </div>

      {/* Timeline track */}
      <div
        ref={trackRef}
        className="relative h-9 bg-[var(--color-surface-overlay)] rounded-lg cursor-crosshair select-none overflow-visible shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]"
        onClick={handleTrackClick}
      >
        {/* Music block - spans entire video duration */}
        {track && (
          <div
            className={`absolute top-1.5 bottom-1.5 left-0 right-0 rounded-md transition-shadow ${
              isMusicPlaying
                ? "bg-pink-500/25 ring-1 ring-pink-500/50"
                : "bg-pink-500/15 ring-1 ring-pink-500/30"
            }`}
          >
            {/* Waveform visual placeholder */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
              <div className="flex items-center gap-[2px] h-full px-2 opacity-40">
                {Array.from({ length: 60 }).map((_, i) => (
                  <div
                    key={i}
                    className="w-[2px] bg-pink-500 rounded-full"
                    style={{
                      height: `${20 + Math.sin(i * 0.5) * 30 + Math.random() * 20}%`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Playhead */}
        <div
          className="absolute top-0 h-full w-0.5 bg-[var(--color-accent)] z-10 pointer-events-none"
          style={{ left: `${timeToPercent(currentTime)}%` }}
        >
          <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-[var(--color-accent)] rounded-full shadow-sm" />
        </div>
      </div>

      {/* Empty state */}
      {!track && !isGenerating && (
        <p className="text-[10px] text-[var(--color-black)]/30 text-center">
          No music. Use &ldquo;Generate music&rdquo; to create an AI background track.
        </p>
      )}
    </div>
  );
}
