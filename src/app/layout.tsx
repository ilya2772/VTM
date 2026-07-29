import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import "../features/terminal/terminal-reference.css";

export const metadata: Metadata = {
  title: "Axiom Prop Terminal",
  description: "Virtual prop-trading simulation terminal",
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
