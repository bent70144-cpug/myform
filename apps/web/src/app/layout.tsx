import type { Metadata } from "next";
import { en } from "@form/i18n";

/**
 * Root layout metadata comes from the i18n catalog (no hardcoded copy).
 * Individual pages can override the title; the app name + product subtitle
 * are the sensible default for the rest.
 */
export const metadata: Metadata = {
  title: en.common.appName,
  description: en.home.subtitle,
};

/**
 * Framework-free baseline: box-sizing everywhere, a visible keyboard-focus
 * ring, and the keyframes the shared PulseDot uses. Inline styles cannot
 * express pseudo-classes/keyframes, so this is the ONLY global stylesheet in
 * the app — everything else styles itself through the shared tokens in
 * lib/ui.tsx.
 */
const GLOBAL_CSS = `
*, *::before, *::after { box-sizing: border-box; }
:focus-visible { outline: 2px solid #1f2937; outline-offset: 2px; }
@keyframes uiPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, sans-serif",
          color: "#1f2937",
          background: "#ffffff",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <style>{GLOBAL_CSS}</style>
        <div id="main" style={{ flex: 1 }}>
          {children}
        </div>
      </body>
    </html>
  );
}
