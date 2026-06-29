"use client";

import { useState, useCallback } from "react";
import ScreenRecorder from "./components/recorder/ScreenRecorder";
import VideoEditor from "./components/editor/VideoEditor";
import AuthGuard from "./components/security/AuthGuard";
import ProjectsList from "./components/projects/ProjectsList";
import type { ProjectData } from "./components/projects/ProjectsList";

export default function Home() {
  const [hasVideo, setHasVideo] = useState(false);
  const [loadedProject, setLoadedProject] = useState<{
    videoUrl: string;
    videoName: string;
    edits: Record<string, unknown>;
    ulidVideo: string;
    audioUrls: Record<string, string>;
    musicUrl: string | null;
  } | null>(null);

  const handleLoadProject = useCallback((project: ProjectData, videoUrl: string, audioUrls: Record<string, string>, musicUrl: string | null) => {
    setLoadedProject({
      videoUrl,
      videoName: project.videoName,
      edits: project.edits,
      ulidVideo: project.ulidVideo,
      audioUrls,
      musicUrl,
    });
    setHasVideo(true);
  }, []);

  return (
    <AuthGuard>
    <div className="flex min-h-screen">
      {/* Sidebar – collapses when video is loaded */}
      <aside
        className={`sticky top-0 h-screen shrink-0 flex flex-col border-r border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] transition-all duration-300 ease-in-out overflow-y-auto ${
          hasVideo ? "w-[72px] py-5 px-2 items-center" : "w-[400px] p-6"
        }`}
      >
        {/* Logo */}
        <div className={`mb-6 ${hasVideo ? "text-center" : ""}`}>
          {hasVideo ? (
            <span className="text-lg font-bold text-[var(--color-accent)]">D2D</span>
          ) : (
            <>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--color-black)]">
                Diveo<span className="text-[var(--color-accent)]">-to-demo</span>
              </h1>
              <p className="mt-1 text-xs text-[var(--color-black)]/50">
                Record your screen, edit and transform with AI.
              </p>
            </>
          )}
        </div>

        {/* Recorder */}
        <div className={`w-full ${hasVideo ? "flex flex-col items-center" : ""}`}>
          <ScreenRecorder compact={hasVideo} />
        </div>

        {/* Projects list */}
        <ProjectsList compact={hasVideo} onLoadProject={handleLoadProject} />
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center px-4 py-12 sm:px-8 overflow-y-auto">
        {!hasVideo && (
          <header className="mb-12 text-center animate-fade-up">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[var(--color-black)] text-wrap-balance">
              Diveo<span className="text-[var(--color-accent)]">-to-demo</span>
            </h1>
            <p className="mt-2 text-sm text-[var(--color-black)]/50 max-w-md mx-auto text-wrap-pretty">
              Record your screen, edit the result and transform your videos with the power of AI.
            </p>
          </header>
        )}

        <div className="w-full max-w-5xl animate-fade-up" style={{ animationDelay: "200ms" }}>
          <VideoEditor onVideoChange={setHasVideo} loadedProject={loadedProject} />
        </div>
      </main>
    </div>
    </AuthGuard>
  );
}
