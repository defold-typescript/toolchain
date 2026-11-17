"use client";
/** @jsxImportSource react */
// Pins the JSX dialect for `bun test`, which reads the package tsconfig's `hono/jsx`
// rather than `src/tsconfig.json`.
import type { HeadingMarker } from "@defold-typescript/docs-render/headings";
import { useEffect, useState } from "react";

/**
 * One heading chip in an outline entry. The `?since=` filter toggles only the
 * chips in the page body, so this one follows its in-body twin: it reads that
 * chip's visibility on mount and whenever the filter restyles the heading.
 */
export function OutlineChip({ headingId, marker }: { headingId: string; marker: HeadingMarker }) {
  const [shown, setShown] = useState(!marker.hidden);
  useEffect(() => {
    const heading = document.getElementById(headingId);
    if (!heading) return;
    const read = () => {
      const twin = heading.querySelector<HTMLElement>(`.api-badge-dot--${marker.kind}`);
      if (twin) setShown(twin.style.display !== "none");
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(heading, { attributes: true, attributeFilter: ["style"], subtree: true });
    return () => observer.disconnect();
  }, [headingId, marker.kind]);
  return (
    <span
      className={`api-badge-dot api-badge-dot--${marker.kind}`}
      role="img"
      aria-label={marker.label}
      title={marker.label}
      style={shown ? undefined : { display: "none" }}
    >
      {marker.glyph}
    </span>
  );
}
