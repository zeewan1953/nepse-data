"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/Logo";

export function Header() {
  const pathname = usePathname();

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + "/");

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Logo & Brand */}
          <Link href="/" className="flex items-center gap-3 font-bold">
            <Logo size={40} />
          </Link>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-8">
            <Link
              href="/dashboard"
              className={`text-sm font-medium transition-colors ${
                isActive("/dashboard") ? "text-primary" : "text-muted hover:text-foreground"
              }`}
            >
              Dashboard
            </Link>
            <Link
              href="/broker-analysis"
              className={`text-sm font-medium transition-colors ${
                isActive("/broker-analysis") ? "text-primary" : "text-muted hover:text-foreground"
              }`}
            >
              Broker Analysis
            </Link>
            <Link
              href="/market"
              className={`text-sm font-medium transition-colors ${
                isActive("/market") ? "text-primary" : "text-muted hover:text-foreground"
              }`}
            >
              Market
            </Link>
            <Link
              href="/portfolio"
              className={`text-sm font-medium transition-colors ${
                isActive("/portfolio") ? "text-primary" : "text-muted hover:text-foreground"
              }`}
            >
              Portfolio
            </Link>
          </nav>

          {/* Right Side Actions */}
          <div className="flex items-center gap-4">
            <button className="rounded-lg bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20 transition-colors">
              Login
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
