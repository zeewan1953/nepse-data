import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RSS_FEEDS = [
  { name: "MeroLagani", url: "https://merolagani.com/rss" },
  { name: "ShareSansar", url: "https://www.sharesansar.com/rss" },
  { name: "BizMandala", url: "https://bizmandala.com/feed/" },
  { name: "ArthikAbhiyan", url: "https://www.arthikabhiyan.com/feed/" },
  { name: "NepalStock", url: "https://nepalstock.com.np/feed" },
];

type NewsItem = {
  id: string;
  title: string;
  source: string;
  url: string;
  time: string;
  description: string;
};

function parseRSS(xml: string, source: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]?.trim();
    const link = block.match(/<link>(.*?)<\/link>/)?.[1]?.trim();
    const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim();
    const desc = block.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)?.[1]?.trim() ?? "";
    if (title && link) {
      items.push({
        id: `${source}-${link}`,
        title: title.replace(/<[^>]+>/g, ""),
        source,
        url: link,
        time: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        description: desc.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").trim().slice(0, 200),
      });
    }
  }
  return items.slice(0, 20);
}

async function fetchNews(): Promise<NewsItem[]> {
  const results = await Promise.all(
    RSS_FEEDS.map(async (feed) => {
      try {
        const res = await fetch(feed.url, { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 0 } });
        if (!res.ok) return [];
        const xml = await res.text();
        return parseRSS(xml, feed.name);
      } catch {
        return [];
      }
    }),
  );
  return results
    .flat()
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 50);
}

export async function GET() {
  try {
    const news = await fetchNews();
    return NextResponse.json({ news, updatedAt: Date.now() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, news: [] }, { status: 502 });
  }
}
