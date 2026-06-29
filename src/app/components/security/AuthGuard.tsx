"use client";

import { useAuth } from "react-oidc-context";
import type { ReactNode } from "react";

export default function AuthGuard({ children }: { children: ReactNode }) {
  const auth = useAuth();

  const signOutRedirect = () => {
    const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!;
    const logoutUri = process.env.NEXT_PUBLIC_COGNITO_LOGOUT_URI!;
    const cognitoDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN!;
    window.location.href = `${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(logoutUri)}`;
  };

  if (auth.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
          <p className="text-sm text-[var(--color-black)]/60">Loading...</p>
        </div>
      </div>
    );
  }

  if (auth.error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)]">
        <div className="flex flex-col items-center gap-4 rounded-xl border border-red-200 bg-white p-8 shadow-sm">
          <p className="text-sm text-red-600">
            Authentication error: {auth.error.message}
          </p>
          <button
            onClick={() => auth.signinRedirect()}
            className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)]"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)]">
        <div className="flex flex-col items-center gap-6 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-10 shadow-sm">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--color-black)]">
              Diveo<span className="text-[var(--color-accent)]">-to-demo</span>
            </h1>
            <p className="mt-1 text-center text-xs text-[var(--color-black)]/50">
              Record, edit and transform with AI.
            </p>
          </div>
          <button
            onClick={() => auth.signinRedirect()}
            className="w-full rounded-lg bg-[var(--color-accent)] px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)]"
          >
            Sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Floating user badge */}
      <div className="fixed top-3 right-3 z-50 flex items-center gap-2 rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] px-3 py-1.5 shadow-sm">
        <span className="text-xs text-[var(--color-black)]/70 max-w-[160px] truncate">
          {( auth.user?.profile?.["cognito:username"] ?? auth.user?.profile?.email) as string}
        </span>
        <button
          onClick={() => signOutRedirect()}
          className="text-xs font-medium text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors"
        >
          Sign out
        </button>
      </div>
      {children}
    </>
  );
}
