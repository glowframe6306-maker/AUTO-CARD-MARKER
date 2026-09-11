import { useEffect } from "react";
import {
  applyGlobalAppearance,
  applyGlobalLanguage,
  getStoredLanguage,
} from "../lib/i18n";
import type { AppProps } from "next/app";
import "../styles/globals.css";
import AppShell from "../components/AppShell";

export default function App({ Component, pageProps, router }: AppProps) {
  useEffect(() => {
    const applySettings = () => {
      const language =
        getStoredLanguage() ||
        localStorage.getItem("app-language") ||
        "English";

      const theme =
        (localStorage.getItem("app-theme") as
          | "system"
          | "light"
          | "dark") || "system";

      applyGlobalLanguage(language);
      applyGlobalAppearance(theme);

      const root = document.documentElement;

      if (theme === "dark") {
        root.setAttribute("data-theme", "dark");
        root.classList.add("dark");
      } else if (theme === "light") {
        root.setAttribute("data-theme", "light");
        root.classList.remove("dark");
      } else {
        const prefersDark = window.matchMedia(
          "(prefers-color-scheme: dark)"
        ).matches;

        root.setAttribute(
          "data-theme",
          prefersDark ? "dark" : "light"
        );

        root.classList.toggle("dark", prefersDark);
      }

      root.setAttribute(
        "lang",
        String(language).toLowerCase()
      );
    };

    applySettings();

    window.addEventListener(
      "settings-updated",
      applySettings
    );

    return () => {
      window.removeEventListener(
        "settings-updated",
        applySettings
      );
    };
  }, []);

  // Authentication pages stay completely standalone.
  if (
    router.pathname === "/" ||
    router.pathname === "/register"
  ) {
    return <Component {...pageProps} />;
  }

  return (
    <AppShell>
      <Component {...pageProps} />
    </AppShell>
  );
}
