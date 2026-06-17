"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { usePoll } from "@/lib/useLive";
import { useAuth } from "@/lib/auth/useAuth";
import type { MarketStatus } from "@/lib/types";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/market", label: "Market" },
  { href: "/fundamental", label: "Fundamental" },
  { href: "/floorsheet", label: "Floorsheet" },
  { href: "/broker", label: "Broker" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/profile", label: "Profile" },
];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const { data } = usePoll<MarketStatus>("/api/market-status", 30_000);
  const open = data?.isOpen?.toUpperCase() === "OPEN";
  const { user, loading, logout } = useAuth();

  // Logout but keep the app running — just return to the login screen.
  async function handleLogout() {
    await logout();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-surface shadow-sm">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-primary font-black text-white text-sm">D</span>
          <span className="text-base font-extrabold tracking-tight text-foreground">DARI SIR</span>
        </Link>

        <nav className="ml-3 flex flex-1 items-center gap-0.5 overflow-x-auto">
          {links.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${
                  active ? "bg-primary text-white" : "text-muted hover:bg-surface-2 hover:text-foreground"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs font-semibold">
          <span className={`h-2 w-2 rounded-full ${open ? "bg-up animate-pulse" : "bg-down"}`} />
          <span className="text-muted">{data ? (open ? "Open" : "Closed") : "…"}</span>
        </div>

        {!loading && user && (
          <button
            onClick={handleLogout}
            className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-down hover:bg-down-bg"
          >
            Logout
          </button>
        )}
      </div>
    </header>
  );
}
