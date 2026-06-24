"use client";
import { useState, useEffect } from "react";
import { usePoll } from "@/lib/useLive";
import type { LiveMarketData } from "@/lib/types";
import MarketPanel from "@/components/MarketPanel";

export default function MarketPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const live = usePoll<{ data: LiveMarketData[]; count: number }>("/api/live", 30_000);

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-black text-foreground">Live Market</h1>
        <span className="text-[11px] text-muted">
          {live.data ? `${live.data.count} stocks` : "Loading..."}
        </span>
      </div>
      <MarketPanel liveData={live.data?.data} mounted={mounted} />
    </main>
  );
}
