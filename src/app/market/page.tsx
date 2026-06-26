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
    <div className="mx-auto w-full max-w-[1440px] px-2 sm:px-4 py-3 sm:py-5">
      <div className="mb-3 sm:mb-4 flex items-center justify-between px-1">
        <h1 className="text-base sm:text-lg font-black text-foreground">Live Market</h1>
        <span className="text-[10px] sm:text-xs text-muted font-medium">
          {live.data ? `${live.data.count} stocks` : "Loading..."}
        </span>
      </div>
      <MarketPanel liveData={live.data?.data} mounted={mounted} />
    </div>
  );
}
