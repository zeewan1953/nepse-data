const https = require("https");
const qs = require("querystring");

async function fetch(method, url, data) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname, path: u.pathname + u.search,
      method, headers: { "User-Agent": "Mozilla/5.0" },
    };
    if (data) {
      opts.headers["Content-Type"] = "application/x-www-form-urlencoded";
      opts.headers["Content-Length"] = Buffer.byteLength(data);
    }
    const req = https.request(opts, (r) => {
      let body = "";
      r.on("data", (c) => (body += c));
      r.on("end", () => resolve({ status: r.statusCode, data: body }));
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  const url = "https://eng.merolagani.com/CompanyDetail.aspx?symbol=NABIL";
  const r1 = await fetch("GET", url);
  const html = r1.data;

  const vs = html.match(/id="__VIEWSTATE" value="([^"]+)"/)?.[1] || "";
  const ev = html.match(/id="__EVENTVALIDATION" value="([^"]+)"/)?.[1] || "";
  const vsg = html.match(/id="__VIEWSTATEGENERATOR" value="([^"]+)"/)?.[1] || "";

  console.log("VIEWSTATE:", vs.length);

  // POST clicking the hidden btnQuaterlyTab + setting active tab
  const form = {
    __VIEWSTATE: vs,
    __VIEWSTATEGENERATOR: vsg,
    __EVENTVALIDATION: ev,
    "ctl00$ContentPlaceHolder1$CompanyDetail1$btnQuaterlyTab": "",
    "ctl00$ContentPlaceHolder1$CompanyDetail1$hdnActiveTabID": "divQuaterly",
  };

  const body = qs.stringify(form);
  const r2 = await fetch("POST", url, body);
  const html2 = r2.data;
  console.log("Response:", html2.length, "chars");

  // Check if it's an ASP.NET AJAX UpdatePanel response
  if (html2.includes("updatePanel")) {
    const pipes = html2.split("|");
    for (let i = 0; i < pipes.length; i++) {
      if (pipes[i] === "updatePanel") {
        const panelId = pipes[i + 1];
        const contentLen = parseInt(pipes[i + 2], 10);
        const content = pipes[i + 3]?.substring(0, contentLen) || "";
        console.log("\nUpdatePanel", panelId, "length:", contentLen);
        
        // Find any table in this content
        const table = content.match(/<table[\s\S]{0,200}?>([\s\S]{0,10000})<\/table>/);
        if (table) {
          console.log("Table found:", table[0].substring(0, 3000));
          const text = table[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
          console.log("\nPlain text:", text);
        } else {
          console.log("No table in panel, content:", content.substring(0, 500));
        }
      }
    }
  } else {
    // Full page response
    const qIdx = html2.indexOf('id="divQuaterly"');
    if (qIdx >= 0) {
      const section = html2.substring(qIdx, qIdx + 5000);
      console.log("\ndivQuaterly section:", section);
    } else {
      console.log("No divQuaterly in response");
      const qi = html2.indexOf("Quarterly");
      if (qi >= 0) console.log("Quarterly ref at", qi, ":", html2.substring(qi, qi + 300));
    }
  }
}

main().catch(console.error);
