import http from "http";
http.get("http://localhost:3000/api/news", (res) => {
  const chunks = [];
  res.on("data", (c) => chunks.push(c));
  res.on("end", () => {
    const data = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
    console.log("Total:", data.news.length);
    console.log("---");
    data.news.slice(0, 8).forEach((n, i) => {
      console.log(`${i + 1}. [${n.category}] ${n.title.substring(0, 60)}`);
      console.log(`   Image: ${n.image ? "YES (" + n.image.substring(0, 60) + "...)" : "NO"}`);
    });
  });
});
