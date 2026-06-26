"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Header() {
  const pathname = usePathname();

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + "/");

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Logo & Brand */}
          <Link href="/" className="flex items-center gap-3 font-bold">
            <div className="relative w-10 h-10">
              <svg
                viewBox="0 0 200 200"
                xmlns="http://www.w3.org/2000/svg"
                className="w-full h-full"
                preserveAspectRatio="xMidYMid meet"
              >
                <defs>
                  <linearGradient id="blueGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style={{ stopColor: "#0099ff", stopOpacity: 1 }} />
                    <stop offset="100%" style={{ stopColor: "#0066cc", stopOpacity: 1 }} />
                  </linearGradient>
                  <linearGradient id="greenGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" style={{ stopColor: "#00ccff", stopOpacity: 1 }} />
                    <stop offset="50%" style={{ stopColor: "#00ff88", stopOpacity: 1 }} />
                    <stop offset="100%" style={{ stopColor: "#99ff00", stopOpacity: 1 }} />
                  </linearGradient>
                </defs>

                {/* Triangles */}
                <polygon points="40,160 40,80 90,120" fill="url(#blueGradient)" opacity="0.9" />
                <polygon points="160,160 160,80 110,120" fill="#e0e0e0" opacity="0.7" />

                {/* Growth Curve */}
                <path
                  d="M 50,140 Q 100,100 150,60"
                  stroke="url(#greenGradient)"
                  strokeWidth="6"
                  fill="none"
                  strokeLinecap="round"
                />

                {/* Arrow */}
                <polygon points="150,55 158,48 145,60" fill="#99ff00" />

                {/* Bars */}
                <rect x="60" y="125" width="8" height="25" fill="#0099ff" opacity="0.8" />
                <rect x="72" y="115" width="8" height="35" fill="#00ccff" opacity="0.8" />
                <rect x="84" y="105" width="8" height="45" fill="#00ff88" opacity="0.8" />
                <rect x="96" y="95" width="8" height="55" fill="#66ff00" opacity="0.8" />
                <rect x="108" y="85" width="8" height="65" fill="#99ff00" opacity="0.8" />
              </svg>
            </div>
            <div className="hidden sm:block">
              <div className="text-lg font-bold bg-gradient-to-r from-blue-500 to-green-400 bg-clip-text text-transparent">
                AXION
              </div>
              <div className="text-xs text-muted">Smart Trading & Analytics</div>
            </div>
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
