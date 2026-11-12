import type { Metadata } from "next";
import "./globals.css";
import NavBar from "./components/NavBar";

export const metadata: Metadata = {
  title: "Agent Afterlife",
  description: "Interactive AI Agent Security Laboratory — Kiroween 2026",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ background: "var(--bg)", color: "var(--text)", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <NavBar />
        <main style={{ flex: 1 }}>
          {children}
        </main>
        <footer style={{ borderTop: "1px solid var(--border)", padding: "1rem 2rem", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.75rem", color: "var(--text-muted)" }}>
          <span>Agent Afterlife · Kiroween 2026</span>
          <span>Mode A: Guided Simulation · All agents are synthetic</span>
        </footer>
      </body>
    </html>
  );
}
