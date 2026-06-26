"use client";

import Link from "next/link";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="relative w-8 h-8">
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
                  <polygon points="40,160 40,80 90,120" fill="url(#blueGradient)" opacity="0.9" />
                  <polygon points="160,160 160,80 110,120" fill="#e0e0e0" opacity="0.7" />
                  <path
                    d="M 50,140 Q 100,100 150,60"
                    stroke="url(#greenGradient)"
                    strokeWidth="6"
                    fill="none"
                    strokeLinecap="round"
                  />
                  <polygon points="150,55 158,48 145,60" fill="#99ff00" />
                </svg>
              </div>
              <div>
                <div className="font-bold bg-gradient-to-r from-blue-500 to-green-400 bg-clip-text text-transparent">
                  AXION
                </div>
                <div className="text-xs text-muted">Smart Trading & Analytics</div>
              </div>
            </div>
            <p className="text-sm text-muted">
              Real-time broker analysis and market intelligence for Nepal Stock Exchange.
            </p>
          </div>

          {/* Products */}
          <div>
            <h3 className="font-semibold text-foreground mb-4">Products</h3>
            <ul className="space-y-2 text-sm text-muted">
              <li>
                <Link href="/dashboard" className="hover:text-foreground transition-colors">
                  Dashboard
                </Link>
              </li>
              <li>
                <Link href="/broker-analysis" className="hover:text-foreground transition-colors">
                  Broker Analysis
                </Link>
              </li>
              <li>
                <Link href="/market" className="hover:text-foreground transition-colors">
                  Market Analysis
                </Link>
              </li>
              <li>
                <Link href="/portfolio" className="hover:text-foreground transition-colors">
                  Portfolio Tracker
                </Link>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h3 className="font-semibold text-foreground mb-4">Resources</h3>
            <ul className="space-y-2 text-sm text-muted">
              <li>
                <Link href="#" className="hover:text-foreground transition-colors">
                  Documentation
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-foreground transition-colors">
                  API Reference
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-foreground transition-colors">
                  Guides
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-foreground transition-colors">
                  Support
                </Link>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="font-semibold text-foreground mb-4">Company</h3>
            <ul className="space-y-2 text-sm text-muted">
              <li>
                <Link href="#" className="hover:text-foreground transition-colors">
                  About
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-foreground transition-colors">
                  Blog
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-foreground transition-colors">
                  Privacy
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-foreground transition-colors">
                  Terms
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-border pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-muted">
              © {currentYear} AXION. All rights reserved. Smart Analysis. Smart Trading. Better Future.
            </p>
            <div className="flex items-center gap-6">
              <Link href="#" className="text-sm text-muted hover:text-foreground transition-colors">
                Twitter
              </Link>
              <Link href="#" className="text-sm text-muted hover:text-foreground transition-colors">
                GitHub
              </Link>
              <Link href="#" className="text-sm text-muted hover:text-foreground transition-colors">
                Discord
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
