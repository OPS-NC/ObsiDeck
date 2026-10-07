"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { apiUrl } from "./api";
import { handleVaultEvents, refreshTree, checkActiveNote } from "./actions";
import type { VaultEvent } from "../types";
import { THEME_KEY } from "./theme-script";

/** Subscribes to the server-sent filesystem events; resyncs after reconnects. */
export function useVaultEvents(): "connected" | "reconnecting" {
  const [state, setState] = useState<"connected" | "reconnecting">("connected");

  useEffect(() => {
    const source = new EventSource(apiUrl("events"));
    let hadError = false;
    source.addEventListener("vault", (event) => {
      try {
        handleVaultEvents(JSON.parse((event as MessageEvent<string>).data) as VaultEvent[]);
      } catch (err) {
        console.warn("[obsideck] bad event payload", err);
      }
    });
    source.onopen = () => {
      setState("connected");
      if (hadError) {
        hadError = false;
        void refreshTree();
        void checkActiveNote();
      }
    };
    source.onerror = () => {
      hadError = true;
      setState("reconnecting");
    };
    return () => source.close();
  }, []);

  return state;
}

export type Theme = "light" | "dark";

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function storedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

const themeListeners = new Set<() => void>();

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  themeListeners.forEach((l) => l());
}

function subscribeTheme(listener: () => void): () => void {
  themeListeners.add(listener);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => {
    if (!storedTheme()) applyTheme(systemTheme());
  };
  media.addEventListener("change", onSystem);
  return () => {
    themeListeners.delete(listener);
    media.removeEventListener("change", onSystem);
  };
}

/** Theme follows prefers-color-scheme until the user picks one explicitly. */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const theme = useSyncExternalStore<Theme>(
    subscribeTheme,
    () => (document.documentElement.classList.contains("dark") ? "dark" : "light"),
    () => "light",
  );
  const setTheme = (next: Theme) => {
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // private mode: theme still applies for this session
    }
    applyTheme(next);
  };
  return [theme, setTheme];
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
