"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/mockApi";
import Protected from "@/components/Protected";

const GRADES = ["V0", "V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8+", "V?"];

export default function UploadPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [grade, setGrade] = useState("V?");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = (f: File | undefined) => {
    setError(null);
    if (!f) return;
    if (!f.type.startsWith("video/")) {
      setError("That's not a video file. We need the actual footage.");
      return;
    }
    if (f.size > 500 * 1024 * 1024) {
      setError("Over 500 MB — trim the clip to just the attempt.");
      return;
    }
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
  };

  const submit = async () => {
    if (!file || busy) return;
    setBusy(true);
    const climb = await api.uploadClimb({ file, title, grade });
    router.push(`/climbs/${climb.id}`);
  };

  return (
    <Protected>
      <div className="mx-auto max-w-6xl px-5 py-12">
        <p className="tag text-red">a new entry</p>
        <h1 className="display mt-2 text-5xl text-ink">Upload a climb</h1>

        <div className="mt-10 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
          <div>
            {/* dropzone */}
            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                accept(e.dataTransfer.files[0]);
              }}
              className={`flex aspect-video cursor-pointer flex-col items-center justify-center border-2 border-dashed transition-colors ${
                dragging
                  ? "border-red bg-red/5"
                  : file
                  ? "border-moss bg-card"
                  : "border-ink-faint bg-card hover:border-ink"
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => accept(e.target.files?.[0])}
              />
              {file ? (
                <>
                  <p className="display text-3xl text-moss">{file.name}</p>
                  <p className="tag mt-2 text-ink-faint">
                    {(file.size / 1024 / 1024).toFixed(1)} mb · click to swap
                  </p>
                </>
              ) : (
                <>
                  <span className="display text-4xl text-ink-dim">
                    Drop the footage here
                  </span>
                  <p className="tag mt-3 text-ink-faint">
                    mp4 / mov · max 500 mb · one attempt per clip
                  </p>
                </>
              )}
            </div>
            {error && (
              <p className="mt-3 border-l-2 border-red pl-3 text-sm text-red-deep">
                {error}
              </p>
            )}

            {/* meta */}
            <div className="mt-8 grid gap-6 sm:grid-cols-[1fr_auto]">
              <label className="block">
                <span className="tag text-ink-dim">climb name</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Orange overhang, second from the left"
                  className="mt-2 w-full border hairline bg-card px-4 py-3 text-ink placeholder:text-ink-faint focus:border-red focus:outline-none"
                />
              </label>
              <div>
                <span className="tag text-ink-dim">grade</span>
                <div className="mt-2 flex flex-wrap gap-1">
                  {GRADES.map((g) => (
                    <button
                      key={g}
                      onClick={() => setGrade(g)}
                      className={`border px-2.5 py-2 font-mono text-xs transition-colors ${
                        grade === g
                          ? "border-red bg-red text-paper"
                          : "hairline bg-card text-ink-dim hover:border-ink-faint"
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={submit}
              disabled={!file || busy}
              className="mt-9 w-full bg-ink px-6 py-4 font-medium text-paper transition-colors hover:bg-red-deep disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-faint"
            >
              {busy ? "Uploading…" : "Send it to the queue →"}
            </button>
          </div>

          {/* filming tips — a margin note */}
          <aside className="h-fit border hairline bg-card p-6 shadow-[4px_4px_0_rgba(28,25,20,0.07)]">
            <p className="tag text-ochre">before you upload</p>
            <h2 className="display mt-2 text-2xl text-ink">
              Good footage, good feedback
            </h2>
            <ul className="mt-5 space-y-4 text-sm leading-relaxed text-ink-dim">
              {[
                ["Static camera", "Tripod or propped phone. Panning footage ruins pose tracking."],
                ["Whole body in frame", "Head to toes for the entire attempt, including the start."],
                ["Side or ¾ angle", "Straight-on hides hip distance; side view reveals it."],
                ["One attempt per clip", "Trim dead time. The pipeline reads everything you send."],
              ].map(([k, v]) => (
                <li key={k} className="flex gap-3">
                  <span className="mt-0.5 text-xs text-red">▲</span>
                  <span>
                    <strong className="font-medium text-ink">{k}.</strong> {v}
                  </span>
                </li>
              ))}
            </ul>
            <Link
              href="/guide"
              className="caption mt-6 inline-block border-b border-ink-faint pb-0.5 transition-colors hover:border-red hover:text-red"
            >
              the full film guide →
            </Link>
          </aside>
        </div>
      </div>
    </Protected>
  );
}
