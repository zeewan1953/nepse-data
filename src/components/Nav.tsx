"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { usePoll } from "@/lib/useLive";
import { useAuth } from "@/lib/auth/useAuth";
import type { MarketStatus } from "@/lib/types";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/market", label: "Market Watch" },
  { href: "/floorsheet", label: "Floorsheet" },
  { href: "/broker", label: "Broker Analysis" },
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
    <header className="sticky top-0 z-50 border-b border-border bg-primary text-white shadow-sm">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-white font-black text-primary">
            D
          </span>
          <span className="text-lg font-extrabold tracking-tight">DARI SIR</span>
          <span className="hidden text-xs font-medium text-white/70 sm:inline">
            NEPSE Live
          </span>
        </Link>

        <nav className="ml-2 flex flex-1 items-center gap-1">
          {links.map((l) => {
            const active =
              l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  active ? "bg-white text-primary" : "text-white/85 hover:bg-white/10"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
          <span
            className={`h-2 w-2 rounded-full ${
              open ? "bg-green-300 animate-pulse" : "bg-red-300"
            }`}
          />
          {data ? (open ? "Market Open" : "Market Closed") : "…"}
        </div>

        {!loading && user && (
          <div className="flex items-center gap-2">
            <span className="hidden text-sm font-semibold sm:inline">
              {user.name || user.email.split("@")[0]}
            </span>
            <button
              onClick={handleLogout}
              className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-down hover:bg-white/90"
            >
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
