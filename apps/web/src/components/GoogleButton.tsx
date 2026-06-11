"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

/**
 * "Continue with Google" — visually final, functionally stubbed.
 * The real OAuth flow swaps in inside lib/auth.tsx, not here.
 */
export default function GoogleButton({ label = "Continue with Google" }: { label?: string }) {
  const { signInWithGoogle } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      onClick={async () => {
        setBusy(true);
        await signInWithGoogle();
        router.push("/climbs");
      }}
      disabled={busy}
      className="group inline-flex items-center gap-3 bg-ink px-6 py-3.5 text-paper transition-colors hover:bg-red-deep disabled:opacity-60"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-card">
        <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
        <path fill="#EA4335" d="M24 9.5c3.5 0 6.7 1.2 9.2 3.6l6.8-6.8C35.9 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.4 17.7 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z" />
        <path fill="#FBBC05" d="M10.5 28.6a14.5 14.5 0 0 1 0-9.2l-7.9-6.2a24 24 0 0 0 0 21.6l7.9-6.2z" />
        <path fill="#34A853" d="M24 48c6.3 0 11.6-2.1 15.6-5.8l-7.7-6c-2.1 1.4-4.8 2.3-7.9 2.3-6.3 0-11.6-3.9-13.5-9.4l-7.9 6.2C6.5 42.6 14.6 48 24 48z" />
        </svg>
      </span>
      <span className="font-medium tracking-tight">
        {busy ? "Signing in…" : label}
      </span>
      <span className="font-mono text-xs text-paper/50 transition-transform group-hover:translate-x-1">
        →
      </span>
    </button>
  );
}
