"use client";

import { useRef, useState, useCallback } from "react";

type RecordingStatus = "idle" | "recording" | "paused";

interface RecordingOptions {
  systemAudio: boolean;
  microphone: boolean;
}

interface ScreenRecorderProps {
  compact?: boolean;
}

export default function ScreenRecorder({ compact = false }: ScreenRecorderProps) {
  const [status, setStatus] = useState<RecordingStatus>("idle");
  const [options, setOptions] = useState<RecordingOptions>({
    systemAudio: true,
    microphone: false,
  });
  const [duration, setDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamsRef = useRef<MediaStream[]>([]);

  const startTimer = () => {
    setDuration(0);
    timerRef.current = setInterval(() => {
      setDuration((prev) => prev + 1);
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const startRecording = useCallback(async () => {
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: options.systemAudio,
      });

      streamsRef.current = [displayStream];
      const tracks: MediaStreamTrack[] = [...displayStream.getVideoTracks()];

      if (options.systemAudio) {
        const systemAudioTracks = displayStream.getAudioTracks();
        tracks.push(...systemAudioTracks);
      }

      if (options.microphone) {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
            },
          });
          streamsRef.current.push(micStream);
          tracks.push(...micStream.getAudioTracks());
        } catch (micErr) {
          console.warn("Could not access microphone:", micErr);
        }
      }

      const combinedStream = new MediaStream(tracks);

      const mimeType = MediaRecorder.isTypeSupported("video/mp4;codecs=avc1,mp4a.40.2")
        ? "video/mp4;codecs=avc1,mp4a.40.2"
        : MediaRecorder.isTypeSupported("video/mp4")
          ? "video/mp4"
          : MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
            ? "video/webm;codecs=vp9,opus"
            : "video/webm";

      const fileExtension = mimeType.includes("mp4") ? "mp4" : "webm";

      const mediaRecorder = new MediaRecorder(combinedStream, { mimeType });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        stopTimer();
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = `recording-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.${fileExtension}`;
        a.click();

        chunksRef.current = [];
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setStatus("idle");
      };

      displayStream.getVideoTracks()[0].onended = () => {
        stopRecording();
      };

      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;
      setStatus("recording");
      startTimer();
    } catch (err) {
      console.error("Error starting recording:", err);
    }
  }, [options]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    streamsRef.current.forEach((stream) => {
      stream.getTracks().forEach((track) => track.stop());
    });
    streamsRef.current = [];
    stopTimer();
  }, []);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
      setStatus("paused");
      stopTimer();
    }
  }, []);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
      setStatus("recording");
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    }
  }, []);

  if (compact) {
    return (
      <div className="flex flex-col items-center gap-4">
        <button
          onClick={startRecording}
          className="group relative flex items-center justify-center w-11 h-11 rounded-xl bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white transition-all duration-150 active:scale-[0.92] cursor-pointer shadow-[0_2px_8px_var(--color-accent-glow)]"
          title="New recording"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="4" fill="currentColor" />
          </svg>
        </button>
        <span className="text-[10px] text-[var(--color-black)]/40 leading-tight text-center">
          New<br />recording
        </span>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl p-6">
      {/* Subtle glow when recording */}
      {status === "recording" && (
        <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(ellipse_at_top,rgba(220,38,38,0.05),transparent_70%)] pointer-events-none" />
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        {/* Step number badge */}
        <div className="group/step relative flex items-center justify-center w-8 h-8 rounded-full bg-[var(--color-accent)] text-white text-sm font-bold shadow-[0_2px_8px_var(--color-accent-glow)] cursor-default shrink-0">
          1
          <span className="absolute left-full ml-2.5 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-[var(--color-black)] text-white text-xs px-3 py-1.5 opacity-0 pointer-events-none group-hover/step:opacity-100 transition-opacity duration-150 z-50">
            Record your screen capture
          </span>
        </div>
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-[var(--color-accent-glow)]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="4" />
          </svg>
        </div>
        <div>
          <h2 className="text-base font-semibold text-[var(--color-black)] leading-tight">Recorder</h2>
          <p className="text-xs text-[var(--color-black)]/50">Capture your screen</p>
        </div>
      </div>

      {/* Audio options */}
      {status === "idle" && (
        <div className="space-y-2.5 mb-5">
          <label className="group flex items-center gap-3 p-3 rounded-xl bg-[var(--color-surface-overlay)] cursor-pointer transition-colors hover:bg-[var(--color-celadon)]/20">
            <div className="relative flex items-center">
              <input
                type="checkbox"
                checked={options.systemAudio}
                onChange={(e) =>
                  setOptions((prev) => ({ ...prev, systemAudio: e.target.checked }))
                }
                className="peer sr-only"
              />
              <div className="w-9 h-5 rounded-full bg-[var(--color-alabaster)] peer-checked:bg-[var(--color-accent)] transition-colors" />
              <div className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.12)] transition-transform peer-checked:translate-x-4" />
            </div>
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--color-black)]/40">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
              <span className="text-sm text-[var(--color-black)]/70">System audio</span>
            </div>
          </label>

          <label className="group flex items-center gap-3 p-3 rounded-xl bg-[var(--color-surface-overlay)] cursor-pointer transition-colors hover:bg-[var(--color-celadon)]/20">
            <div className="relative flex items-center">
              <input
                type="checkbox"
                checked={options.microphone}
                onChange={(e) =>
                  setOptions((prev) => ({ ...prev, microphone: e.target.checked }))
                }
                className="peer sr-only"
              />
              <div className="w-9 h-5 rounded-full bg-[var(--color-alabaster)] peer-checked:bg-[var(--color-accent)] transition-colors" />
              <div className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.12)] transition-transform peer-checked:translate-x-4" />
            </div>
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--color-black)]/40">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
              <span className="text-sm text-[var(--color-black)]/70">Microphone</span>
            </div>
          </label>

          <p className="text-[11px] text-[var(--color-black)]/40 leading-relaxed px-1">
            The browser will ask what you want to share when starting the recording.
          </p>
        </div>
      )}

      {/* Timer display */}
      {status !== "idle" && (
        <div className="flex items-center justify-center gap-3 mb-5 py-4">
          <div className="relative">
            {status === "recording" && (
              <span className="absolute inset-0 rounded-full bg-[var(--color-danger)] animate-pulse-ring" />
            )}
            <span
              className={`relative block w-3 h-3 rounded-full ${
                status === "recording" ? "bg-[var(--color-danger)]" : "bg-[var(--color-warning)]"
              }`}
            />
          </div>
          <span className="text-4xl font-mono tabular-nums font-light text-[var(--color-black)] tracking-wider">
            {formatTime(duration)}
          </span>
          {status === "paused" && (
            <span className="text-xs font-medium text-[var(--color-warning)] bg-[var(--color-warning)]/10 px-2 py-0.5 rounded-full">
              PAUSED
            </span>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-col gap-2">
        {status === "idle" && (
          <button
            onClick={startRecording}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white font-medium rounded-xl transition-all duration-150 active:scale-[0.96] cursor-pointer shadow-[0_2px_8px_var(--color-accent-glow)]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="8" />
            </svg>
            Start recording
          </button>
        )}

        {status === "recording" && (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={pauseRecording}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--color-surface-overlay)] hover:bg-[var(--color-alabaster)] text-[var(--color-black)]/70 font-medium rounded-xl transition-all duration-150 active:scale-[0.96] cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
              Pause
            </button>
            <button
              onClick={stopRecording}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--color-danger)]/10 hover:bg-[var(--color-danger)]/15 text-[var(--color-danger)] font-medium rounded-xl transition-all duration-150 active:scale-[0.96] cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
              Stop
            </button>
          </div>
        )}

        {status === "paused" && (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={resumeRecording}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white font-medium rounded-xl transition-all duration-150 active:scale-[0.96] cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="6,4 20,12 6,20" />
              </svg>
              Resume
            </button>
            <button
              onClick={stopRecording}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--color-danger)]/10 hover:bg-[var(--color-danger)]/15 text-[var(--color-danger)] font-medium rounded-xl transition-all duration-150 active:scale-[0.96] cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
              Stop
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
