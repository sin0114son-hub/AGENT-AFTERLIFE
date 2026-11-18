"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navModeLabel } from "../lib/modeLabel";

const links = [
  { href: "/", label: "Home" },
  { href: "/attack-lab", label: "Attack Lab" },
  { href: "/playground", label: "Your experiment" },
  { href: "/time-machine", label: "Time Machine" },
  { href: "/evidence", label: "Evidence" },
];
export default function NavBar() {
  const path = usePathname();
  return <nav aria-label="Main navigation" className="site-nav">
    <Link href="/" className="site-name">Agent Afterlife</Link>
    <div className="site-links">{links.map(({ href, label }) =>
      <Link key={href} href={href} aria-current={path === href ? "page" : undefined}>{label}</Link>
    )}</div>
    <span className="site-mode">{navModeLabel(path)}</span>
  </nav>;
}
