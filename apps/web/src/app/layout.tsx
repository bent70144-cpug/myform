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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
