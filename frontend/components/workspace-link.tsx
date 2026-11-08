"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";
import { incidentBase, sections } from "@/lib/roles";
import { useAccess } from "./workspace-provider";

export default function WorkspaceLink(props: ComponentProps<typeof Link>) {
  const access = useAccess();
  const pathname = usePathname();
  const base = incidentBase(access.organizationId, access.incidentId);
  const paths = sections.map((section) => `${base}/${section}`);
  const localView = paths.includes(pathname) && typeof props.href === "string" &&
    paths.includes(props.href.split(/[?#]/)[0]);
  return (
    <Link
      {...props}
      prefetch={localView ? false : props.prefetch}
      onNavigate={(event) => {
        let prevented = false;
        props.onNavigate?.({ preventDefault: () => {
          prevented = true;
          event.preventDefault();
        } });
        if (prevented || typeof props.href !== "string") return;
        const target = new URL(props.href, window.location.href);
        // Only switch views inside the already-authorized, mounted incident.
        // Other incidents, organizations and admin pages use normal routing.
        if (target.origin !== window.location.origin || target.hash ||
            !paths.includes(pathname) || !paths.includes(target.pathname)) return;
        event.preventDefault();
        const url = `${target.pathname}${target.search}`;
        if (props.replace) window.history.replaceState(null, "", url);
        else window.history.pushState(null, "", url);
        if (props.scroll !== false) window.scrollTo(0, 0);
      }}
    />
  );
}
