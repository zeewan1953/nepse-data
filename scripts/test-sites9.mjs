async function test() {
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
  const c = new AbortController(); setTimeout(() => c.abort(), 8000);
  const res = await fetch("https://nepalipaisa.com/js/site/news.js?v=rCI9sUV7zSY_HIn7vBSCLjoYs2qTbU6d4qH5ci8aKvE", { headers: { "User-Agent": UA }, signal: c.signal });
  const txt = await res.text();
  console.log("news.js length:", txt.length);
  console.log("Full content:");
  console.log(txt);
}
test();
