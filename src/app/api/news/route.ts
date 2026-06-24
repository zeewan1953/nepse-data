import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NewsItem = {
  id: string;
  title: string;
  image: string;
  content: string;
  category: string;
  time: string;
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

function decodeHtml(str: string): string {
  return str
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, "").trim();
}

function timeoutFetch(url: string, opts: RequestInit = {}, ms = 6000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal, headers: { "User-Agent": UA, ...((opts.headers as Record<string, string>) || {}) } }).finally(() => clearTimeout(t));
}

/* ── 1. MeroLagani ─────────────────────────────────────────────── */
async function fetchMeroLagani(): Promise<NewsItem[]> {
  try {
    const res = await timeoutFetch("https://merolagani.com/NewsList.aspx");
    if (!res.ok) return [];
    const html = Buffer.from(await res.arrayBuffer()).toString("utf-8");

    const imgMap = new Map<string, string>();
    let m: RegExpExecArray | null;
    const imgRe = /src="([^"]*images\.merolagani\.com\/Uploads\/Repository\/[^"]+)"[\s\S]*?newsID=(\d+)/gi;
    while ((m = imgRe.exec(html)) !== null) { if (!imgMap.has(m[2])) imgMap.set(m[2], m[1]); }
    const imgRe2 = /newsID=(\d+)"[\s\S]{0,500}?src="([^"]*images\.merolagani\.com\/Uploads\/Repository\/[^"]+)"/gi;
    while ((m = imgRe2.exec(html)) !== null) { if (!imgMap.has(m[1])) imgMap.set(m[1], m[2]); }

    const items: NewsItem[] = [];
    const seen = new Set<string>();
    const blockRe = /newsID=(\d+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h4>\s*<span[^>]*>\s*([\w\s,:]+?)\s*<\/span>/gi;
    while ((m = blockRe.exec(html)) !== null) {
      const newsId = m[1], title = decodeHtml(m[2]);
      if (!title || title.length < 5 || seen.has(newsId)) continue;
      seen.add(newsId);
      let time = new Date().toISOString();
      try { if (m[3]?.trim()) time = new Date(m[3].trim() + " NPT").toISOString(); } catch {}
      items.push({ id: `ml-${newsId}`, title: title.slice(0, 250), image: imgMap.get(newsId) || "", content: title, category: categorize(title), time });
    }
    if (items.length === 0) {
      const simple = /newsID=(\d+)"[^>]*>([\s\S]*?)<\/a>/gi;
      while ((m = simple.exec(html)) !== null) {
        const newsId = m[1], title = decodeHtml(m[2]);
        if (!title || title.length < 5 || seen.has(newsId)) continue;
        seen.add(newsId);
        items.push({ id: `ml-${newsId}`, title: title.slice(0, 250), image: imgMap.get(newsId) || "", content: title, category: categorize(title), time: new Date().toISOString() });
      }
    }
    return items.slice(0, 15);
  } catch { return []; }
}

/* ── 2. ShareSansar ────────────────────────────────────────────── */
async function fetchShareSansar(): Promise<NewsItem[]> {
  try {
    const res = await timeoutFetch("http://www.sharesansar.com");
    if (!res.ok) return [];
    const html = await res.text();

    const items: NewsItem[] = [];
    const seen = new Set<string>();
    const re = /<a\s+href="(https?:\/\/www\.sharesansar\.com\/newsdetail\/([^"]+))"[^>]*title="([^"]+)"/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const slug = m[2].replace(/\.html.*$/, ""), title = decodeHtml(m[3]);
      if (!title || title.length < 5 || seen.has(slug)) continue;
      seen.add(slug);
      let image = "";
      const escapedSlug = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const imgNear = new RegExp(`${escapedSlug}[\\s\\S]{0,500}?<img[^>]*src="([^"]+)"`, "gi");
      const imgM = imgNear.exec(html);
      if (imgM && !imgM[1].includes("advertisement") && !imgM[1].includes(".gif")) image = imgM[1];
      if (!image) {
        const imgNear2 = new RegExp(`<img[^>]*src="([^"]+)"[\\s\\S]{0,800}?${escapedSlug}`, "gi");
        const imgM2 = imgNear2.exec(html);
        if (imgM2 && !imgM2[1].includes("advertisement") && !imgM2[1].includes(".gif")) image = imgM2[1];
      }
      items.push({ id: `ss-${slug}`, title: title.slice(0, 250), image, content: title, category: categorize(title), time: extractDateFromSlug(slug) || new Date().toISOString() });
    }
    return items.slice(0, 15);
  } catch { return []; }
}

/* ── 3. CorporateKhabar ────────────────────────────────────────── */
async function fetchCorporateKhabar(): Promise<NewsItem[]> {
  try {
    const res = await timeoutFetch("https://corporatekhabar.com/");
    if (!res.ok) return [];
    const html = await res.text();

    // Build image map: find images near article links
    const imgRe = /<img[^>]*src="(https:\/\/cdn\.corporatekhabar\.com\/uploads\/[^"]+)"[^>]*>/gi;
    const allImgs: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = imgRe.exec(html)) !== null) {
      if (!m[1].includes("-150x150") && !m[1].includes("corporate.png") && !m[1].endsWith(".gif")) allImgs.push(m[1]);
    }

    const items: NewsItem[] = [];
    const seen = new Set<string>();
    const linkRe = /<a[^>]*href="(https?:\/\/corporatekhabar\.com\/([^"/?#]+))\/?"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((m = linkRe.exec(html)) !== null) {
      const url = m[1], slug = m[2], title = decodeHtml(m[3]);
      if (!title || title.length < 10 || title.length > 200 || seen.has(slug)) continue;
      if (/^(tag|category|page|author|about|contact|registration|privacy|terms)$/i.test(slug)) continue;
      seen.add(slug);

      // Find image near this link (look back 800 chars)
      let image = "";
      const before = html.slice(Math.max(0, m.index - 800), m.index);
      const imgMatch = before.match(/src="(https:\/\/cdn\.corporatekhabar\.com\/uploads\/[^"]+)"/);
      if (imgMatch && !imgMatch[1].includes("-150x150") && !imgMatch[1].includes("corporate.png") && !imgMatch[1].endsWith(".gif")) {
        image = imgMatch[1];
      }
      items.push({ id: `ck-${slug}`, title: title.slice(0, 250), image, content: title, category: categorize(title), time: new Date().toISOString() });
    }
    return items.slice(0, 12);
  } catch { return []; }
}

/* ── 4. NepaliPaisa (JSON API) ─────────────────────────────────── */
async function fetchNepaliPaisa(): Promise<NewsItem[]> {
  try {
    const res = await timeoutFetch("https://nepalipaisa.com/api/GetNewsList", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        dateType: "", dateFrom: "", dateTo: "", sectors: [], companies: [],
        categoryId: 0, subCategoryId: 0, pageNo: 1, itemsPerPage: 15,
        pagePerDisplay: 10, newsType: "", sectorGroup: "",
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (data.statusCode !== 200 || !data.result?.data) return [];

    const items: NewsItem[] = [];
    for (const group of data.result.data) {
      if (!Array.isArray(group.newsData)) continue;
      for (const n of group.newsData) {
        if (!n.newsId || !n.newsTitle) continue;
        const title = decodeHtml(n.newsTitle);
        if (title.length < 5) continue;
        items.push({
          id: `np-${n.newsId}`,
          title: title.slice(0, 250),
          image: n.imageUrl || "",
          content: title,
          category: categorize(title),
          time: n.newsDate ? new Date(n.newsDate + "T12:00:00+05:45").toISOString() : new Date().toISOString(),
        });
      }
    }
    return items.slice(0, 15);
  } catch { return []; }
}

/* ── 5. ArthaSansar ────────────────────────────────────────────── */
async function fetchArthaSansar(): Promise<NewsItem[]> {
  try {
    const res = await timeoutFetch("https://arthasansar.com");
    if (!res.ok) return [];
    const html = await res.text();

    const items: NewsItem[] = [];
    const seen = new Set<string>();
    const re = /<a[^>]*href="\/news\/(\d+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const id = m[1], title = decodeHtml(m[2]);
      if (!title || title.length < 10 || seen.has(id)) continue;
      seen.add(id);

      // Find image near this link (look back 500 chars)
      let image = "";
      const before = html.slice(Math.max(0, m.index - 500), m.index);
      const imgMatch = before.match(/src="([^"]*uploads\/media\/[^"]+)"/);
      if (imgMatch && !imgMatch[1].includes("512x512") && !imgMatch[1].endsWith(".gif")) {
        image = imgMatch[1].startsWith("http") ? imgMatch[1] : `https://arthasansar.com${imgMatch[1]}`;
      }
      items.push({ id: `as-${id}`, title: title.slice(0, 250), image, content: title, category: categorize(title), time: new Date().toISOString() });
    }
    return items.slice(0, 12);
  } catch { return []; }
}

/* ── Helpers ────────────────────────────────────────────────────── */
function categorize(title: string): string {
  const t = title.toLowerCase();
  if (/ipo|rights share|fpo|book building|ऋणपत्र|bond/.test(t)) return "IPO & Shares";
  if (/dividend|bonus|agm|annual|लाभांश|बोनस/.test(t)) return "Corporate";
  if (/nrb|rastra bank|monetary|banking|राष्ट्र बैंक|बैंक/.test(t)) return "Banking";
  if (/nepse|index|market|trading|turnover|bull|bear|नेप्से|बजार|कारोबार/.test(t)) return "Market";
  if (/insurance|beema|बीमा/.test(t)) return "Insurance";
  if (/hydro|power|energy|bijuli|विद्युत्|हाइड्रो/.test(t)) return "Hydropower";
  if (/budget|government|policy|fiscal|बजेट|सरकार|नीति/.test(t)) return "Policy";
  if (/sebon|regulation|license|सेबोन|बोर्ड|धितोपत्र/.test(t)) return "Regulation";
  return "General";
}

function extractDateFromSlug(slug: string): string | null {
  const m = slug.match(/(\d{4})-(\d{2})-(\d{2})$/);
  if (m) { try { return new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00+05:45`).toISOString(); } catch {} }
  return null;
}

/* ── Main ───────────────────────────────────────────────────────── */
async function fetchNews(): Promise<NewsItem[]> {
  const [ml, ss, ck, np, as_] = await Promise.all([
    fetchMeroLagani(), fetchShareSansar(), fetchCorporateKhabar(), fetchNepaliPaisa(), fetchArthaSansar(),
  ]);
  // Deduplicate by title similarity, sort by time, limit to 30
  const all = [...ml, ...ss, ...ck, ...np, ...as_];
  
  // Log image stats
  const totalWithImages = all.filter(item => item.image).length;
  console.log(`[News API] Total items: ${all.length}, With images: ${totalWithImages}, Without: ${all.length - totalWithImages}`);
  
  const seenTitles = new Set<string>();
  const unique = all.filter((item) => {
    const key = item.title.slice(0, 40).toLowerCase();
    if (seenTitles.has(key)) return false;
    seenTitles.add(key);
    return true;
  });
  return unique
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 30);
}

export async function GET() {
  try {
    const news = await fetchNews();
    return NextResponse.json({ news, updatedAt: Date.now() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, news: [] }, { status: 502 });
  }
}
