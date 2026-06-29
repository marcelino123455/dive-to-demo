"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useAuth } from "react-oidc-context";
import ZoomTimeline from "./ZoomTimeline";
import SubtitleTimeline from "./SubtitleTimeline";
import AudioTimeline from "./AudioTimeline";
import MusicTimeline from "./MusicTimeline";
import type { AudioSegmentData } from "./AudioTimeline";
import type { MusicTrackData } from "./MusicTimeline";
import type { ZoomKeyframe, AnalyzeZoomResponse } from "@/app/types/zoom";
import type { SubtitleSegment, TranscribeResponse } from "@/app/types/subtitle";
import { SUPPORTED_LANGUAGES, TRANSLATE_LANGUAGES } from "@/app/types/subtitle";

const ELEVENLABS_VOICES = [
  { id: "otexHjBv8GxtwScy3xAM", name: "Lauren", desc: "Friendly, comforting & soft", gender: "F" },
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", desc: "Calm, expressive, American", gender: "F" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", desc: "Soft, gentle, American", gender: "F" },
  { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", desc: "Warm, friendly, American", gender: "F" },
  { id: "XB0fDUnXU5powFXDhCwa", name: "Charlotte", desc: "Elegant, English-Swedish", gender: "F" },
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George", desc: "Raspy, British, distinctive", gender: "M" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh", desc: "Deep, confident, American", gender: "M" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", desc: "Deep, narration, American", gender: "M" },
  { id: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam", desc: "Young, versatile, American", gender: "M" },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", desc: "Deep, authoritative, British", gender: "M" },
] as const;

// Emotion/style presets for ElevenLabs voice_settings
const VOICE_STYLE_PRESETS = [
  {
    id: "engaging",
    label: "Engaging Demo",
    desc: "Expressive and dynamic — ideal for product demos",
    settings: { stability: 0.3, similarity_boost: 0.75, style: 0.7, use_speaker_boost: true },
  },
  {
    id: "professional",
    label: "Professional",
    desc: "Clear and trustworthy — corporate presentations",
    settings: { stability: 0.55, similarity_boost: 0.8, style: 0.4, use_speaker_boost: true },
  },
  {
    id: "enthusiastic",
    label: "Enthusiastic",
    desc: "Energetic and exciting — launches and highlights",
    settings: { stability: 0.2, similarity_boost: 0.7, style: 0.85, use_speaker_boost: true },
  },
  {
    id: "calm",
    label: "Calm",
    desc: "Soft and relaxed — step-by-step tutorials",
    settings: { stability: 0.65, similarity_boost: 0.8, style: 0.25, use_speaker_boost: false },
  },
  {
    id: "storytelling",
    label: "Storytelling",
    desc: "Dramatic with variation — telling a story",
    settings: { stability: 0.25, similarity_boost: 0.75, style: 0.9, use_speaker_boost: true },
  },
] as const;

interface Marker {
  id: string;
  time: number;
  label: string;
}

interface VideoEditorProps {
  onVideoChange?: (hasVideo: boolean) => void;
  loadedProject?: {
    videoUrl: string;
    videoName: string;
    edits: Record<string, unknown>;
    ulidVideo: string;
    audioUrls: Record<string, string>;
    musicUrl: string | null;
  } | null;
}

export default function VideoEditor({ onVideoChange, loadedProject }: VideoEditorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);

  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoName, setVideoName] = useState<string>("");
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [muteOriginalAudio, setMuteOriginalAudio] = useState(false);

  // Zoom state
  const [zoomKeyframes, setZoomKeyframes] = useState<ZoomKeyframe[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState("");
  const [videoWidth, setVideoWidth] = useState(0);
  const [videoHeight, setVideoHeight] = useState(0);

  // Subtitle state
  const [subtitleSegments, setSubtitleSegments] = useState<SubtitleSegment[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeProgress, setTranscribeProgress] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState("es-ES");
  const [showLanguageSelector, setShowLanguageSelector] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);

  // Translation state
  const [translateTo, setTranslateTo] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);
  const [translateProgress, setTranslateProgress] = useState("");
  const [showTranslateSelector, setShowTranslateSelector] = useState(false);
  const [selectedTranslateTarget, setSelectedTranslateTarget] = useState("en");

  // Audio TTS state
  const [audioSegments, setAudioSegments] = useState<AudioSegmentData[]>([]);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioProgress, setAudioProgress] = useState("");
  const [showAudioOptions, setShowAudioOptions] = useState(false);
  const [selectedVoiceId, setSelectedVoiceId] = useState("otexHjBv8GxtwScy3xAM"); // Lauren by default
  const [selectedStylePreset, setSelectedStylePreset] = useState("engaging"); // Best for demos

  // Background music state
  const [musicTrack, setMusicTrack] = useState<MusicTrackData | null>(null);
  const [isGeneratingMusic, setIsGeneratingMusic] = useState(false);
  const [musicProgress, setMusicProgress] = useState("");
  const [showMusicOptions, setShowMusicOptions] = useState(false);
  const [musicPrompt, setMusicPrompt] = useState("");
  const [musicVolume, setMusicVolume] = useState(0.3); // Lower by default so it doesn't overpower narration

  // Export state
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // Save project state
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [savedProjectId, setSavedProjectId] = useState<string | null>(null);

  // Loading project state (when video is loading from cloud)
  const [isLoadingProject, setIsLoadingProject] = useState(false);

  // Auth for userId
  const auth = useAuth();

  const syncTime = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
    animationRef.current = requestAnimationFrame(syncTime);
  }, []);

  useEffect(() => {
    if (isPlaying) {
      animationRef.current = requestAnimationFrame(syncTime);
    } else if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, syncTime]);

  // Cargar proyecto desde la nube cuando cambia loadedProject
  useEffect(() => {
    if (!loadedProject) return;

    // Mostrar loading mientras se carga el video
    setIsLoadingProject(true);

    // Limpiar video previo
    if (videoSrc) URL.revokeObjectURL(videoSrc);

    // Establecer la URL del video (presigned URL de S3)
    setVideoSrc(loadedProject.videoUrl);
    setVideoName(loadedProject.videoName);
    setCurrentTime(0);
    setIsPlaying(false);
    setSavedProjectId(loadedProject.ulidVideo);
    setSaveMessage("");

    // Restaurar ediciones del proyecto
    const edits = loadedProject.edits;
    if (edits) {
      if (Array.isArray(edits.zoomKeyframes)) {
        setZoomKeyframes(edits.zoomKeyframes as ZoomKeyframe[]);
      }
      if (Array.isArray(edits.subtitleSegments)) {
        setSubtitleSegments(edits.subtitleSegments as SubtitleSegment[]);
      }
      if (typeof edits.trimStart === "number") {
        setTrimStart(edits.trimStart as number);
      }
      if (typeof edits.trimEnd === "number") {
        setTrimEnd(edits.trimEnd as number);
      }
      if (typeof edits.playbackRate === "number") {
        setPlaybackRate(edits.playbackRate as number);
      }
      if (typeof edits.muteOriginalAudio === "boolean") {
        setMuteOriginalAudio(edits.muteOriginalAudio as boolean);
      }
      if (Array.isArray(edits.markers)) {
        setMarkers(edits.markers as Marker[]);
      }
      if (typeof edits.musicVolume === "number") {
        setMusicVolume(edits.musicVolume as number);
      }

      // Descargar audios y música como blobs para reproducción local
      // (las presigned URLs de S3 pueden no funcionar directamente en <audio>)
      const loadAudioAssets = async () => {
        // Restaurar segmentos de audio TTS
        if (Array.isArray(edits.audioSegments) && loadedProject.audioUrls) {
          const restoredAudio: AudioSegmentData[] = [];
          for (const seg of edits.audioSegments as { id: string; text: string; startTime: number; endTime: number }[]) {
            const presignedUrl = loadedProject.audioUrls[seg.id];
            if (presignedUrl) {
              restoredAudio.push({
                id: seg.id,
                text: seg.text,
                startTime: seg.startTime,
                endTime: seg.endTime,
                audioUrl: presignedUrl,
              });
            }
          }
          // Limpiar URLs de audio previos
          audioSegments.forEach((s) => {
            if (s.audioUrl.startsWith("blob:")) URL.revokeObjectURL(s.audioUrl);
          });
          setAudioSegments(restoredAudio);
        }

        // Restaurar música de fondo
        if (edits.musicTrack && loadedProject.musicUrl) {
          const mt = edits.musicTrack as { id: string; prompt: string; durationMs: number };
          if (musicTrack?.audioUrl?.startsWith("blob:")) {
            URL.revokeObjectURL(musicTrack.audioUrl);
          }
          setMusicTrack({
            id: mt.id,
            audioUrl: loadedProject.musicUrl,
            prompt: mt.prompt,
            durationMs: mt.durationMs,
          });
        }
      };

      loadAudioAssets();
    }

    onVideoChange?.(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedProject]);

  const handleFileLoad = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (videoSrc) URL.revokeObjectURL(videoSrc);

    const url = URL.createObjectURL(file);
    setVideoSrc(url);
    setVideoName(file.name);
    setVideoFile(file);
    setCurrentTime(0);
    setMarkers([]);
    setTrimStart(0);
    setIsPlaying(false);
    setZoomKeyframes([]);
    setAnalyzeProgress("");
    setSubtitleSegments([]);
    setTranscribeProgress("");
    onVideoChange?.(true);
  }, [videoSrc, onVideoChange]);

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      const dur = videoRef.current.duration;
      setDuration(dur);
      setTrimEnd(dur);
      setVideoWidth(videoRef.current.videoWidth);
      setVideoHeight(videoRef.current.videoHeight);
      setIsLoadingProject(false);
    }
  }, []);

  // Extract frames from video for AI analysis
  const extractFrames = useCallback(
    async (interval: number = 3): Promise<{ timestamp: number; data: string }[]> => {
      if (!videoRef.current || duration === 0) return [];

      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return [];

      // Scale down for faster transfer (max 1280px wide)
      const scale = Math.min(1, 1280 / video.videoWidth);
      canvas.width = Math.floor(video.videoWidth * scale);
      canvas.height = Math.floor(video.videoHeight * scale);

      const frames: { timestamp: number; data: string }[] = [];
      const totalFrames = Math.floor(duration / interval);

      // Max 20 frames to keep API payload manageable
      const maxFrames = 20;
      const actualInterval = totalFrames > maxFrames ? duration / maxFrames : interval;
      const frameCount = Math.min(totalFrames, maxFrames);

      for (let i = 0; i < frameCount; i++) {
        const timestamp = i * actualInterval;

        await new Promise<void>((resolve) => {
          video.currentTime = timestamp;
          video.onseeked = () => {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
            const base64 = dataUrl.split(",")[1];
            frames.push({ timestamp, data: base64 });
            resolve();
          };
        });

    setAnalyzeProgress(`Extracting frames: ${i + 1}/${frameCount}`);
      }

      // Restore video position
      video.currentTime = currentTime;

      return frames;
    },
    [duration, currentTime]
  );

  // Analyze video with Bedrock AI
  const analyzeZooms = useCallback(async () => {
    if (!videoRef.current || duration === 0) return;

    setIsAnalyzing(true);
    setAnalyzeProgress("Extracting frames from video...");

    try {
      const frames = await extractFrames(3);

      if (frames.length === 0) {
        setAnalyzeProgress("Could not extract frames");
        setIsAnalyzing(false);
        return;
      }

      setAnalyzeProgress(`Analyzing ${frames.length} frames with AI...`);

      const response = await fetch("/api/analyze-zoom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frames,
          videoDuration: duration,
          videoWidth,
          videoHeight,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error analyzing video");
      }

      const data: AnalyzeZoomResponse = await response.json();
      setZoomKeyframes(data.keyframes);
      setAnalyzeProgress(`Detected ${data.keyframes.length} zooms`);
    } catch (err) {
      console.error("Error analyzing zooms:", err);
      setAnalyzeProgress(
        err instanceof Error ? err.message : "Error analyzing the video"
      );
    } finally {
      setIsAnalyzing(false);
    }
  }, [duration, extractFrames, videoWidth, videoHeight]);

  // Transcribe audio with Amazon Transcribe
  const transcribeAudio = useCallback(async () => {
    if (!videoFile || duration === 0) return;

    setIsTranscribing(true);
    setTranscribeProgress("Preparing audio for transcription...");

    try {
      // Read the file as base64
      const arrayBuffer = await videoFile.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      let binary = "";
      const chunkSize = 8192;
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
      }
      const base64 = btoa(binary);

      // Determine media format from file extension
      const ext = videoFile.name.split(".").pop()?.toLowerCase() || "mp4";
      const mediaFormat = ext === "webm" ? "webm" : "mp4";

      setTranscribeProgress("Sending audio to Amazon Transcribe...");

      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioBase64: base64,
          languageCode: selectedLanguage,
          mediaFormat,
          translateTo: translateTo || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error transcribing");
      }

      const data: TranscribeResponse = await response.json();
      setSubtitleSegments(data.segments);
      setTranscribeProgress(`Generated ${data.segments.length} subtitles`);
    } catch (err) {
      console.error("Error transcribing:", err);
      setTranscribeProgress(
        err instanceof Error ? err.message : "Error transcribing the audio"
      );
    } finally {
      setIsTranscribing(false);
    }
  }, [videoFile, duration, selectedLanguage, translateTo]);

  // Translate existing subtitles with Amazon Translate
  const translateSubtitles = useCallback(async () => {
    if (subtitleSegments.length === 0 || !selectedTranslateTarget) return;

    setIsTranslating(true);
    setTranslateProgress("Translating subtitles...");

    try {
      // Derive source language from the transcription languageCode
      const sourceLanguage = selectedLanguage.split("-")[0];

      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segments: subtitleSegments,
          sourceLanguage,
          targetLanguage: selectedTranslateTarget,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error translating");
      }

      const data = await response.json();
      setSubtitleSegments(data.segments);
      setTranslateProgress(`Subtitles translated to ${TRANSLATE_LANGUAGES.find(l => l.code === selectedTranslateTarget)?.label || selectedTranslateTarget}`);
      setShowTranslateSelector(false);
    } catch (err) {
      console.error("Error translating:", err);
      setTranslateProgress(
        err instanceof Error ? err.message : "Error translating subtitles"
      );
    } finally {
      setIsTranslating(false);
    }
  }, [subtitleSegments, selectedTranslateTarget, selectedLanguage]);

  // Generate audio from subtitles using ElevenLabs
  const generateAudio = useCallback(async () => {
    if (subtitleSegments.length === 0) return;

    setIsGeneratingAudio(true);
    setAudioProgress("Preparing segments for speech synthesis...");

    try {
      const segmentsToSynthesize = subtitleSegments.map((seg) => ({
        id: seg.id,
        text: seg.text,
        startTime: seg.startTime,
        endTime: seg.endTime,
      }));

      setAudioProgress(`Generating audio for ${segmentsToSynthesize.length} segments...`);

      const response = await fetch("/api/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segments: segmentsToSynthesize,
          voiceId: selectedVoiceId,
          voiceSettings: VOICE_STYLE_PRESETS.find(p => p.id === selectedStylePreset)?.settings,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error synthesizing audio");
      }

      const data = await response.json();

      // Convert base64 audio to object URLs for playback
      const audioSegs: AudioSegmentData[] = data.audioSegments.map(
        (seg: { id: string; startTime: number; endTime: number; text: string; audioBase64: string }) => {
          const binary = atob(seg.audioBase64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: "audio/mpeg" });
          const url = URL.createObjectURL(blob);

          return {
            id: seg.id,
            startTime: seg.startTime,
            endTime: seg.endTime,
            text: seg.text,
            audioUrl: url,
          };
        }
      );

      // Cleanup old URLs
      audioSegments.forEach((seg) => URL.revokeObjectURL(seg.audioUrl));

      setAudioSegments(audioSegs);
      setAudioProgress(`Generated ${audioSegs.length} audio segments`);
    } catch (err) {
      console.error("Error generating audio:", err);
      setAudioProgress(
        err instanceof Error ? err.message : "Error generating audio"
      );
    } finally {
      setIsGeneratingAudio(false);
    }
  }, [subtitleSegments, audioSegments, selectedVoiceId, selectedStylePreset]);

  // Generate background music with ElevenLabs Music API
  const generateMusic = useCallback(async () => {
    if (!musicPrompt.trim() || duration === 0) return;

    setIsGeneratingMusic(true);
    setMusicProgress("Generating music with AI...");

    try {
      // Use video duration (capped at 600s max for ElevenLabs)
      const musicDurationMs = Math.min(Math.round(duration * 1000), 600000);

      const response = await fetch("/api/generate-music", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: musicPrompt,
          durationMs: musicDurationMs,
          instrumental: true,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error generating music");
      }

      const data = await response.json();

      // Cleanup old URL
      if (musicTrack) {
        URL.revokeObjectURL(musicTrack.audioUrl);
      }

      // Convert base64 to object URL
      const binary = atob(data.audioBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);

      setMusicTrack({
        id: crypto.randomUUID(),
        audioUrl: url,
        prompt: musicPrompt,
        durationMs: data.durationMs,
      });
      setMusicProgress("Music generated successfully");
    } catch (err) {
      console.error("Error generating music:", err);
      setMusicProgress(
        err instanceof Error ? err.message : "Error generating music"
      );
    } finally {
      setIsGeneratingMusic(false);
    }
  }, [musicPrompt, duration, musicTrack]);

  // Get active subtitle for current time (for overlay)
  const getActiveSubtitle = useCallback((): SubtitleSegment | null => {
    return (
      subtitleSegments.find(
        (seg) => currentTime >= seg.startTime && currentTime <= seg.endTime
      ) || null
    );
  }, [subtitleSegments, currentTime]);

  // Exportar video con todos los efectos aplicados (zoom, subtítulos, TTS, música)
  const exportVideo = useCallback(async () => {
    if (!videoRef.current || duration === 0) return;

    setIsExporting(true);
    setExportProgress(0);

    try {
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not create canvas");

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Rango efectivo de trim
      const startTime = trimStart;
      const endTime = trimEnd;
      const totalDuration = endTime - startTime;

      // Crear AudioContext para mezclar todas las fuentes de audio
      const audioCtx = new AudioContext();
      const mixerDestination = audioCtx.createMediaStreamDestination();

      // Fuente 1: Audio original del video (si no está silenciado)
      if (!muteOriginalAudio) {
        const videoSource = audioCtx.createMediaElementSource(video);
        videoSource.connect(mixerDestination);
        videoSource.connect(audioCtx.destination); // mantener audible durante export
      }

      // Fuente 2: Segmentos TTS - pre-decodificar los buffers de audio
      const ttsBuffers: { buffer: AudioBuffer; startTime: number }[] = [];
      for (const seg of audioSegments) {
        try {
          const response = await fetch(seg.audioUrl);
          const arrayBuffer = await response.arrayBuffer();
          const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
          ttsBuffers.push({ buffer: audioBuffer, startTime: seg.startTime });
        } catch (e) {
          console.warn("No se pudo decodificar segmento TTS:", seg.id, e);
        }
      }

      // Fuente 3: Música de fondo - pre-decodificar
      let musicBuffer: AudioBuffer | null = null;
      if (musicTrack) {
        try {
          const response = await fetch(musicTrack.audioUrl);
          const arrayBuffer = await response.arrayBuffer();
          musicBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        } catch (e) {
          console.warn("No se pudo decodificar música de fondo:", e);
        }
      }

      // Crear stream del canvas
      const canvasStream = canvas.captureStream(30);

      // Agregar audio mezclado al stream
      mixerDestination.stream.getAudioTracks().forEach((track) => {
        canvasStream.addTrack(track);
      });

      const mimeType = MediaRecorder.isTypeSupported("video/mp4;codecs=avc1,mp4a.40.2")
        ? "video/mp4;codecs=avc1,mp4a.40.2"
        : MediaRecorder.isTypeSupported("video/mp4")
          ? "video/mp4"
          : MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
            ? "video/webm;codecs=vp9,opus"
            : "video/webm";

      const fileExtension = mimeType.includes("mp4") ? "mp4" : "webm";

      const mediaRecorder = new MediaRecorder(canvasStream, {
        mimeType,
        videoBitsPerSecond: 5000000,
      });

      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const exportComplete = new Promise<Blob>((resolve, reject) => {
        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: mimeType });
          resolve(blob);
        };
        mediaRecorder.onerror = (e) => reject(e);
      });

      // Iniciar grabación
      mediaRecorder.start(100);

      // Posicionar video en el inicio del trim
      video.currentTime = startTime;
      video.playbackRate = 1;

      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
      });

      // Programar reproducción de segmentos TTS usando AudioBufferSourceNode
      const scheduledTtsSources: AudioBufferSourceNode[] = [];
      for (const tts of ttsBuffers) {
        // Solo programar si el segmento cae dentro del rango de trim
        if (tts.startTime >= startTime && tts.startTime < endTime) {
          const sourceNode = audioCtx.createBufferSource();
          sourceNode.buffer = tts.buffer;
          sourceNode.connect(mixerDestination);
          sourceNode.connect(audioCtx.destination);
          // Programar relativo al inicio de la exportación
          const delay = tts.startTime - startTime;
          sourceNode.start(audioCtx.currentTime + delay);
          scheduledTtsSources.push(sourceNode);
        }
      }

      // Programar música de fondo
      let musicSourceNode: AudioBufferSourceNode | null = null;
      if (musicBuffer) {
        musicSourceNode = audioCtx.createBufferSource();
        musicSourceNode.buffer = musicBuffer;
        const gainNode = audioCtx.createGain();
        gainNode.gain.value = musicVolume;
        musicSourceNode.connect(gainNode);
        gainNode.connect(mixerDestination);
        gainNode.connect(audioCtx.destination);
        musicSourceNode.start(audioCtx.currentTime);
        // Si la música es más corta que el video, permitir que termine naturalmente
      }

      // Reproducir video y dibujar frames
      video.play();

      const drawFrame = () => {
        if (video.currentTime >= endTime || video.paused) {
          video.pause();
          // Detener fuentes de audio programadas
          scheduledTtsSources.forEach((s) => { try { s.stop(); } catch {} });
          if (musicSourceNode) { try { musicSourceNode.stop(); } catch {} }
          mediaRecorder.stop();
          return;
        }

        // Actualizar progreso
        const progress = ((video.currentTime - startTime) / totalDuration) * 100;
        setExportProgress(Math.min(progress, 99));

        ctx.save();

        // Aplicar efecto de zoom
        const activeZoom = zoomKeyframes.find(
          (kf) => video.currentTime >= kf.startTime && video.currentTime <= kf.endTime
        );

        if (activeZoom) {
          const zoomDuration = activeZoom.endTime - activeZoom.startTime;
          const elapsed = video.currentTime - activeZoom.startTime;
          const transitionDuration = Math.min(0.5, zoomDuration / 4);
          let progress = 1;

          if (elapsed < transitionDuration) {
            progress = elapsed / transitionDuration;
          } else if (elapsed > zoomDuration - transitionDuration) {
            progress = (zoomDuration - elapsed) / transitionDuration;
          }

          progress = progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;

          const scale = 1 + (activeZoom.scale - 1) * progress;
          const originX = activeZoom.x * canvas.width;
          const originY = activeZoom.y * canvas.height;

          ctx.translate(originX, originY);
          ctx.scale(scale, scale);
          ctx.translate(-originX, -originY);
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.restore();

        // Dibujar subtítulos
        const activeSubtitle = subtitleSegments.find(
          (seg) => video.currentTime >= seg.startTime && video.currentTime <= seg.endTime
        );

        if (activeSubtitle) {
          const fontSize = Math.round(canvas.height * 0.045);
          ctx.font = `bold ${fontSize}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";

          const text = activeSubtitle.text;
          const x = canvas.width / 2;
          const y = canvas.height - fontSize * 1.2;

          // Caja de fondo
          const metrics = ctx.measureText(text);
          const padH = fontSize * 0.5;
          const padV = fontSize * 0.3;
          const boxWidth = metrics.width + padH * 2;
          const boxHeight = fontSize + padV * 2;

          ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
          ctx.beginPath();
          const radius = 8;
          const bx = x - boxWidth / 2;
          const by = y - boxHeight + padV * 0.5;
          ctx.roundRect(bx, by, boxWidth, boxHeight, radius);
          ctx.fill();

          ctx.fillStyle = "#ffffff";
          ctx.fillText(text, x, y);
        }

        requestAnimationFrame(drawFrame);
      };

      requestAnimationFrame(drawFrame);

      // Esperar a que termine la exportación
      const blob = await exportComplete;

      // Cerrar AudioContext
      await audioCtx.close();

      // Restaurar estado del video
      video.currentTime = currentTime;
      setIsPlaying(false);

      // Descargar el archivo
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const baseName = videoName.replace(/\.[^.]+$/, "");
      a.download = `${baseName}-edited.${fileExtension}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      setExportProgress(100);
    } catch (err) {
      console.error("Error exporting video:", err);
      alert(err instanceof Error ? err.message : "Error exporting video");
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  }, [
    duration,
    trimStart,
    trimEnd,
    currentTime,
    zoomKeyframes,
    subtitleSegments,
    videoName,
    muteOriginalAudio,
    audioSegments,
    musicTrack,
    musicVolume,
  ]);

  // Guardar proyecto en S3 + DynamoDB (incluye audios TTS y música)
  const saveProject = useCallback(async () => {
    if (!videoRef.current || duration === 0) return;

    // Para un proyecto nuevo necesitamos el archivo de video local
    // Para un proyecto existente (update) no lo necesitamos
    const isUpdate = !!savedProjectId;
    if (!isUpdate && !videoFile) return;

    const userId = auth.user?.profile?.sub;
    if (!userId) {
      setSaveMessage("Error: could not get userId");
      return;
    }

    setIsSaving(true);
    setSaveMessage(isUpdate ? "Updating project..." : "Saving project...");

    try {
      // Recopilar metadata de ediciones
      const editsMetadata = {
        trimStart,
        trimEnd,
        zoomKeyframes,
        subtitleSegments: subtitleSegments.map((s) => ({
          id: s.id,
          text: s.text,
          startTime: s.startTime,
          endTime: s.endTime,
        })),
        audioSegments: audioSegments.map((a) => ({
          id: a.id,
          text: a.text,
          startTime: a.startTime,
          endTime: a.endTime,
        })),
        musicTrack: musicTrack
          ? { id: musicTrack.id, prompt: musicTrack.prompt, durationMs: musicTrack.durationMs }
          : null,
        musicVolume,
        playbackRate,
        muteOriginalAudio,
        markers,
      };

      // Construir FormData
      const formData = new FormData();
      formData.append("userId", userId);
      formData.append("videoName", videoName);
      formData.append("edits", JSON.stringify(editsMetadata));

      if (isUpdate) {
        // Para update, enviar el ulidVideo existente (no re-subir video)
        formData.append("ulidVideo", savedProjectId);
      } else {
        // Para nuevo, enviar el archivo de video
        formData.append("video", videoFile!);
      }

      // Adjuntar archivos de audio TTS como blobs
      // Para updates solo adjuntamos audios que sean blob URLs (generados localmente)
      // Los que vienen de presigned URLs del servidor ya están en S3
      for (let i = 0; i < audioSegments.length; i++) {
        const seg = audioSegments[i];
        // Solo subir audios con blob: URL (generados localmente) o para proyectos nuevos
        if (!isUpdate || seg.audioUrl.startsWith("blob:")) {
          try {
            const response = await fetch(seg.audioUrl);
            const blob = await response.blob();
            formData.append(`audio_${i}`, blob, `${seg.id}.mp3`);
            formData.append(`audio_${i}_id`, seg.id);
          } catch (e) {
            console.warn("No se pudo obtener blob de audio TTS:", seg.id, e);
          }
        }
      }

      // Adjuntar música de fondo como blob (solo si es local/blob URL)
      if (musicTrack) {
        if (!isUpdate || musicTrack.audioUrl.startsWith("blob:")) {
          try {
            const response = await fetch(musicTrack.audioUrl);
            const blob = await response.blob();
            formData.append("music", blob, "track.mp3");
          } catch (e) {
            console.warn("No se pudo obtener blob de música:", e);
          }
        }
      }

      setSaveMessage("Uploading files...");

      const response = await fetch("/api/save-project", {
        method: isUpdate ? "PUT" : "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error saving project");
      }

      const data = await response.json();
      setSavedProjectId(data.ulidVideo);
      setSaveMessage(isUpdate
        ? `Project updated (ID: ${data.ulidVideo})`
        : `Project saved (ID: ${data.ulidVideo})`
      );
    } catch (err) {
      console.error("Error saving project:", err);
      setSaveMessage(
        err instanceof Error ? err.message : "Error saving project"
      );
    } finally {
      setIsSaving(false);
    }
  }, [
    videoFile,
    duration,
    auth.user,
    savedProjectId,
    trimStart,
    trimEnd,
    zoomKeyframes,
    subtitleSegments,
    audioSegments,
    musicTrack,
    musicVolume,
    playbackRate,
    muteOriginalAudio,
    markers,
    videoName,
  ]);

  // Get active zoom for current time (for live preview)
  const getActiveZoom = useCallback((): ZoomKeyframe | null => {
    return (
      zoomKeyframes.find(
        (kf) => currentTime >= kf.startTime && currentTime <= kf.endTime
      ) || null
    );
  }, [zoomKeyframes, currentTime]);

  // Calculate CSS transform for zoom preview
  const getZoomTransform = useCallback((): React.CSSProperties => {
    const activeZoom = getActiveZoom();
    if (!activeZoom) return {};

    // Calculate smooth transition progress within the zoom
    const zoomDuration = activeZoom.endTime - activeZoom.startTime;
    const elapsed = currentTime - activeZoom.startTime;

    // Ease in/out at the start and end of zoom
    const transitionDuration = Math.min(0.5, zoomDuration / 4);
    let progress = 1;

    if (elapsed < transitionDuration) {
      progress = elapsed / transitionDuration;
    } else if (elapsed > zoomDuration - transitionDuration) {
      progress = (zoomDuration - elapsed) / transitionDuration;
    }

    // Smooth easing
    progress = progress < 0.5
      ? 2 * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 2) / 2;

    const scale = 1 + (activeZoom.scale - 1) * progress;

    // Transform origin based on x,y position
    const originX = activeZoom.x * 100;
    const originY = activeZoom.y * 100;

    return {
      transform: `scale(${scale})`,
      transformOrigin: `${originX}% ${originY}%`,
      transition: "transform 0.1s ease-out",
    };
  }, [getActiveZoom, currentTime]);

  const handleTimelineClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!timelineRef.current || duration === 0) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percent = Math.max(0, Math.min(1, x / rect.width));
      const newTime = percent * duration;

      if (videoRef.current) {
        videoRef.current.currentTime = newTime;
        setCurrentTime(newTime);
      }
    },
    [duration]
  );

  const handleTimelineMouseDown = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handleTimelineMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isDragging || !timelineRef.current || duration === 0) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percent = Math.max(0, Math.min(1, x / rect.width));
      const newTime = percent * duration;

      if (videoRef.current) {
        videoRef.current.currentTime = newTime;
        setCurrentTime(newTime);
      }
    },
    [isDragging, duration]
  );

  const handleTimelineMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, []);

  const togglePlayPause = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  const handleVideoEnded = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const addMarker = useCallback(() => {
    const marker: Marker = {
      id: crypto.randomUUID(),
      time: currentTime,
      label: `Marker ${markers.length + 1}`,
    };
    setMarkers((prev) => [...prev, marker].sort((a, b) => a.time - b.time));
  }, [currentTime, markers.length]);

  const removeMarker = useCallback((id: string) => {
    setMarkers((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const jumpToMarker = useCallback((time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const seekRelative = useCallback(
    (seconds: number) => {
      if (!videoRef.current) return;
      const newTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + seconds));
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    },
    [duration]
  );

  const handlePlaybackRateChange = useCallback((rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  }, []);

  const handleVolumeChange = useCallback((vol: number) => {
    setVolume(vol);
    if (videoRef.current) {
      videoRef.current.volume = vol;
    }
  }, []);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!videoSrc) return;
      if ((e.target as HTMLElement).tagName === "INPUT") return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          togglePlayPause();
          break;
        case "ArrowLeft":
          e.preventDefault();
          seekRelative(e.shiftKey ? -5 : -1);
          break;
        case "ArrowRight":
          e.preventDefault();
          seekRelative(e.shiftKey ? 5 : 1);
          break;
        case "m":
          e.preventDefault();
          addMarker();
          break;
        case "Home":
          e.preventDefault();
          jumpToMarker(0);
          break;
        case "End":
          e.preventDefault();
          jumpToMarker(duration);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [videoSrc, togglePlayPause, seekRelative, addMarker, jumpToMarker, duration]);

  return (
    <div className="w-full rounded-2xl bg-[var(--color-surface-raised)] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.06),0_0_0_1px_var(--color-border-subtle)] space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        {/* Step number badge */}
        <div className="group/step relative flex items-center justify-center w-8 h-8 rounded-full bg-[var(--color-accent)] text-white text-sm font-bold shadow-[0_2px_8px_var(--color-accent-glow)] cursor-default shrink-0">
          2
          <span className="absolute left-full ml-2.5 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-[var(--color-black)] text-white text-xs px-3 py-1.5 opacity-0 pointer-events-none group-hover/step:opacity-100 transition-opacity duration-150 z-50">
            Edit your video with AI tools
          </span>
        </div>
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-[var(--color-celadon)]/20">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-seaweed)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
            <line x1="7" y1="2" x2="7" y2="22" />
            <line x1="17" y1="2" x2="17" y2="22" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <line x1="2" y1="7" x2="7" y2="7" />
            <line x1="2" y1="17" x2="7" y2="17" />
            <line x1="17" y1="7" x2="22" y2="7" />
            <line x1="17" y1="17" x2="22" y2="17" />
          </svg>
        </div>
        <div>
          <h2 className="text-base font-semibold text-[var(--color-black)] leading-tight">Video Editor</h2>
          <p className="text-xs text-[var(--color-black)]/50">Trim, mark and adjust</p>
        </div>
      </div>

      {/* File upload */}
      {!videoSrc && (
        <div className="rounded-xl border-2 border-dashed border-[var(--color-celadon)] bg-[var(--color-celadon)]/5 p-10 text-center transition-colors hover:bg-[var(--color-celadon)]/10">
          <label className="cursor-pointer space-y-3 block">
            <div className="flex items-center justify-center w-14 h-14 mx-auto rounded-2xl bg-[var(--color-accent-glow)]">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <p className="text-sm text-[var(--color-black)]/70 text-wrap-balance">Drag a video or click to select</p>
            <p className="text-xs text-[var(--color-black)]/40">Supports MP4, WebM, MOV</p>
            <input
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              onChange={handleFileLoad}
              className="hidden"
            />
            <span className="inline-block mt-3 px-5 py-2.5 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white rounded-lg text-sm font-medium transition-colors active:scale-[0.96]">
              Select file
            </span>
          </label>
        </div>
      )}

      {/* Video player */}
      {videoSrc && (
        <>
          <div className="relative rounded-xl overflow-hidden bg-[var(--color-black)] shadow-[0_2px_12px_rgba(0,0,0,0.1)]">
            {/* Loading overlay when project is loading from cloud */}
            {isLoadingProject && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[var(--color-black)]/80 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-3">
                  <div className="relative">
                    <div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-celadon)]/30 border-t-[var(--color-accent)]" />
                  </div>
                  <p className="text-sm text-white/80 font-medium">Loading video...</p>
                  <p className="text-xs text-white/50">{videoName}</p>
                </div>
              </div>
            )}
            <video
              ref={videoRef}
              src={videoSrc}
              crossOrigin="anonymous"
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={handleVideoEnded}
              className="w-full max-h-[400px] object-contain"
              style={getZoomTransform()}
              muted={muteOriginalAudio}
              playsInline
            />
            {/* Zoom indicator overlay */}
            {getActiveZoom() && (
              <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm text-white text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5 pointer-events-none">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                {getActiveZoom()!.scale.toFixed(1)}x
              </div>
            )}
            {/* Subtitle overlay */}
            {getActiveSubtitle() && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/75 backdrop-blur-sm text-white text-sm px-4 py-2 rounded-lg max-w-[80%] text-center pointer-events-none shadow-lg">
                {getActiveSubtitle()!.text}
              </div>
            )}
          </div>

          {/* File name */}
          <div className="flex items-center justify-between text-sm text-[var(--color-black)]/50">
            <span className="truncate max-w-[60%] flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              {videoName}
            </span>
            <button
              onClick={() => {
                if (videoSrc) URL.revokeObjectURL(videoSrc);
                setVideoSrc(null);
                setVideoName("");
                setDuration(0);
                setCurrentTime(0);
                setMarkers([]);
                onVideoChange?.(false);
              }}
              className="text-[var(--color-danger)]/70 hover:text-[var(--color-danger)] text-xs cursor-pointer transition-colors flex items-center gap-1"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              Close video
            </button>
          </div>

          {/* Timeline tracks */}
          <div className="space-y-2">
            {/* Skeleton loading for timelines */}
            {isLoadingProject ? (
              <div className="space-y-3 animate-pulse">
                {/* Skeleton main timeline */}
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-md bg-[var(--color-surface-overlay)]" />
                  <div className="flex-1 h-12 rounded-lg bg-[var(--color-surface-overlay)]" />
                </div>
                {/* Skeleton time display */}
                <div className="flex justify-between pl-9">
                  <div className="h-3 w-16 rounded bg-[var(--color-surface-overlay)]" />
                  <div className="h-3 w-16 rounded bg-[var(--color-surface-overlay)]" />
                </div>
                {/* Skeleton zoom timeline */}
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-md bg-[var(--color-surface-overlay)]" />
                  <div className="flex-1 h-8 rounded-lg bg-[var(--color-surface-overlay)]" />
                </div>
                {/* Skeleton subtitle timeline */}
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-md bg-[var(--color-surface-overlay)]" />
                  <div className="flex-1 h-8 rounded-lg bg-[var(--color-surface-overlay)]" />
                </div>
                {/* Skeleton audio timeline */}
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-md bg-[var(--color-surface-overlay)]" />
                  <div className="flex-1 h-8 rounded-lg bg-[var(--color-surface-overlay)]" />
                </div>
              </div>
            ) : (
            <>
            {/* Main timeline row: SVG icon + timeline */}
            <div className="flex items-center gap-2">
              {/* Video track icon */}
              <div className="flex-shrink-0 group relative">
                <div className="flex items-center justify-center w-7 h-7 rounded-md bg-[var(--color-surface-overlay)]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-black)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.5">
                    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
                    <line x1="7" y1="2" x2="7" y2="22" />
                    <line x1="17" y1="2" x2="17" y2="22" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                  </svg>
                </div>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-[var(--color-black)] text-white text-[10px] rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                  Main video
                </div>
              </div>

              {/* Main timeline */}
              <div className="flex-1">
                <div
                  ref={timelineRef}
                  className="relative h-12 bg-[var(--color-surface-overlay)] rounded-lg cursor-crosshair select-none overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]"
                  onClick={handleTimelineClick}
                  onMouseDown={handleTimelineMouseDown}
                  onMouseMove={handleTimelineMouseMove}
                  onMouseUp={handleTimelineMouseUp}
                >
                  {/* Trim zone */}
                  <div
                    className="absolute top-0 h-full bg-[var(--color-celadon)]/20"
                    style={{
                      left: `${(trimStart / duration) * 100}%`,
                      width: `${((trimEnd - trimStart) / duration) * 100}%`,
                    }}
                  />

                  {/* Progress */}
                  <div
                    className="absolute top-0 left-0 h-full bg-[var(--color-accent)]/20"
                    style={{ width: `${(currentTime / duration) * 100}%` }}
                  />

                  {/* Markers */}
                  {markers.map((marker) => (
                    <div
                      key={marker.id}
                      className="absolute top-0 h-full w-0.5 bg-[var(--color-warning)]"
                      style={{ left: `${(marker.time / duration) * 100}%` }}
                      title={`${marker.label} (${formatTime(marker.time)})`}
                    />
                  ))}

                  {/* Playhead */}
                  <div
                    className="absolute top-0 h-full w-0.5 bg-[var(--color-accent)] z-10"
                    style={{ left: `${(currentTime / duration) * 100}%` }}
                  >
                    <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-[var(--color-accent)] rounded-full shadow-[0_1px_4px_rgba(47,182,116,0.4)]" />
                  </div>

                  {/* Time marks */}
                  {duration > 0 &&
                    Array.from({ length: Math.min(10, Math.floor(duration / 5) + 1) }).map((_, i) => {
                      const time = (i / Math.min(10, Math.floor(duration / 5) + 1)) * duration;
                      return (
                        <div
                          key={i}
                          className="absolute bottom-0.5 text-[9px] text-[var(--color-black)]/30 font-mono"
                          style={{ left: `${(time / duration) * 100}%` }}
                        >
                          {formatTime(time)}
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>

            {/* Current time display */}
            <div className="flex justify-between text-xs text-[var(--color-black)]/50 font-mono tabular-nums pl-9">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>

            {/* Zoom timeline row: SVG analyze button + zoom timeline */}
            <div className="flex items-start gap-2">
              {/* Analyze zoom icon button */}
              <div className="flex-shrink-0 group relative">
                <button
                  onClick={analyzeZooms}
                  disabled={isAnalyzing}
                  className={`flex items-center justify-center w-7 h-7 rounded-md transition-all cursor-pointer ${
                    isAnalyzing
                      ? "bg-[var(--color-surface-overlay)] cursor-wait"
                      : "bg-[var(--color-accent)]/10 hover:bg-[var(--color-accent)]/20"
                  }`}
                  title="Analyze zooms with AI"
                >
                  {isAnalyzing ? (
                    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-seaweed)" strokeWidth="2">
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-seaweed)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      <line x1="11" y1="8" x2="11" y2="14" />
                      <line x1="8" y1="11" x2="14" y2="11" />
                    </svg>
                  )}
                </button>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-[var(--color-black)] text-white text-[10px] rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                  Analyze zooms with AI
                </div>
              </div>

              {/* Zoom timeline */}
              <div className="flex-1">
                <ZoomTimeline
                  keyframes={zoomKeyframes}
                  duration={duration}
                  currentTime={currentTime}
                  onKeyframesChange={setZoomKeyframes}
                  onSeek={(time) => {
                    if (videoRef.current) {
                      videoRef.current.currentTime = time;
                      setCurrentTime(time);
                    }
                  }}
                />
              </div>
            </div>

            {/* Progress message for zoom analysis */}
            {analyzeProgress && (
              <p className={`text-xs pl-9 ${isAnalyzing ? "text-[var(--color-black)]/50" : "text-[var(--color-accent)]"}`}>
                {analyzeProgress}
              </p>
            )}

            {/* Subtitle timeline row: SVG button + subtitle timeline */}
            <div className="flex items-start gap-2">
              {/* Transcribe subtitle icon button */}
              <div className="flex-shrink-0 group relative">
                <button
                  onClick={() => {
                    if (subtitleSegments.length === 0 && !isTranscribing) {
                      setShowLanguageSelector(!showLanguageSelector);
                    }
                  }}
                  disabled={isTranscribing}
                  className={`flex items-center justify-center w-7 h-7 rounded-md transition-all cursor-pointer ${
                    isTranscribing
                      ? "bg-[var(--color-surface-overlay)] cursor-wait"
                      : "bg-[var(--color-warning)]/10 hover:bg-[var(--color-warning)]/20"
                  }`}
                  title="Generate subtitles"
                >
                  {isTranscribing ? (
                    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" strokeWidth="2">
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      <line x1="8" y1="9" x2="16" y2="9" />
                      <line x1="8" y1="13" x2="12" y2="13" />
                    </svg>
                  )}
                </button>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-[var(--color-black)] text-white text-[10px] rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                  Generate subtitles
                </div>
              </div>

              {/* Subtitle timeline */}
              <div className="flex-1">
                <SubtitleTimeline
                  segments={subtitleSegments}
                  duration={duration}
                  currentTime={currentTime}
                  onSegmentsChange={setSubtitleSegments}
                  onSeek={(time) => {
                    if (videoRef.current) {
                      videoRef.current.currentTime = time;
                      setCurrentTime(time);
                    }
                  }}
                />
              </div>
            </div>

            {/* Language selector popup */}
            {showLanguageSelector && (
              <div className="pl-9 space-y-2">
                <div className="p-3 rounded-xl bg-[var(--color-surface-overlay)] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[var(--color-black)]/60">Audio language</span>
                    <button
                      onClick={() => setShowLanguageSelector(false)}
                      className="text-[var(--color-black)]/40 hover:text-[var(--color-black)]/60 cursor-pointer"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                  <select
                    value={selectedLanguage}
                    onChange={(e) => setSelectedLanguage(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] text-[var(--color-black)] focus:outline-none focus:ring-2 focus:ring-[var(--color-warning)]/30 focus:border-[var(--color-warning)]/50"
                  >
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.label}
                      </option>
                    ))}
                  </select>

                  {/* Optional: translate during transcription */}
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 text-xs text-[var(--color-black)]/50">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 8l6 6" />
                        <path d="M4 14l6-6 2-3" />
                        <path d="M2 5h12" />
                        <path d="M7 2h1" />
                        <path d="M22 22l-5-10-5 10" />
                        <path d="M14 18h6" />
                      </svg>
                      Translate subtitles to (optional)
                    </label>
                    <select
                      value={translateTo}
                      onChange={(e) => setTranslateTo(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] text-[var(--color-black)] focus:outline-none focus:ring-2 focus:ring-[var(--color-celadon)]/30 focus:border-[var(--color-celadon)]/50"
                    >
                      <option value="">No translation</option>
                      {TRANSLATE_LANGUAGES.filter(l => l.code !== "auto").map((lang) => (
                        <option key={lang.code} value={lang.code}>
                          {lang.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={() => {
                      setShowLanguageSelector(false);
                      transcribeAudio();
                    }}
                    className="w-full px-4 py-2 bg-[var(--color-warning)] hover:bg-[var(--color-warning)]/90 text-white rounded-lg text-sm font-medium transition-colors active:scale-[0.96] cursor-pointer"
                  >
                    {translateTo ? "Transcribe and translate" : "Transcribe audio"}
                  </button>
                </div>
              </div>
            )}

            {/* Translate existing subtitles */}
            {subtitleSegments.length > 0 && !isTranscribing && (
              <div className="pl-9">
                {!showTranslateSelector ? (
                  <button
                    onClick={() => setShowTranslateSelector(true)}
                    disabled={isTranslating}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors active:scale-[0.96] cursor-pointer ${
                      isTranslating
                        ? "bg-[var(--color-surface-overlay)] text-[var(--color-black)]/50 cursor-wait"
                        : "bg-[var(--color-celadon)]/15 hover:bg-[var(--color-celadon)]/25 text-[var(--color-seaweed)]"
                    }`}
                  >
                    {isTranslating ? (
                      <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                      </svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 8l6 6" />
                        <path d="M4 14l6-6 2-3" />
                        <path d="M2 5h12" />
                        <path d="M7 2h1" />
                        <path d="M22 22l-5-10-5 10" />
                        <path d="M14 18h6" />
                      </svg>
                    )}
                    Translate subtitles
                  </button>
                ) : (
                  <div className="p-3 rounded-xl bg-[var(--color-surface-overlay)] space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-[var(--color-black)]/60">Translate to</span>
                      <button
                        onClick={() => setShowTranslateSelector(false)}
                        className="text-[var(--color-black)]/40 hover:text-[var(--color-black)]/60 cursor-pointer"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                    <select
                      value={selectedTranslateTarget}
                      onChange={(e) => setSelectedTranslateTarget(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] text-[var(--color-black)] focus:outline-none focus:ring-2 focus:ring-[var(--color-celadon)]/30 focus:border-[var(--color-celadon)]/50"
                    >
                      {TRANSLATE_LANGUAGES.filter(l => l.code !== "auto").map((lang) => (
                        <option key={lang.code} value={lang.code}>
                          {lang.label}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={translateSubtitles}
                      disabled={isTranslating}
                      className="w-full px-4 py-2 bg-[var(--color-seaweed)] hover:bg-[var(--color-seaweed)]/90 text-white rounded-lg text-sm font-medium transition-colors active:scale-[0.96] cursor-pointer"
                    >
                      {isTranslating ? "Translating..." : "Translate"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Progress message for transcription */}
            {transcribeProgress && (
              <p className={`text-xs pl-9 ${isTranscribing ? "text-[var(--color-black)]/50" : "text-[var(--color-warning)]"}`}>
                {transcribeProgress}
              </p>
            )}

            {/* Progress message for translation */}
            {translateProgress && (
              <p className={`text-xs pl-9 ${isTranslating ? "text-[var(--color-black)]/50" : "text-[var(--color-seaweed)]"}`}>
                {translateProgress}
              </p>
            )}

            {/* Audio TTS timeline row: SVG button + audio timeline */}
            <div className="flex items-start gap-2">
              {/* Generate audio icon button */}
              <div className="flex-shrink-0 group relative">
                <button
                  onClick={() => {
                    if (subtitleSegments.length > 0 && !isGeneratingAudio) {
                      setShowAudioOptions(!showAudioOptions);
                    }
                  }}
                  disabled={isGeneratingAudio || subtitleSegments.length === 0}
                  className={`flex items-center justify-center w-7 h-7 rounded-md transition-all cursor-pointer ${
                    isGeneratingAudio
                      ? "bg-[var(--color-surface-overlay)] cursor-wait"
                      : subtitleSegments.length === 0
                        ? "bg-[var(--color-surface-overlay)] opacity-40 cursor-not-allowed"
                        : "bg-purple-500/10 hover:bg-purple-500/20"
                  }`}
                  title={subtitleSegments.length === 0 ? "Generate subtitles first" : "Generate TTS audio"}
                >
                  {isGeneratingAudio ? (
                    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgb(168,85,247)" strokeWidth="2">
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgb(168,85,247)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                    </svg>
                  )}
                </button>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-[var(--color-black)] text-white text-[10px] rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                  Generate TTS audio
                </div>
              </div>

              {/* Audio timeline */}
              <div className="flex-1">
                <AudioTimeline
                  segments={audioSegments}
                  duration={duration}
                  currentTime={currentTime}
                  isPlaying={isPlaying}
                  onSeek={(time) => {
                    if (videoRef.current) {
                      videoRef.current.currentTime = time;
                      setCurrentTime(time);
                    }
                  }}
                  isGenerating={isGeneratingAudio}
                />
              </div>
            </div>

            {/* Audio options selector */}
            {showAudioOptions && subtitleSegments.length > 0 && (
              <div className="pl-9 space-y-2">
                <div className="p-3 rounded-xl bg-[var(--color-surface-overlay)] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[var(--color-black)]/60">Generate audio from subtitles</span>
                    <button
                      onClick={() => setShowAudioOptions(false)}
                      className="text-[var(--color-black)]/40 hover:text-[var(--color-black)]/60 cursor-pointer"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>

                  {/* Voice selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-[var(--color-black)]/50">Voice</label>
                    <select
                      value={selectedVoiceId}
                      onChange={(e) => setSelectedVoiceId(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] text-[var(--color-black)] focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500/50"
                    >
                      <optgroup label="Female voices">
                        {ELEVENLABS_VOICES.filter(v => v.gender === "F").map((voice) => (
                          <option key={voice.id} value={voice.id}>
                            {voice.name} — {voice.desc}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Male voices">
                        {ELEVENLABS_VOICES.filter(v => v.gender === "M").map((voice) => (
                          <option key={voice.id} value={voice.id}>
                            {voice.name} — {voice.desc}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  {/* Style/emotion preset selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-[var(--color-black)]/50">Voice style</label>
                    <div className="grid grid-cols-1 gap-1.5">
                      {VOICE_STYLE_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          onClick={() => setSelectedStylePreset(preset.id)}
                          className={`text-left px-3 py-2 rounded-lg border transition-all cursor-pointer ${
                            selectedStylePreset === preset.id
                              ? "border-purple-500 bg-purple-500/10 ring-1 ring-purple-500/30"
                              : "border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] hover:bg-purple-500/5"
                          }`}
                        >
                          <span className={`text-xs font-medium ${selectedStylePreset === preset.id ? "text-purple-700" : "text-[var(--color-black)]/70"}`}>
                            {preset.label}
                          </span>
                          <p className="text-[10px] text-[var(--color-black)]/40 mt-0.5">
                            {preset.desc}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <p className="text-[10px] text-[var(--color-black)]/40">
                    Voice will be generated with ElevenLabs for each currently visible subtitle segment.
                  </p>

                  <button
                    onClick={() => {
                      setShowAudioOptions(false);
                      generateAudio();
                    }}
                    disabled={isGeneratingAudio}
                    className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors active:scale-[0.96] cursor-pointer"
                  >
                    {isGeneratingAudio ? "Generating..." : "Generate audio with ElevenLabs"}
                  </button>
                </div>
              </div>
            )}

            {/* Progress message for audio generation */}
            {audioProgress && (
              <p className={`text-xs pl-9 ${isGeneratingAudio ? "text-[var(--color-black)]/50" : "text-purple-600"}`}>
                {audioProgress}
              </p>
            )}

            {/* Music timeline row: SVG button + music timeline */}
            <div className="flex items-start gap-2">
              {/* Generate music icon button */}
              <div className="flex-shrink-0 group relative">
                <button
                  onClick={() => setShowMusicOptions(!showMusicOptions)}
                  disabled={isGeneratingMusic}
                  className={`flex items-center justify-center w-7 h-7 rounded-md transition-all cursor-pointer ${
                    isGeneratingMusic
                      ? "bg-[var(--color-surface-overlay)] cursor-wait"
                      : "bg-pink-500/10 hover:bg-pink-500/20"
                  }`}
                  title="Generate background music"
                >
                  {isGeneratingMusic ? (
                    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgb(236,72,153)" strokeWidth="2">
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgb(236,72,153)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 18V5l12-2v13" />
                      <circle cx="6" cy="18" r="3" />
                      <circle cx="18" cy="16" r="3" />
                    </svg>
                  )}
                </button>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-[var(--color-black)] text-white text-[10px] rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                  Generate background music
                </div>
              </div>

              {/* Music timeline */}
              <div className="flex-1">
                <MusicTimeline
                  track={musicTrack}
                  duration={duration}
                  currentTime={currentTime}
                  isPlaying={isPlaying}
                  volume={musicVolume}
                  onSeek={(time) => {
                    if (videoRef.current) {
                      videoRef.current.currentTime = time;
                      setCurrentTime(time);
                    }
                  }}
                  isGenerating={isGeneratingMusic}
                />
              </div>
            </div>

            {/* Music options panel */}
            {showMusicOptions && (
              <div className="pl-9 space-y-2">
                <div className="p-3 rounded-xl bg-[var(--color-surface-overlay)] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[var(--color-black)]/60">AI Background Music</span>
                    <button
                      onClick={() => setShowMusicOptions(false)}
                      className="text-[var(--color-black)]/40 hover:text-[var(--color-black)]/60 cursor-pointer"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>

                  {/* Prompt input */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-[var(--color-black)]/50">Describe the music you want</label>
                    <textarea
                      value={musicPrompt}
                      onChange={(e) => setMusicPrompt(e.target.value)}
                      placeholder="Ej: Upbeat, modern lo-fi background music for a tech product demo. Soft piano, subtle drums, positive and professional vibe."
                      className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] text-[var(--color-black)] focus:outline-none focus:ring-2 focus:ring-pink-500/30 focus:border-pink-500/50 resize-none h-20 placeholder:text-[var(--color-black)]/30"
                    />
                  </div>

                  {/* Quick presets */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-[var(--color-black)]/50">Quick presets</label>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { label: "Tech Demo", prompt: "Upbeat modern lo-fi electronic background music for a tech product demo. Soft synths, subtle drums, positive and professional vibe, 100 BPM" },
                        { label: "Corporate", prompt: "Inspiring corporate background music. Gentle piano, light strings, optimistic and clean. Professional presentation mood, 90 BPM" },
                        { label: "Energetic", prompt: "Energetic upbeat electronic music for an exciting product launch video. Driving beat, synth arpeggios, building energy, 128 BPM" },
                        { label: "Chill", prompt: "Calm chill ambient background music. Soft pads, gentle guitar, relaxing atmosphere for a tutorial video, 80 BPM" },
                        { label: "Cinematic", prompt: "Cinematic inspirational orchestral background music. Building strings, epic drums, emotional and powerful for a brand video, 95 BPM" },
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          onClick={() => setMusicPrompt(preset.prompt)}
                          className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors cursor-pointer ${
                            musicPrompt === preset.prompt
                              ? "bg-pink-500/20 text-pink-700 ring-1 ring-pink-500/30"
                              : "bg-[var(--color-surface-raised)] text-[var(--color-black)]/60 hover:bg-pink-500/10"
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Volume control */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-[var(--color-black)]/50">
                      Background volume: {Math.round(musicVolume * 100)}%
                    </label>
                    <input
                      type="range"
                      min="0.05"
                      max="0.8"
                      step="0.05"
                      value={musicVolume}
                      onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
                      className="w-full accent-pink-500"
                    />
                    <p className="text-[10px] text-[var(--color-black)]/40">
                      Low volume recommended so it doesn&apos;t overpower narration.
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setShowMusicOptions(false);
                      generateMusic();
                    }}
                    disabled={isGeneratingMusic || !musicPrompt.trim()}
                    className={`w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors active:scale-[0.96] cursor-pointer ${
                      !musicPrompt.trim()
                        ? "bg-pink-500/30 text-white/60 cursor-not-allowed"
                        : "bg-pink-600 hover:bg-pink-700 text-white"
                    }`}
                  >
                    {isGeneratingMusic ? "Generating music..." : "Generate background music"}
                  </button>
                </div>
              </div>
            )}

            {/* Progress message for music generation */}
            {musicProgress && (
              <p className={`text-xs pl-9 ${isGeneratingMusic ? "text-[var(--color-black)]/50" : "text-pink-600"}`}>
                {musicProgress}
              </p>
            )}
            </>
            )}
          </div>

          {/* Transport controls */}
          <div className="flex items-center justify-center gap-1.5">
            <button
              onClick={() => jumpToMarker(0)}
              className="p-2.5 hover:bg-[var(--color-surface-overlay)] rounded-lg transition-colors cursor-pointer"
              title="Start"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--color-black)" opacity="0.6">
                <path d="M19 20L9 12l10-8v16zM5 19V5h2v14H5z" />
              </svg>
            </button>
            <button
              onClick={() => seekRelative(-5)}
              className="p-2.5 hover:bg-[var(--color-surface-overlay)] rounded-lg transition-colors cursor-pointer"
              title="-5s"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--color-black)" opacity="0.6">
                <path d="M18 20L8 12l10-8v16zM6 20l-1 0V4h1v16z" />
              </svg>
            </button>
            <button
              onClick={() => seekRelative(-1)}
              className="p-2.5 hover:bg-[var(--color-surface-overlay)] rounded-lg transition-colors cursor-pointer"
              title="-1s"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--color-black)" opacity="0.6">
                <polygon points="19,20 9,12 19,4" />
              </svg>
            </button>
            <button
              onClick={togglePlayPause}
              className="p-3.5 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white rounded-full transition-all duration-150 active:scale-[0.96] cursor-pointer shadow-[0_2px_8px_var(--color-accent-glow)] mx-1"
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="6,4 20,12 6,20" />
                </svg>
              )}
            </button>
            <button
              onClick={() => seekRelative(1)}
              className="p-2.5 hover:bg-[var(--color-surface-overlay)] rounded-lg transition-colors cursor-pointer"
              title="+1s"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--color-black)" opacity="0.6">
                <polygon points="5,4 15,12 5,20" />
              </svg>
            </button>
            <button
              onClick={() => seekRelative(5)}
              className="p-2.5 hover:bg-[var(--color-surface-overlay)] rounded-lg transition-colors cursor-pointer"
              title="+5s"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--color-black)" opacity="0.6">
                <path d="M6 4l10 8-10 8V4zM18 4h1v16h-1V4z" />
              </svg>
            </button>
            <button
              onClick={() => jumpToMarker(duration)}
              className="p-2.5 hover:bg-[var(--color-surface-overlay)] rounded-lg transition-colors cursor-pointer"
              title="End"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--color-black)" opacity="0.6">
                <path d="M5 4l10 8-10 8V4zM19 5v14h-2V5h2z" />
              </svg>
            </button>
          </div>

          {/* Speed and volume */}
          <div className="flex items-center justify-between gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--color-black)]/50 text-xs mr-1">Speed</span>
              {[0.25, 0.5, 1, 1.5, 2].map((rate) => (
                <button
                  key={rate}
                  onClick={() => handlePlaybackRateChange(rate)}
                  className={`px-2 py-1 rounded-md text-xs cursor-pointer transition-all duration-150 active:scale-[0.96] ${
                    playbackRate === rate
                      ? "bg-[var(--color-accent)] text-white shadow-[0_1px_4px_var(--color-accent-glow)]"
                      : "bg-[var(--color-surface-overlay)] text-[var(--color-black)]/60 hover:bg-[var(--color-celadon)]/20"
                  }`}
                >
                  {rate}x
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMuteOriginalAudio(!muteOriginalAudio)}
                className={`p-1.5 rounded-md transition-all cursor-pointer ${
                  muteOriginalAudio
                    ? "bg-[var(--color-danger)]/10 text-[var(--color-danger)]"
                    : "text-[var(--color-black)]/50 hover:bg-[var(--color-surface-overlay)]"
                }`}
                title={muteOriginalAudio ? "Original audio muted" : "Mute original audio"}
              >
                {muteOriginalAudio ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <line x1="23" y1="9" x2="17" y2="15" />
                    <line x1="17" y1="9" x2="23" y2="15" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  </svg>
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="w-20 accent-[var(--color-accent)]"
                disabled={muteOriginalAudio}
              />
              {muteOriginalAudio && (
                <span className="text-[10px] text-[var(--color-danger)]/70">Original audio muted</span>
              )}
            </div>
          </div>

          {/* Trim controls */}
          <div className="flex items-center gap-3 text-sm p-3 rounded-xl bg-[var(--color-surface-overlay)]">
            <div className="flex items-center gap-2">
              <span className="text-[var(--color-black)]/50 text-xs">Start:</span>
              <button
                onClick={() => setTrimStart(currentTime)}
                className="px-2.5 py-1 bg-[var(--color-accent)]/10 hover:bg-[var(--color-accent)]/15 text-[var(--color-seaweed)] rounded-md text-xs cursor-pointer transition-colors font-mono tabular-nums"
              >
                {formatTime(trimStart)}
              </button>
            </div>
            <div className="w-px h-4 bg-[var(--color-border-subtle)]" />
            <div className="flex items-center gap-2">
              <span className="text-[var(--color-black)]/50 text-xs">End:</span>
              <button
                onClick={() => setTrimEnd(currentTime)}
                className="px-2.5 py-1 bg-[var(--color-warning)]/10 hover:bg-[var(--color-warning)]/15 text-[var(--color-warning)] rounded-md text-xs cursor-pointer transition-colors font-mono tabular-nums"
              >
                {formatTime(trimEnd)}
              </button>
            </div>
            <div className="w-px h-4 bg-[var(--color-border-subtle)]" />
            <span className="text-xs text-[var(--color-black)]/40 font-mono tabular-nums">
              Selection: {formatTime(trimEnd - trimStart)}
            </span>
          </div>

          {/* Markers */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-[var(--color-black)]/70">Markers</h3>
              <button
                onClick={addMarker}
                className="px-3 py-1.5 bg-[var(--color-warning)]/10 hover:bg-[var(--color-warning)]/15 text-[var(--color-warning)] rounded-lg text-xs font-medium cursor-pointer transition-colors active:scale-[0.96]"
              >
                + Marker (M)
              </button>
            </div>
            {markers.length > 0 ? (
              <div className="max-h-32 overflow-y-auto space-y-1.5">
                {markers.map((marker) => (
                  <div
                    key={marker.id}
                    className="flex items-center justify-between bg-[var(--color-surface-overlay)] rounded-lg px-3 py-2 text-xs"
                  >
                    <button
                      onClick={() => jumpToMarker(marker.time)}
                      className="text-[var(--color-seaweed)] hover:text-[var(--color-accent)] font-mono tabular-nums cursor-pointer transition-colors"
                    >
                      {formatTime(marker.time)}
                    </button>
                    <span className="text-[var(--color-black)]/50 flex-1 ml-3 truncate">{marker.label}</span>
                    <button
                      onClick={() => removeMarker(marker.id)}
                      className="text-[var(--color-danger)]/50 hover:text-[var(--color-danger)] ml-2 cursor-pointer transition-colors p-1"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--color-black)]/40 py-2">
                No markers yet. Press M or the button to create one at the current position.
              </p>
            )}
          </div>

          {/* Keyboard shortcuts */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[var(--color-black)]/30 pt-2 border-t border-[var(--color-border-subtle)]">
            <span>Space: Play/Pause</span>
            <span>Arrows: +/-1s</span>
            <span>Shift+Arrows: +/-5s</span>
            <span>M: Marker</span>
            <span>Home/End: Start/End</span>
          </div>

          {/* Export / Download button */}
          <div className="pt-3 border-t border-[var(--color-border-subtle)]">
            <button
              onClick={exportVideo}
              disabled={isExporting}
              className={`w-full flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl text-sm font-medium transition-all duration-150 active:scale-[0.96] cursor-pointer ${
                isExporting
                  ? "bg-[var(--color-surface-overlay)] text-[var(--color-black)]/50 cursor-wait"
                  : "bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white shadow-[0_2px_8px_var(--color-accent-glow)]"
              }`}
            >
              {isExporting ? (
                <>
                  <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                  <span>Exporting... {Math.round(exportProgress)}%</span>
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>Download video with edits</span>
                </>
              )}
            </button>
            {isExporting && (
              <div className="mt-2 h-1.5 rounded-full bg-[var(--color-surface-overlay)] overflow-hidden">
                <div
                  className="h-full bg-[var(--color-accent)] rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
            )}
            <p className="mt-2 text-[10px] text-[var(--color-black)]/30 text-center">
              Selected range will be exported with zooms, subtitles, TTS audio and music applied
            </p>
          </div>

          {/* Save project to cloud */}
          <div className="pt-3 border-t border-[var(--color-border-subtle)]">
            <button
              onClick={saveProject}
              disabled={isSaving || isExporting}
              className={`w-full flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl text-sm font-medium transition-all duration-150 active:scale-[0.96] cursor-pointer ${
                isSaving
                  ? "bg-[var(--color-surface-overlay)] text-[var(--color-black)]/50 cursor-wait"
                  : "bg-[var(--color-seaweed)] hover:bg-[var(--color-seaweed)]/90 text-white shadow-[0_2px_8px_rgba(0,154,118,0.2)]"
              }`}
            >
              {isSaving ? (
                <>
                  <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                  <span>Saving project...</span>
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                  <span>{savedProjectId ? "Save changes" : "Save project to cloud"}</span>
                </>
              )}
            </button>
            {saveMessage && (
              <p className={`mt-2 text-[10px] text-center ${
                saveMessage.startsWith("Error") ? "text-[var(--color-danger)]" : "text-[var(--color-seaweed)]"
              }`}>
                {saveMessage}
              </p>
            )}
            {savedProjectId && (
              <p className="mt-1 text-[10px] text-[var(--color-black)]/30 text-center font-mono">
                ID: {savedProjectId}
              </p>
            )}
          </div>


        </>
      )}
    </div>
  );
}
