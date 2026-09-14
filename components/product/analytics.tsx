"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
export function Analytics() {
  const pathname = usePathname();
  useEffect(() => {
    if (/^\/(generate|report|checkout|api)/.test(pathname)) return;
    const send = (name: string) => {
      void fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          metadata: {
            landing: pathname,
            referral: document.referrer
              ? new URL(document.referrer).hostname
              : "",
          },
        }),
        keepalive: true,
      }).catch(() => {});
    };
    send("landing_view");
    const click = (e: MouseEvent) => {
      if ((e.target as Element)?.closest('[data-event="primary_cta_clicked"]'))
        send("primary_cta_clicked");
    };
    document.addEventListener("click", click);
    return () => document.removeEventListener("click", click);
  }, [pathname]);
  return null;
}
