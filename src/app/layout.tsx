import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Neverlost Case Navigator · Prepare for your next conversation",
  description:
    "Explore a fictional case, review suggestions and their sources, and choose what goes into preparation drafts.",
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
        <Analytics />
      </body>
    </html>
  );
}
