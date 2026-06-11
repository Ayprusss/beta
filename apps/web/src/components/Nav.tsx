"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

const LINKS = [
  { href: "/climbs", label: "Climbs" },
  { href: "/upload", label: "Upload" },
  { href: "/guide", label: "Film Guide" },
];

export default function Nav() {
  const { user, ready, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <header className="sticky top-0 z-50 bg-paper/92 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-5">
        <Link href="/" className="group flex items-baseline gap-2">
          <span className="text-red transition-transform duration-300 group-hover:-translate-y-0.5">
            ▲
          </span>
          <span className="display text-2xl text-ink">
            Beta<span className="text-red">.</span>
          </span>
          <span className="caption hidden text-sm sm:block">vol. i</span>
        </Link>

        <nav className="ml-4 hidden items-center gap-1 sm:flex">
          {user &&
            LINKS.map((l) => {
              const active = pathname.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`tag px-3 py-2 transition-colors ${
                    active ? "text-red" : "text-ink-dim hover:text-ink"
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {!ready ? null : user ? (
            <>
              <span className="tag hidden text-ink-faint md:block">
                {user.email}
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-ink/30 bg-card font-mono text-[10px] text-ink-dim">
                {user.initials}
              </span>
              <button
                onClick={() => {
                  signOut();
                  router.push("/");
                }}
                className="tag text-ink-faint transition-colors hover:text-red"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              href="/#start"
              className="tag border border-ink px-4 py-2 text-ink transition-colors hover:bg-ink hover:text-paper"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-5">
        <div className="print-rule" />
      </div>
    </header>
  );
}
