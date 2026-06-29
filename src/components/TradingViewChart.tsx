"use client";
import { useEffect, useRef, useState } from "react";
import { NEPSE_ChartDatafeed } from "@/lib/chart-datafeed";

interface TradingViewChartProps {
  symbol?: string;
  interval?: string;
  fullscreen?: boolean;
  height?: number;
  autosize?: boolean;
}

/**
 * TradingView Charting Library Wrapper Component
 * 
 * This component loads the official TradingView Charting Library
 * and creates a widget with our custom NEPSE datafeed.
 * 
 * REQUIREMENTS:
 * 1. Get TradingView Charting Library access from https://www.tradingview.com/HTML-charts/
 * 2. Place the library files in: public/tradingview/
 *    - charting_library.js
 *    - charting_library.css (optional)
 * 3. The library will load automatically
 * 
 * Until the library is available, this shows a placeholder with instructions.
 */
export default function TradingViewChart({
  symbol = "NEPSE",
  interval = "5",
  fullscreen = false,
  height = 600,
  autosize = true,
}: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "missing">("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    if (!containerRef.current) return;

    // Check if TradingView library is available
    const checkAndLoad = () => {
      // Clear any existing widget
      if (widgetRef.current) {
        widgetRef.current.remove();
        widgetRef.current = null;
      }

      // Check if TradingView is loaded
      const TV = (window as any).TradingView;
      if (!TV || !TV.widget) {
        setStatus("missing");
        setErrorMsg("TradingView Charting Library not found. Please place library files in /public/tradingview/");
        return;
      }

      try {
        // Create the widget with the custom datafeed
        widgetRef.current = new TV.widget({
          container: containerRef.current,
          datafeed: NEPSE_ChartDatafeed,
          autosize: autosize,
          symbol: symbol,
          interval: interval,
          timezone: "Asia/Kathmandu",
          theme: "dark",
          style: "1", // Candlestick
          locale: "en",
          toolbar_bg: "#0b0f19",
          enable_publishing: false,
          allow_symbol_change: true,
          hide_side_toolbar: false,
          hide_top_toolbar: false,
          hide_legend: false,
          save_image: true,
          withdateranges: true,
          studies: [
            "MASimple@tv-basicstudies",  // SMA
            "MACD@tv-basicstudies",
            "RSI@tv-basicstudies",
            "Volume@tv-basicstudies",
          ],
          disabled_features: [
            "header_symbol_search", // We use our own search
          ],
          enabled_features: [
            "study_templates",
            "keep_left_toolbar_visible_on_pc",
          ],
          fullscreen: fullscreen,
          height: autosize ? "100%" : height,
          width: "100%",
        });

        setStatus("ready");
      } catch (err) {
        console.error("[TradingView] Widget error:", err);
        setStatus("error");
        setErrorMsg("Failed to create TradingView widget");
      }
    };

    // Try to load TradingView library script
    const loadScript = () => {
      // Check if already loaded
      if ((window as any).TradingView?.widget) {
        checkAndLoad();
        return;
      }

      // Try to load from public/tradingview/
      const script = document.createElement("script");
      script.src = "/tradingview/charting_library.js";
      script.async = true;
      script.onload = () => {
        // Wait a bit for TradingView to initialize
        setTimeout(checkAndLoad, 100);
      };
      script.onerror = () => {
        setStatus("missing");
        setErrorMsg("TradingView Charting Library not found. Please place library files in /public/tradingview/");
      };
      document.head.appendChild(script);
    };

    loadScript();

    return () => {
      if (widgetRef.current) {
        widgetRef.current.remove();
        widgetRef.current = null;
      }
    };
  }, [symbol, interval, fullscreen, height, autosize]);

  return (
    <div className="relative h-full w-full">
      {/* TradingView Chart Container */}
      <div
        ref={containerRef}
        className="h-full w-full"
        style={{ minHeight: height }}
      />

      {/* Status Overlay */}
      {status === "missing" && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0b0f19]/95 backdrop-blur-sm">
          <div className="max-w-md rounded-xl border border-[#222a3a] bg-[#161b27] p-6 text-center">
            <div className="mb-4 text-4xl">📊</div>
            <h3 className="mb-2 text-lg font-bold text-white">TradingView Charting Library</h3>
            <p className="mb-4 text-sm text-[#8a93a6]">
              {errorMsg}
            </p>
            <div className="rounded-lg bg-[#0b0f19] p-4 text-left text-xs">
              <p className="mb-2 font-bold text-white">Setup Instructions:</p>
              <ol className="list-decimal space-y-1 text-[#8a93a6]">
                <li>Request access at <a href="https://www.tradingview.com/HTML-charts/" target="_blank" rel="noopener" className="text-[#2962ff] hover:underline">tradingview.com/HTML-charts</a></li>
                <li>Clone the library from their private GitHub repo</li>
                <li>Copy files to <code className="text-white">public/tradingview/</code></li>
                <li>Required files: <code className="text-white">charting_library.js</code></li>
              </ol>
            </div>
            <p className="mt-4 text-xs text-[#8a93a6]">
              The datafeed API is ready at <code className="text-white">/api/chart/*</code>
            </p>
          </div>
        </div>
      )}

      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0b0f19]/80">
          <div className="text-center">
            <div className="mb-2 h-8 w-8 animate-spin rounded-full border-2 border-[#2962ff] border-t-transparent" />
            <p className="text-sm text-[#8a93a6]">Loading TradingView...</p>
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0b0f19]/95">
          <div className="rounded-xl border border-[#ef5350] bg-[#161b27] p-6 text-center">
            <div className="mb-2 text-2xl">⚠️</div>
            <p className="text-sm text-[#ef5350]">{errorMsg}</p>
          </div>
        </div>
      )}
    </div>
  );
}
