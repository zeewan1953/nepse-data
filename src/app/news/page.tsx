"use client";
import { useState, useMemo } from "react";
import { usePoll } from "@/lib/useLive";

type NewsItem = {
  id: string;
  title: string;
  source: string;
  url: string;
  time: string;
  description: string;
};
type NewsResp = { news: NewsItem[]; updatedAt: number };

const SOURCE_COLORS: Record<string, string> = {
  MeroLagani: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  ShareSansar: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  BizMandala: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
  ArthikAbhiyan: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
  NepalStock: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
};

export default function NewsPage() {
  const news = usePoll<NewsResp>("/api/news", 10_000);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const sources = useMemo(() => {
    if (!news.data?.news) return [];
    return Array.from(new Set(news.data.news.map((n) => n.source)));
  }, [news.data]);

  const filtered = useMemo(() => {
    if (!news.data?.news) return [];
    let items = news.data.news;
    if (filter !== "all") items = items.filter((n) => n.source === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.description.toLowerCase().includes(q) ||
          n.source.toLowerCase().includes(q),
      );
    }
    return items;
  }, [news.data, filter, search]);

  const grouped = useMemo(() => {
    const groups: { label: string; items: NewsItem[] }[] = [];
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);

    const todayItems: NewsItem[] = [];
    const yesterdayItems: NewsItem[] = [];
    const olderItems: NewsItem[] = [];

    for (const item of filtered) {
      const t = new Date(item.time);
      if (t >= today) todayItems.push(item);
      else if (t >= yesterday) yesterdayItems.push(item);
      else olderItems.push(item);
    }

    if (todayItems.length) groups.push({ label: "Today", items: todayItems });
    if (yesterdayItems.length) groups.push({ label: "Yesterday", items: yesterdayItems });
    if (olderItems.length) groups.push({ label: "Earlier", items: olderItems });

    return groups;
  }, [filtered]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">📰 Market News</h1>
          <p className="text-sm text-muted">
            Live news from Nepali stock market sources
            {news.data?.updatedAt && (
              <> · Updated {new Date(news.data.updatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</>
            )}
            {news.data && <> · {news.data.news.length} articles</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${news.data ? "bg-up-bg text-up" : "bg-surface-2 text-muted"}`}>
            {news.loading ? "⟳ Syncing…" : news.data ? "✓ Live" : "—"}
          </span>
        </div>
      </div>

      {/* Search + Filter Bar */}
      <div className="space-y-3 rounded-xl border border-border bg-surface p-4 shadow-sm">
        {/* Search */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search news by title, content, or source..."
            className="w-full rounded-lg border border-border bg-surface-2 py-2.5 pl-10 pr-4 text-sm font-semibold outline-none focus:border-primary placeholder:text-muted"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground">
              ✕
            </button>
          )}
        </div>

        {/* Source Filter */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setFilter("all")}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              filter === "all" ? "bg-primary text-white shadow-sm" : "border border-border bg-surface-2 text-muted hover:bg-surface-2/80"
            }`}
          >
            All ({news.data?.news.length ?? 0})
          </button>
          {sources.map((s) => {
            const count = news.data?.news.filter((n) => n.source === s).length ?? 0;
            return (
              <button
                key={s}
                onClick={() => setFilter(filter === s ? "all" : s)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                  filter === s
                    ? SOURCE_COLORS[s] ?? "bg-primary/10 text-primary border-primary/20"
                    : "border-border bg-surface-2 text-muted hover:bg-surface-2/80"
                }`}
              >
                {s} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* News Content */}
      {news.loading && !news.data && (
        <div className="rounded-xl border border-border bg-surface p-12 text-center">
          <div className="mb-2 text-3xl">📰</div>
          <div className="text-sm font-semibold text-muted">Loading market news from multiple sources…</div>
        </div>
      )}

      {news.error && (
        <div className="rounded-xl border border-down/30 bg-down-bg p-4 text-center">
          <div className="text-sm font-bold text-down">Error loading news: {news.error}</div>
          <div className="mt-1 text-xs text-muted">Some RSS sources may be temporarily unavailable</div>
        </div>
      )}

      {grouped.length === 0 && news.data && (
        <div className="rounded-xl border border-border bg-surface p-12 text-center">
          <div className="mb-2 text-3xl">🔍</div>
          <div className="text-sm font-semibold text-muted">
            {search || filter !== "all" ? "No news matches your search/filter." : "No news available right now."}
          </div>
        </div>
      )}

      {grouped.map((group) => (
        <div key={group.label} className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-muted">{group.label}</h2>
            <div className="flex-1 border-t border-border" />
            <span className="text-[10px] font-semibold text-muted">{group.items.length} articles</span>
          </div>

          <div className="space-y-2">
            {group.items.map((n) => (
              <a
                key={n.id}
                href={n.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block rounded-xl border border-border bg-surface p-4 shadow-sm transition hover:border-primary/30 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${SOURCE_COLORS[n.source] ?? "bg-surface-2 text-muted border-border"}`}>
                        {n.source}
                      </span>
                      <span className="text-[10px] text-muted">
                        {new Date(n.time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold leading-snug text-foreground group-hover:text-primary">
                      {n.title}
                    </h3>
                    {n.description && (
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
                        {n.description}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 pt-1 text-muted opacity-0 transition group-hover:opacity-100">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      ))}

      {/* Footer */}
      <div className="rounded-xl border border-border bg-surface p-4 text-center">
        <p className="text-xs text-muted">
          News aggregated from public RSS feeds. Auto-refreshes every 10 seconds.
          <br />
          Sources: {sources.join(", ") || "Loading…"}
        </p>
      </div>
    </div>
  );
}
