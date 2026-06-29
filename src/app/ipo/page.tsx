"use client";
import { useEffect, useState, useCallback } from "react";

type Issue = {
  id: number; company_name: string; symbol: string | null;
  issue_type: string; units_offered: number | null;
  price_per_unit: number | null; opening_date: string | null;
  closing_date: string | null; allotment_date: string | null;
  listing_date: string | null; registrar_name: string | null;
  status: string; source_url: string | null;
};

type AllotmentResult = {
  result_status: string; message?: string;
  registrar_link?: string; registrar_name?: string; allotted_units?: number;
};

const TABS = [
  { key: "open", label: "Open & Upcoming" },
  { key: "allotment", label: "Allotment Checker" },
  { key: "calendar", label: "Calendar" },
];

export default function IPOPage() {
  const [tab, setTab] = useState("open");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [boid, setBoid] = useState("");
  const [selectedIssueId, setSelectedIssueId] = useState<number | null>(null);
  const [allotResult, setAllotResult] = useState<AllotmentResult | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch("/api/ipo/issues?status=all", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setIssues(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const openIssues = issues.filter((i) => i.status === "open" || i.status === "upcoming");
  const allotReady = issues.filter((i) =>
    ["allotment_pending", "allotted", "listed"].includes(i.status)
  );

  const checkAllotment = useCallback(async () => {
    if (!boid || !selectedIssueId) return;
    setChecking(true);
    setAllotResult(null);
    try {
      const r = await fetch("/api/ipo/allotment-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issue_id: selectedIssueId, boid }),
      });
      const d = await r.json();
      setAllotResult(d);
    } catch {
      setAllotResult({ result_status: "unavailable", message: "Network error" });
    } finally {
      setChecking(false);
      setBoid("");
    }
  }, [boid, selectedIssueId]);

  // Calendar: group events by month
  const calendarEvents = issues.flatMap((i) => {
    const evts: { date: string; type: string; company: string; event: string; status: string }[] = [];
    if (i.opening_date) evts.push({ date: i.opening_date, type: "opening", company: i.company_name, event: "Opens", status: i.status });
    if (i.closing_date) evts.push({ date: i.closing_date, type: "closing", company: i.company_name, event: "Closes", status: i.status });
    if (i.allotment_date) evts.push({ date: i.allotment_date, type: "allotment", company: i.company_name, event: "Allotment", status: i.status });
    if (i.listing_date) evts.push({ date: i.listing_date, type: "listing", company: i.company_name, event: "Listing", status: i.status });
    return evts;
  }).sort((a, b) => a.date.localeCompare(b.date));

  const today = new Date().toISOString().slice(0, 10);

  const typeColor = (t: string) => {
    switch (t) {
      case "IPO": return "bg-[#2962ff]";
      case "FPO": return "bg-[#7b1fa2]";
      case "RIGHTS": return "bg-[#e65100]";
      default: return "bg-[#546e7a]";
    }
  };

  const statusBadge = (s: string) => {
    switch (s) {
      case "open": return <span className="rounded bg-[#26a69a] px-1.5 py-0.5 text-[9px] font-bold text-white">OPEN</span>;
      case "upcoming": return <span className="rounded bg-[#2962ff] px-1.5 py-0.5 text-[9px] font-bold text-white">UPCOMING</span>;
      case "closed": return <span className="rounded bg-[#546e7a] px-1.5 py-0.5 text-[9px] font-bold text-white">CLOSED</span>;
      case "allotment_pending": return <span className="rounded bg-[#f57c00] px-1.5 py-0.5 text-[9px] font-bold text-white">ALLOTMENT PENDING</span>;
      case "allotted": return <span className="rounded bg-[#7b1fa2] px-1.5 py-0.5 text-[9px] font-bold text-white">ALLOTTED</span>;
      case "listed": return <span className="rounded bg-[#00897b] px-1.5 py-0.5 text-[9px] font-bold text-white">LISTED</span>;
      default: return null;
    }
  };

  const fmt = (n: number | null | undefined) => n != null ? n.toLocaleString() : "—";

  return (
    <div className="min-h-screen bg-[#0b0f19] text-[#d1d4dc]">
      {/* Header */}
      <div className="border-b border-[#1e2538] px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <a href="/" className="text-xs text-[#787b86] hover:text-white">← Dashboard</a>
        </div>
        <h1 className="text-lg font-bold text-white">IPO / FPO Tracker</h1>
        <p className="text-xs text-[#787b86]">Track upcoming issues, check allotment results</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#1e2538] px-4">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition ${
              tab === t.key ? "border-[#2962ff] text-white" : "border-transparent text-[#787b86] hover:text-white"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Open & Upcoming */}
      {tab === "open" && (
        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#2962ff] border-t-transparent" />
            </div>
          ) : openIssues.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-[#787b86]">
              <svg className="mb-3 h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              <p className="text-sm">No open or upcoming issues right now</p>
              <p className="text-xs mt-1">Check back later for new IPO/FPO announcements</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {openIssues.map((issue) => {
                const closeDate = issue.closing_date ? new Date(issue.closing_date) : null;
                const daysLeft = closeDate ? Math.ceil((closeDate.getTime() - Date.now()) / 86400000) : null;
                return (
                  <div key={issue.id} className="rounded-lg border border-[#1e2538] bg-[#131722] p-4 hover:border-[#2a2e39] transition">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold text-white ${typeColor(issue.issue_type)}`}>
                            {issue.issue_type}
                          </span>
                          {statusBadge(issue.status)}
                        </div>
                        <h3 className="text-sm font-bold text-white">{issue.company_name}</h3>
                        {issue.symbol && <span className="text-[10px] text-[#787b86]">{issue.symbol}</span>}
                      </div>
                    </div>
                    <div className="space-y-1 text-[11px] text-[#787b86]">
                      <div className="flex justify-between"><span>Units</span><span className="text-white">{fmt(issue.units_offered)}</span></div>
                      <div className="flex justify-between"><span>Price</span><span className="text-white">{issue.price_per_unit ? `Rs. ${issue.price_per_unit.toLocaleString()}` : "—"}</span></div>
                      {issue.opening_date && <div className="flex justify-between"><span>Opens</span><span className="text-white">{issue.opening_date}</span></div>}
                      {issue.closing_date && <div className="flex justify-between"><span>Closes</span><span className="text-white">{issue.closing_date}</span></div>}
                      {daysLeft != null && daysLeft > 0 && (
                        <div className="flex justify-between pt-1 border-t border-[#1e2538] mt-1">
                          <span className="text-[#f57c00] font-semibold">{daysLeft} day{daysLeft !== 1 ? "s" : ""} left</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Allotment Checker */}
      {tab === "allotment" && (
        <div className="p-4 max-w-lg mx-auto">
          <div className="rounded-lg border border-[#1e2538] bg-[#131722] p-5">
            <h2 className="text-sm font-bold text-white mb-1">Check Allotment Status</h2>
            <p className="text-[10px] text-[#787b86] mb-4">Enter your BOID to check allotment status for recent issues</p>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-semibold text-[#787b86] mb-1">Select Issue</label>
                <select value={selectedIssueId ?? ""} onChange={(e) => setSelectedIssueId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full rounded border border-[#2a2e39] bg-[#0b0f19] px-3 py-2 text-xs text-white outline-none focus:border-[#2962ff]">
                  <option value="">— Select —</option>
                  {allotReady.map((i) => (
                    <option key={i.id} value={i.id}>{i.company_name} ({i.issue_type})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-[#787b86] mb-1">BOID Number</label>
                <input type="text" inputMode="numeric" maxLength={16} value={boid}
                  onChange={(e) => setBoid(e.target.value.replace(/\D/g, ""))}
                  placeholder="Enter 16-digit BOID"
                  className="w-full rounded border border-[#2a2e39] bg-[#0b0f19] px-3 py-2 text-xs text-white outline-none focus:border-[#2962ff] font-mono tracking-wider"
                />
                <p className="text-[9px] text-[#787b86] mt-0.5">Your BOID is hashed and never stored</p>
              </div>

              <button onClick={checkAllotment} disabled={!boid || !selectedIssueId || checking}
                className="w-full rounded bg-[#2962ff] py-2 text-xs font-bold text-white hover:bg-[#1e4db8] disabled:opacity-40 transition">
                {checking ? "Checking..." : "Check Allotment"}
              </button>
            </div>

            {allotResult && (
              <div className={`mt-4 rounded-lg border p-3 ${
                allotResult.result_status === "allotted" ? "border-[#26a69a] bg-[#26a69a11]" :
                allotResult.result_status === "not_allotted" ? "border-[#ef5350] bg-[#ef535011]" :
                "border-[#f57c00] bg-[#f57c0011]"
              }`}>
                {allotResult.result_status === "allotted" && (
                  <div>
                    <p className="text-sm font-bold text-[#26a69a]">✓ Allotted</p>
                    <p className="text-xs text-[#787b86] mt-1">Units: {allotResult.allotted_units}</p>
                  </div>
                )}
                {allotResult.result_status === "not_allotted" && (
                  <p className="text-sm font-bold text-[#ef5350]">✗ Not Allotted</p>
                )}
                {allotResult.result_status === "unavailable" && (
                  <div>
                    <p className="text-xs font-semibold text-[#f57c00]">Live lookup unavailable</p>
                    <p className="text-[10px] text-[#787b86] mt-1">{allotResult.message}</p>
                    {allotResult.registrar_name && (
                      <p className="text-[10px] text-[#787b86] mt-1">
                        Registrar: {allotResult.registrar_name}
                      </p>
                    )}
                    {allotResult.registrar_link && (
                      <a href={allotResult.registrar_link} target="_blank" rel="noopener"
                        className="mt-2 inline-block rounded bg-[#2962ff] px-3 py-1 text-[10px] font-bold text-white hover:bg-[#1e4db8]">
                        Check on Official Source →
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {allotReady.length === 0 && !loading && (
            <p className="text-xs text-[#787b86] mt-4 text-center">
              No issues pending allotment check at this time
            </p>
          )}
        </div>
      )}

      {/* Tab 3: Calendar */}
      {tab === "calendar" && (
        <div className="p-4">
          {calendarEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-[#787b86]">
              <svg className="mb-3 h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              <p className="text-sm">No calendar events</p>
            </div>
          ) : (
            <div className="space-y-1">
              {calendarEvents.map((evt, i) => {
                const isToday = evt.date === today;
                const typeColors: Record<string, string> = {
                  opening: "border-l-[#26a69a]", closing: "border-l-[#ef5350]",
                  allotment: "border-l-[#f57c00]", allotment_est: "border-l-[#f57c0066]",
                  listing: "border-l-[#7b1fa2]",
                };
                const dotColors: Record<string, string> = {
                  opening: "bg-[#26a69a]", closing: "bg-[#ef5350]",
                  allotment: "bg-[#f57c00]", allotment_est: "bg-[#f57c0066]",
                  listing: "bg-[#7b1fa2]",
                };
                return (
                  <div key={i} className={`flex items-center gap-3 rounded border border-[#1e2538] bg-[#131722] px-3 py-2 border-l-2 ${typeColors[evt.type] || "border-l-[#546e7a]"} ${isToday ? "ring-1 ring-[#f5b041]" : ""}`}>
                    <div className={`h-2 w-2 rounded-full ${dotColors[evt.type] || "bg-[#546e7a]"}`} />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-white font-medium truncate block">{evt.company}</span>
                      <span className="text-[10px] text-[#787b86]">{evt.event}</span>
                    </div>
                    <span className={`text-[10px] font-mono whitespace-nowrap ${isToday ? "text-[#f5b041] font-bold" : "text-[#787b86]"}`}>
                      {isToday ? "★ TODAY" : evt.date}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
