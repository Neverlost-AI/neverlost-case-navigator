import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Neverlost Case Navigator · Human-reviewed case foundation",
  description:
    "A clickable synthetic demonstration of evidence review, accepted case state, deterministic packet previews, and statement provenance.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
