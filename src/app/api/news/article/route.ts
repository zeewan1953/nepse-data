import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

function decodeHtml(str: string): string {
  return str
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, " ")
    .trim();
}

function stripTags(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function timeoutFetch(url: string, opts: RequestInit = {}, ms = 6000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal, headers: { "User-Agent": UA, ...((opts.headers as Record<string, string>) || {}) } }).finally(() => clearTimeout(t));
}

type ArticleResult = { title: string; content: string; images: string[]; time: string };

/* ── 1. MeroLagani ─────────────────────────────────────────────── */
async function fetchMeroLaganiArticle(id: string): Promise<ArticleResult> {
  const res = await timeoutFetch(`https://merolagani.com/NewsDetail.aspx?newsID=${id}`);
  if (!res.ok) throw new Error("Failed to fetch article");
  const html = Buffer.from(await res.arrayBuffer()).toString("utf-8");

  const titleMatch = html.match(/<h[12][^>]*class="[^"]*news-title[^"]*"[^>]*>([\s\S]*?)<\/h[12]>/i)
    || html.match(/<span[^>]*id="[^"]*lblNewsTitle[^"]*"[^>]*>([\s\S]*?)<\/span>/i)
    || html.match(/<title>([\s\S]*?)<\/title>/i);
  let title = titleMatch ? decodeHtml(titleMatch[1]) : "";
  title = title.replace(/merolagani\s*[-\u2013\u2014]\s*/i, "").replace(/\s*[-|].*merolagani.*$/i, "").trim();

  const bodyMatch = html.match(/<div[^>]*id="ctl00_ContentPlaceHolder1_newsDetail"[^>]*>([\s\S]*?)<\/div>/i)
    || html.match(/<div[^>]*class="[^"]*news-detail[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
    || html.match(/<div[^>]*id="[^"]*newsContent[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
    || html.match(/<div[^>]*class="[^"]*media-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

  let content = "";
  const images: string[] = [];

  if (bodyMatch) {
    const imgRe = /src="([^"]*\.(?:jpg|jpeg|png|webp)[^"]*)"/gi;
    let im: RegExpExecArray | null;
    while ((im = imgRe.exec(bodyMatch[1])) !== null) {
      const src = im[1].startsWith("http") ? im[1] : `https://merolagani.com${im[1]}`;
      images.push(src);
    }
    content = stripTags(decodeHtml(bodyMatch[1])).slice(0, 3000);
  }

  if (images.length === 0) {
    const imgRe = /images\.merolagani\.com\/Uploads\/Repository\/[^"]+/gi;
    let im: RegExpExecArray | null;
    while ((im = imgRe.exec(html)) !== null) images.push(im[0].startsWith("http") ? im[0] : `https://${im[0]}`);
  }

  const dateMatch = html.match(/(\w+\s+\d{1,2},\s*\d{4}\s+\d{1,2}:\d{2}\s*(?:AM|PM))/i);
  let time = new Date().toISOString();
  try { if (dateMatch) time = new Date(dateMatch[1] + " NPT").toISOString(); } catch {}

  return { title, content, images: images.slice(0, 5), time };
}

/* ── 2. ShareSansar ────────────────────────────────────────────── */
async function fetchShareSansarArticle(slug: string): Promise<ArticleResult> {
  const res = await timeoutFetch(`https://www.sharesansar.com/newsdetail/${slug}`);
  if (!res.ok) throw new Error("Failed to fetch article");
  const html = await res.text();

  const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeHtml(titleMatch[1]).replace(/\s*[-|].*[Ss]hare[Ss]ansar.*$/g, "") : "";

  const bodyMatch = html.match(/<div[^>]*id="newsdetail-content"[^>]*>([\s\S]*?)<\/div>\s*(?:<div|<footer)/i)
    || html.match(/<div[^>]*class="[^"]*news-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
    || html.match(/<div[^>]*class="[^"]*article-body[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

  let content = "";
  const images: string[] = [];

  if (bodyMatch) {
    const imgRe = /src="([^"]*\.(?:jpg|jpeg|png|webp)[^"]*)"/gi;
    let im: RegExpExecArray | null;
    while ((im = imgRe.exec(bodyMatch[1])) !== null) {
      const src = im[1].startsWith("http") ? im[1] : `https://www.sharesansar.com${im[1]}`;
      if (!src.includes("advertisement") && !src.includes(".gif") && !src.includes("favicon")) images.push(src);
    }
    content = stripTags(decodeHtml(bodyMatch[1])).slice(0, 3000);
  }

  if (images.length === 0) {
    const imgRe = /content\.sharesansar\.com\/(?:admin|photos\/wp-content\/uploads)\/[^"'\s]+/gi;
    let im: RegExpExecArray | null;
    while ((im = imgRe.exec(html)) !== null) {
      if (!im[0].includes("advertisement") && !im[0].includes(".gif")) images.push(`https://${im[0]}`);
    }
  }

  const dateMatch = slug.match(/(\d{4})-(\d{2})-(\d{2})$/);
  let time = new Date().toISOString();
  try { if (dateMatch) time = new Date(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}T12:00:00+05:45`).toISOString(); } catch {}

  return { title, content, images: images.slice(0, 5), time };
}

/* ── 3. CorporateKhabar ────────────────────────────────────────── */
async function fetchCorporateKhabarArticle(slug: string): Promise<ArticleResult> {
  const res = await timeoutFetch(`https://corporatekhabar.com/${slug}/`);
  if (!res.ok) throw new Error("Failed to fetch article");
  const html = await res.text();

  // Title from <h1> or og:title
  const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
    || html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i)
    || html.match(/<title>([\s\S]*?)<\/title>/i);
  let title = titleMatch ? decodeHtml(titleMatch[1]) : "";
  title = title.replace(/[-|]\s*Corporate\s*Khabar.*$/i, "").trim();

  // OG image as featured
  const ogImg = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i);
  const images: string[] = [];
  if (ogImg && !ogImg[1].includes("corporate.png")) images.push(ogImg[1]);

  // Content from <p> tags
  const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  const paragraphs: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = pRe.exec(html)) !== null) {
    const t = stripTags(decodeHtml(m[1]));
    if (t.length > 20 && !t.includes("Chabahil") && !t.includes("Mahangkal")) paragraphs.push(t);
  }
  const content = paragraphs.join("\n\n").slice(0, 3000);

  // Find article images (not thumbnails, not ads)
  const imgRe = /<img[^>]*src="(https:\/\/cdn\.corporatekhabar\.com\/uploads\/[^"]+)"[^>]*>/gi;
  while ((m = imgRe.exec(html)) !== null) {
    if (!m[1].includes("-150x150") && !m[1].includes("corporate.png") && !m[1].endsWith(".gif") && !images.includes(m[1])) {
      images.push(m[1]);
    }
  }

  const dateMatch = html.match(/<time[^>]*datetime="([^"]+)"/i);
  let time = new Date().toISOString();
  try { if (dateMatch) time = new Date(dateMatch[1]).toISOString(); } catch {}

  return { title, content, images: images.slice(0, 5), time };
}

/* ── 4. NepaliPaisa (JSON API) ─────────────────────────────────── */
async function fetchNepaliPaisaArticle(id: string): Promise<ArticleResult> {
  const res = await timeoutFetch(`https://nepalipaisa.com/api/GetNews?newsId=${id}`);
  if (!res.ok) throw new Error("Failed to fetch article");
  const data = await res.json();
  if (data.statusCode !== 200 || !data.result) throw new Error("No article data");

  const r = data.result;
  const title = decodeHtml(r.newsTitle || "");
  const images: string[] = [];
  if (r.imageUrl) images.push(r.imageUrl);

  // Extract content from descriptions array
  let content = "";
  if (Array.isArray(r.descriptions)) {
    const parts: string[] = [];
    for (const desc of r.descriptions) {
      if (desc?.description) {
        const html = desc.description;
        // Extract images from HTML
        const imgRe = /src="([^"]*\.(?:jpg|jpeg|png|webp)[^"]*)"/gi;
        let im: RegExpExecArray | null;
        while ((im = imgRe.exec(html)) !== null) {
          const src = im[1].startsWith("http") ? im[1] : `https://adminapi.nepalipaisa.com/assets/uploads/${im[1]}`;
          if (!images.includes(src)) images.push(src);
        }
        parts.push(stripTags(decodeHtml(html)));
      }
    }
    content = parts.join("\n\n").slice(0, 3000);
  }

  let time = new Date().toISOString();
  try { if (r.publishedOn && r.publishedOn !== "0001-01-01T00:00:00") time = new Date(r.publishedOn + "+05:45").toISOString(); } catch {}

  return { title, content, images: images.slice(0, 5), time };
}

/* ── 5. ArthaSansar ────────────────────────────────────────────── */
async function fetchArthaSansarArticle(id: string): Promise<ArticleResult> {
  const res = await timeoutFetch(`https://arthasansar.com/news/${id}`);
  if (!res.ok) throw new Error("Failed to fetch article");
  const html = await res.text();

  // Title
  const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title>([\s\S]*?)<\/title>/i);
  let title = titleMatch ? decodeHtml(titleMatch[1]) : "";
  title = title.replace(/[-|]\s*(?:ArthaSansar|अर्थ संसार).*$/i, "").trim();

  // Content from news-desc div or <p> tags
  const bodyMatch = html.match(/<div[^>]*class="[^"]*news-desc[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
    || html.match(/<div[^>]*class="[^"]*news-content-area[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

  let content = "";
  const images: string[] = [];

  if (bodyMatch) {
    const imgRe = /src="([^"]*uploads\/media\/[^"]+)"/gi;
    let im: RegExpExecArray | null;
    while ((im = imgRe.exec(bodyMatch[1])) !== null) {
      if (!im[1].includes("512x512") && !im[1].endsWith(".gif")) {
        const src = im[1].startsWith("http") ? im[1] : `https://arthasansar.com${im[1]}`;
        if (!images.includes(src)) images.push(src);
      }
    }
    content = stripTags(decodeHtml(bodyMatch[1])).slice(0, 3000);
  }

  // Fallback: get content from <p> tags
  if (!content) {
    const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    const paragraphs: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = pRe.exec(html)) !== null) {
      const t = stripTags(decodeHtml(m[1]));
      if (t.length > 30 && !t.includes("अर्थ संसारमा प्रकाशित")) paragraphs.push(t);
    }
    content = paragraphs.join("\n\n").slice(0, 3000);
  }

  // Find article-specific image (first upload that's not an ad)
  if (images.length === 0) {
    const imgRe = /src="([^"]*uploads\/media\/[^"]+)"/gi;
    let im: RegExpExecArray | null;
    while ((im = imgRe.exec(html)) !== null) {
      if (!im[1].includes("512x512") && !im[1].endsWith(".gif") && !im[1].includes("android-chrome")) {
        const src = im[1].startsWith("http") ? im[1] : `https://arthasansar.com${im[1]}`;
        if (!images.includes(src)) images.push(src);
      }
    }
  }

  // Date from page
  const dateMatch = html.match(/(\d{4})-(\d{2})-(\d{2})/);
  let time = new Date().toISOString();
  try { if (dateMatch) time = new Date(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}T12:00:00+05:45`).toISOString(); } catch {}

  return { title, content, images: images.slice(0, 5), time };
}

/* ── Main ───────────────────────────────────────────────────────── */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id") || "";
    const source = searchParams.get("source") || "";

    if (!id) return NextResponse.json({ error: "Missing article id" }, { status: 400 });

    let article: ArticleResult;
    switch (source) {
      case "ml": article = await fetchMeroLaganiArticle(id); break;
      case "ss": article = await fetchShareSansarArticle(id); break;
      case "ck": article = await fetchCorporateKhabarArticle(id); break;
      case "np": article = await fetchNepaliPaisaArticle(id); break;
      case "as": article = await fetchArthaSansarArticle(id); break;
      default: return NextResponse.json({ error: "Invalid source" }, { status: 400 });
    }

    return NextResponse.json(article);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, title: "", content: "", images: [], time: "" }, { status: 502 });
  }
}
