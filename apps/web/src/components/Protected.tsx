"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

/**
 * Client-side route guard. Renders children only with a session;
 * otherwise bounces to the landing page. `allow` lets specific pages
 * opt out (e.g. demo climbs are public).
 */
export default function Protected({
  children,
  allow = false,
}: {
  children: React.ReactNode;
  allow?: boolean;
}) {
  const { user, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user && !allow) router.replace("/");
  }, [ready, user, allow, router]);

  if (!ready) return null;
  if (!user && !allow) return null;
  return <>{children}</>;
}
