"use client";

import { Eye, Map, PencilRuler, Sparkles, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Logo() {
  return (
    <Link href="/" className="logo" aria-label="NYSee home">
      <span className="logo-mark">
        <Eye size={20} strokeWidth={2.5} color="#fff" aria-hidden />
      </span>
      <span className="logo-word">
        NY<b>See</b>
      </span>
    </Link>
  );
}

const LINKS = [
  { href: "/ai", label: "AI Planner", icon: Sparkles },
  { href: "/plan", label: "Build", icon: PencilRuler },
  { href: "/trip", label: "My Day", icon: Map },
  { href: "/fares", label: "Fares", icon: Wallet },
];

export default function NavBar() {
  const path = usePathname();
  return (
    <nav className="nav">
      <Logo />
      <div className="nav-links">
        {LINKS.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={`nav-link${path.startsWith(href) ? " active" : ""}`} aria-label={label}>
            <Icon size={18} aria-hidden />
            <span>{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
