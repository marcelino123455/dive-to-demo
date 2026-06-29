"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "react-oidc-context";

export interface ProjectData {
  userId: string;
  ulidVideo: string;
  uri_s3: string;
  videoName: string;
  edits: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface ProjectsListProps {
  compact?: boolean;
  onLoadProject: (project: ProjectData, videoUrl: string, audioUrls: Record<string, string>, musicUrl: string | null) => void;
}

export default function ProjectsList({ compact, onLoadProject }: ProjectsListProps) {
  const auth = useAuth();
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProjectId, setLoadingProjectId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const fetchProjects = useCallback(async () => {
    const userId = auth.user?.profile?.sub;
    if (!userId) return;

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/projects?userId=${encodeURIComponent(userId)}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Error loading projects");
      }
      const data = await response.json();
      setProjects(data.projects || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading projects");
    } finally {
      setIsLoading(false);
    }
  }, [auth.user]);

  useEffect(() => {
    if (auth.isAuthenticated) {
      fetchProjects();
    }
  }, [auth.isAuthenticated, fetchProjects]);

  const handleLoadProject = useCallback(async (project: ProjectData) => {
    const userId = auth.user?.profile?.sub;
    if (!userId) return;

    setLoadingProjectId(project.ulidVideo);

    try {
      // Extraer extension de uri_s3
      const ext = project.uri_s3.endsWith(".webm") ? "webm" : "mp4";

      // Obtener IDs de audio de los edits guardados
      const edits = project.edits as Record<string, unknown>;
      const audioSegments = edits?.audioSegments as { id: string }[] | undefined;
      const hasMusic = !!(edits?.musicTrack || edits?.musicS3Key);

      // Get presigned URL for video only
      const params = new URLSearchParams({
        userId,
        ulidVideo: project.ulidVideo,
        ext,
      });

      const response = await fetch(`/api/projects/video?${params.toString()}`);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Error loading video");
      }

      const data = await response.json();

      // Build audio URLs using the proxy API (avoids S3 presigned URL issues with <audio>)
      const audioUrls: Record<string, string> = {};
      if (audioSegments) {
        for (const seg of audioSegments) {
          audioUrls[seg.id] = `/api/projects/audio?userId=${encodeURIComponent(userId)}&ulidVideo=${encodeURIComponent(project.ulidVideo)}&audioId=${encodeURIComponent(seg.id)}`;
        }
      }

      // Music URL via proxy
      const musicUrl = hasMusic
        ? `/api/projects/audio?userId=${encodeURIComponent(userId)}&ulidVideo=${encodeURIComponent(project.ulidVideo)}&audioId=music`
        : null;

      onLoadProject(project, data.url, audioUrls, musicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading project");
    } finally {
      setLoadingProjectId(null);
    }
  }, [auth.user, onLoadProject]);

  const formatDate = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleDateString("en", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (!auth.isAuthenticated) return null;

  // Compact mode: just show an icon with count
  if (compact) {
    return (
      <div className="group relative flex flex-col items-center">
        <button
          onClick={fetchProjects}
          className="flex items-center justify-center w-9 h-9 rounded-xl bg-[var(--color-celadon)]/15 hover:bg-[var(--color-celadon)]/30 transition-colors cursor-pointer"
          title="My projects"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-seaweed)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        </button>
        {projects.length > 0 && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center w-4 h-4 rounded-full bg-[var(--color-accent)] text-white text-[9px] font-bold">
            {projects.length}
          </span>
        )}
        <span className="mt-1 text-[9px] text-[var(--color-black)]/40">Projects</span>
      </div>
    );
  }

  // Expanded mode
  return (
    <div className="w-full mt-6 border-t border-[var(--color-border-subtle)] pt-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[var(--color-black)]/80 flex items-center gap-2">
          {/* Step number badge */}
          <div className="group/step relative flex items-center justify-center w-7 h-7 rounded-full bg-[var(--color-accent)] text-white text-xs font-bold shadow-[0_2px_8px_var(--color-accent-glow)] cursor-default shrink-0">
            3
            <span className="absolute left-full ml-2.5 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-[var(--color-black)] text-white text-xs px-3 py-1.5 opacity-0 pointer-events-none group-hover/step:opacity-100 transition-opacity duration-150 z-50">
              Manage and reload your saved projects
            </span>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-seaweed)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          My Projects
        </h3>
        <button
          onClick={fetchProjects}
          disabled={isLoading}
          className="p-1.5 rounded-md hover:bg-[var(--color-surface-overlay)] transition-colors cursor-pointer"
          title="Refresh"
        >
          <svg
            className={isLoading ? "animate-spin" : ""}
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-black)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.5"
          >
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </button>
      </div>

      {error && (
        <p className="text-[10px] text-[var(--color-danger)] mb-2">{error}</p>
      )}

      {isLoading && projects.length === 0 ? (
        <div className="space-y-2">
          {/* Skeleton project items */}
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[var(--color-surface-overlay)] animate-pulse">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-[var(--color-celadon)]/10" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-3/4 rounded bg-[var(--color-celadon)]/15" />
                <div className="h-2.5 w-1/2 rounded bg-[var(--color-celadon)]/10" />
              </div>
            </div>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <p className="text-xs text-[var(--color-black)]/40 py-4 text-center">
          No saved projects yet.
        </p>
      ) : (
        <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
          {projects.map((project) => (
            <button
              key={project.ulidVideo}
              onClick={() => handleLoadProject(project)}
              disabled={loadingProjectId === project.ulidVideo}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[var(--color-surface-overlay)] hover:bg-[var(--color-celadon)]/15 transition-all cursor-pointer text-left group active:scale-[0.98]"
            >
              {/* Video icon / loading spinner */}
              <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--color-accent)]/10 group-hover:bg-[var(--color-accent)]/15 transition-colors">
                {loadingProjectId === project.ulidVideo ? (
                  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                )}
              </div>

              {/* Project info */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-[var(--color-black)]/80 truncate">
                  {project.videoName}
                </p>
                <p className="text-[10px] text-[var(--color-black)]/40 mt-0.5">
                  {formatDate(project.createdAt)}
                </p>
              </div>

              {/* Arrow indicator */}
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--color-black)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="opacity-0 group-hover:opacity-40 transition-opacity flex-shrink-0"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
