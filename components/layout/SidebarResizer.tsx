"use client";

import { useRef } from "react";
import { useWorkspace } from "@/lib/client/store";

/** Drag handle on the sidebar's right edge. Double-click resets the width. */
export function SidebarResizer() {
  const start = useRef<{ x: number; width: number } | null>(null);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      className="group absolute inset-y-0 -right-[3px] z-10 w-1.5 cursor-col-resize"
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, width: useWorkspace.getState().sidebarWidth };
        document.body.style.cursor = "col-resize";
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        useWorkspace.getState().setSidebarWidth(start.current.width + e.clientX - start.current.x);
      }}
      onPointerUp={(e) => {
        start.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
        document.body.style.cursor = "";
      }}
      onDoubleClick={() => useWorkspace.getState().setSidebarWidth(272)}
    >
      <div className="mx-auto h-full w-px bg-transparent transition-colors duration-150 group-hover:bg-accent/60 group-active:bg-accent" />
    </div>
  );
}
