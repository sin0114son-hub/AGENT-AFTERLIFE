"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Home" },
  { href: "/attack-lab", label: "Attack Lab" },
  { href: "/time-machine", label: "Time Machine" },
  { href: "/evidence", label: "Evidence" },
];

export default function NavBar() {
  const path = usePathname();
  return (
    <nav
      aria-label="Main navigation"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "2rem",
        padding: "0.875rem 2rem",
        borderBottom: "1px solid var(--border)",
        background: "rgba(23,35,56,0.85)",
        backdropFilter: "blur(12px)",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      <Link
        href="/"
        style={{
          fontWeight: 700,
          fontSize: "1rem",
          letterSpacing: "0.08em",
          color: "var(--agent)",
          textDecoration: "none",
          whiteSpace: "nowrap",
        }}
      >
        👻 AGENT AFTERLIFE
      </Link>
      <div style={{ display: "flex", gap: "0.25rem", flex: 1 }}>
        {links.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            style={{
              padding: "0.375rem 0.875rem",
              borderRadius: "6px",
              fontSize: "0.875rem",
              fontWeight: 500,
              textDecoration: "none",
              color: path === href ? "var(--agent)" : "var(--text-dim)",
              background: path === href ? "rgba(56,189,248,0.1)" : "transparent",
              border: path === href ? "1px solid rgba(56,189,248,0.3)" : "1px solid transparent",
              transition: "all 0.15s",
            }}
          >
            {label}
          </Link>
        ))}
      </div>
      <span
        style={{
          fontSize: "0.7rem",
          padding: "0.25rem 0.625rem",
          borderRadius: "999px",
          background: "rgba(52,211,153,0.1)",
          border: "1px solid rgba(52,211,153,0.3)",
          color: "var(--defense)",
          fontWeight: 600,
          letterSpacing: "0.05em",
        }}
      >
        MODE A · GUIDED
      </span>
    </nav>
  );
}
