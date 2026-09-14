import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Neverlost Case Navigator · Human-reviewed case foundation",
  description:
    "A clickable synthetic demonstration of evidence review, accepted case state, deterministic packet previews, and statement provenance.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const liveAiEnabled = process.env.ENABLE_LIVE_AI === "true";

  return (
    <html lang="en">
      <body className={liveAiEnabled ? undefined : "live-ai-disabled"}>
        {!liveAiEnabled ? (
          <style>{`
            .live-ai-disabled [aria-label="Optional OpenAI source analysis"] {
              display: none;
            }
          `}</style>
        ) : null}
        {children}
      </body>
    </html>
  );
}
