"use client";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { usePoll } from "@/lib/useLive";
import { useNotification } from "@/lib/NotificationContext";

type NewsItem = {
  id: string;
  title: string;
  image: string;
  content: string;
  category: string;
  time: string;
};
type NewsResp = { news: NewsItem[]; updatedAt: number };
type ArticleData = { title: string; content: string; images: string[]; time: string };

const CATEGORY_COLORS: Record<string, string> = {
  Market: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  "IPO & Shares": "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  Corporate: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  Banking: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  Hydropower: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  Policy: "bg-red-500/15 text-red-600 dark:text-red-400",
  Insurance: "bg-pink-500/15 text-pink-600 dark:text-pink-400",
  Regulation: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  General: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
};

export default function NewsPage() {
  const news = usePoll<NewsResp>("/api/news", 600_000); // Refresh every 10 minutes
  const { notify } = useNotification();
  const prevIdsRef = useRef<Set<string>>(new Set());

  // Notify for EVERY new news item
  useEffect(() => {
    if (!news.data?.news?.length) return;
    
    const currentIds = new Set(news.data.news.map(n => n.id));
    const previousIds = prevIdsRef.current;
    
    // Find new news items that weren't there before
    const newNews = news.data.news.filter(n => !previousIds.has(n.id));
    
    if (previousIds.size > 0 && newNews.length > 0) {
      // Send individual notification for each new news
      newNews.forEach((item, idx) => {
        setTimeout(() => {
          notify(
            "📰 New News",
            item.title.substring(0, 100),
            "news",
            item.image || undefined
          );
        }, idx * 500); // Stagger notifications by 500ms
      });
    }
    
    // Update the tracked IDs
    prevIdsRef.current = currentIds;
  }, [news.data?.news, notify]);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedArticle, setSelectedArticle] = useState<NewsItem | null>(null);
  const [articleData, setArticleData] = useState<ArticleData | null>(null);
  const [articleLoading, setArticleLoading] = useState(false);

  const categories = useMemo(() => {
    if (!news.data?.news) return [];
    return Array.from(new Set(news.data.news.map((n) => n.category))).sort();
  }, [news.data]);

  const filtered = useMemo(() => {
    if (!news.data?.news) return [];
    let items = news.data.news;
    if (filter !== "all") items = items.filter((n) => n.category === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((n) => n.title.toLowerCase().includes(q) || n.category.toLowerCase().includes(q));
    }
    return items;
  }, [news.data, filter, search]);

  const openArticle = useCallback(async (item: NewsItem) => {
    setSelectedArticle(item);
    setArticleData(null);
    setArticleLoading(true);
    try {
      const dashIdx = item.id.indexOf("-");
      const prefix = item.id.slice(0, dashIdx);
      const id = item.id.slice(dashIdx + 1);
      const source = prefix;
      const res = await fetch(`/api/news/article?id=${id}&source=${source}`);
      const data = await res.json();
      setArticleData(data);
    } catch {
      setArticleData({ title: item.title, content: item.content || item.title, images: item.image ? [item.image] : [], time: item.time });
    } finally {
      setArticleLoading(false);
    }
  }, []);

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">📰 NEPSE News</h1>
          <p className="text-sm text-muted">
            Nepal Stock Exchange news & updates
            {news.data?.updatedAt && (
              <> · Updated {new Date(news.data.updatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</>
            )}
            {news.data && <> · {news.data.news.length} articles</>}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${news.data ? "bg-up-bg text-up" : "bg-surface-2 text-muted"}`}>
          {news.loading ? "⟳ Syncing…" : news.data ? "✓ Live" : "—"}
        </span>
      </div>

      {/* Search + Category Filter */}
      <div className="space-y-3 rounded-xl border border-border bg-surface p-4 shadow-sm">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search news..."
            className="w-full rounded-lg border border-border bg-surface-2 py-2.5 pl-10 pr-4 text-sm font-semibold outline-none focus:border-primary placeholder:text-muted" />
          {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground">✕</button>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setFilter("all")}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${filter === "all" ? "bg-primary text-white shadow-sm" : "border border-border bg-surface-2 text-muted hover:bg-surface-2/80"}`}>
            All ({news.data?.news.length ?? 0})
          </button>
          {categories.map((c) => {
            const count = news.data?.news.filter((n) => n.category === c).length ?? 0;
            return (
              <button key={c} onClick={() => setFilter(filter === c ? "all" : c)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${filter === c ? CATEGORY_COLORS[c] ?? "bg-primary/10 text-primary" : "border border-border bg-surface-2 text-muted hover:bg-surface-2/80"}`}>
                {c} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading */}
      {news.loading && !news.data && (
        <div className="rounded-xl border border-border bg-surface p-12 text-center">
          <div className="mb-2 text-3xl">📰</div>
          <div className="text-sm font-semibold text-muted">Loading market news…</div>
        </div>
      )}

      {/* Error */}
      {news.error && (
        <div className="rounded-xl border border-down/30 bg-down-bg p-4 text-center">
          <div className="text-sm font-bold text-down">Error loading news: {news.error}</div>
        </div>
      )}

      {/* Empty */}
      {filtered.length === 0 && news.data && (
        <div className="rounded-xl border border-border bg-surface p-12 text-center">
          <div className="mb-2 text-3xl">🔍</div>
          <div className="text-sm font-semibold text-muted">
            {search || filter !== "all" ? "No news matches your search." : "No news available right now."}
          </div>
        </div>
      )}

      {/* Featured Article (first with image) */}
      {filtered.length > 0 && (
        <div onClick={() => openArticle(filtered[0])}
          className="group relative cursor-pointer overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition hover:shadow-lg">
          <div className="relative h-64 overflow-hidden bg-gradient-to-br from-primary/5 to-primary/15">
            {filtered[0].image ? (
              <>
                <img src={filtered[0].image} alt="" className="h-full w-full object-cover transition group-hover:scale-105" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
              </>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-6xl opacity-20">📰</span>
              </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 p-5">
              <span className={`mb-2 inline-block rounded-md px-2 py-0.5 text-[10px] font-bold ${CATEGORY_COLORS[filtered[0].category] ?? "bg-slate-500/15 text-slate-400"}`}>
                {filtered[0].category}
              </span>
              <h2 className="text-lg font-extrabold leading-tight text-white drop-shadow">{filtered[0].title}</h2>
              <span className="mt-1 text-xs text-white/60">{timeAgo(filtered[0].time)}</span>
            </div>
          </div>
        </div>
      )}

      {/* News Grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((n) => (
          <div key={n.id} onClick={() => openArticle(n)}
            className="group cursor-pointer overflow-hidden rounded-xl border border-border bg-surface shadow-sm transition hover:border-primary/30 hover:shadow-md">
            {n.image ? (
              <div className="relative h-36 overflow-hidden">
                <img src={n.image} alt="" className="h-full w-full object-cover transition group-hover:scale-105"
                  onError={(e) => { 
                    const target = e.target as HTMLImageElement;
                    // Fallback to placeholder if image fails
                    target.style.display = "none";
                    const parent = target.parentElement;
                    if (parent && !parent.querySelector('.fallback-icon')) {
                      const fallback = document.createElement('div');
                      fallback.className = 'fallback-icon absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/5 to-primary/15';
                      fallback.innerHTML = '<span class="text-4xl opacity-30">📰</span>';
                      parent.appendChild(fallback);
                    }
                  }} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              </div>
            ) : (
              <div className="relative flex h-36 items-center justify-center bg-gradient-to-br from-primary/5 to-primary/15">
                <span className="text-4xl opacity-30">📰</span>
              </div>
            )}
            <div className="p-3.5">
              <div className="mb-1.5 flex items-center gap-2">
                <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${CATEGORY_COLORS[n.category] ?? "bg-slate-500/15 text-slate-400"}`}>
                  {n.category}
                </span>
                <span className="text-[10px] text-muted">{timeAgo(n.time)}</span>
              </div>
              <h3 className="text-sm font-bold leading-snug text-foreground line-clamp-3 group-hover:text-primary">{n.title}</h3>
            </div>
          </div>
        ))}
      </div>

      {/* Article Reader Modal */}
      {selectedArticle && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm" onClick={() => setSelectedArticle(null)}>
          <div className="relative mx-auto my-8 w-full max-w-2xl rounded-2xl bg-surface shadow-2xl ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
            {/* Close button */}
            <button onClick={() => setSelectedArticle(null)}
              className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-black/50 text-white hover:bg-black/70">✕</button>

            {/* Hero image */}
            {(articleData?.images?.[0] || selectedArticle.image) && (
              <div className="relative h-64 overflow-hidden rounded-t-2xl">
                <img src={articleData?.images?.[0] || selectedArticle.image} alt=""
                  className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                <div className="absolute inset-0 bg-gradient-to-t from-surface via-transparent to-transparent" />
              </div>
            )}

            <div className="p-6">
              {/* Category + time */}
              <div className="mb-3 flex items-center gap-2">
                <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${CATEGORY_COLORS[selectedArticle.category] ?? "bg-slate-500/15 text-slate-400"}`}>
                  {selectedArticle.category}
                </span>
                <span className="text-xs text-muted">{timeAgo(selectedArticle.time)}</span>
              </div>

              {/* Title */}
              <h2 className="mb-4 text-xl font-extrabold leading-tight text-foreground">
                {articleData?.title || selectedArticle.title}
              </h2>

              {/* Loading state */}
              {articleLoading && (
                <div className="flex items-center justify-center py-8">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <span className="ml-2 text-sm text-muted">Loading article…</span>
                </div>
              )}

              {/* Content */}
              {!articleLoading && articleData && (
                <div className="space-y-4">
                  {/* Article text */}
                  <p className="text-sm leading-relaxed text-muted">{articleData.content || selectedArticle.content || selectedArticle.title}</p>

                  {/* Additional images */}
                  {articleData.images.length > 1 && (
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      {articleData.images.slice(1).map((img, i) => (
                        <img key={i} src={img} alt="" className="rounded-lg object-cover w-full h-40"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Nepal Stock Exchange link */}
              <div className="mt-6 rounded-lg bg-primary/5 p-3 text-center">
                <a href="https://www.nepalstock.com.np" target="_blank" rel="noopener noreferrer"
                  className="text-xs font-semibold text-primary hover:underline">
                  Visit Nepal Stock Exchange →
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="rounded-xl border border-border bg-surface p-4 text-center">
        <p className="text-xs text-muted">
          News auto-refreshes every 5 minutes · Powered by NEPSE AXION
        </p>
      </div>
    </div>
  );
}
