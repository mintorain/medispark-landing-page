const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { URL } = require("url");

const rootDir = __dirname;
const dataDir = path.join(rootDir, "data");
const leadsFile = path.join(dataDir, "leads.ndjson");
const googleScriptUrlFile = path.join(rootDir, "google-script-url.txt");
const port = process.env.PORT || 4173;
const googleScriptUrl =
  process.env.GOOGLE_SCRIPT_URL ||
  (fs.existsSync(googleScriptUrlFile) ? fs.readFileSync(googleScriptUrlFile, "utf8").trim() : "");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
};

function getBaseUrl(req) {
  return `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}`;
}

function buildRobotsTxt(req) {
  const baseUrl = getBaseUrl(req);
  return `User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml\n`;
}

function buildSitemapXml(req) {
  const baseUrl = getBaseUrl(req);
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${baseUrl}/</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n</urlset>\n`;
}

function buildRssXml(req) {
  const baseUrl = getBaseUrl(req);
  const now = new Date().toUTCString();
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n  <channel>\n    <title>브레인시티 메디스파크 로제비앙 모아엘가</title>\n    <link>${baseUrl}/</link>\n    <description>브레인시티 메디스파크 로제비앙 모아엘가 분양 안내</description>\n    <lastBuildDate>${now}</lastBuildDate>\n    <item>\n      <title>브레인시티 메디스파크 로제비앙 모아엘가 분양 안내</title>\n      <link>${baseUrl}/</link>\n      <description>공원, 학교, 실거주형 평면을 갖춘 1,215세대 대단지 분양 안내 페이지</description>\n      <pubDate>${now}</pubDate>\n      <guid>${baseUrl}/</guid>\n    </item>\n  </channel>\n</rss>\n`;
}

async function ensureDataDir() {
  await fsp.mkdir(dataDir, { recursive: true });
}

async function appendLead(lead) {
  await ensureDataDir();
  const line = JSON.stringify(lead) + "\n";
  await fsp.appendFile(leadsFile, line, "utf8");
}

async function forwardLeadToGoogleScript(lead) {
  if (!googleScriptUrl) {
    return { forwarded: false, reason: "GOOGLE_SCRIPT_URL is not configured." };
  }

  const response = await fetch(googleScriptUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(lead),
  });

  const text = await response.text();
  return {
    forwarded: response.ok,
    status: response.status,
    responseText: text,
  };
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function sanitizePathname(urlPathname) {
  if (urlPathname === "/") {
    return path.join(rootDir, "public", "index.html");
  }

  const decoded = decodeURIComponent(urlPathname);
  const safePath = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  return path.join(rootDir, "public", safePath);
}

async function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });

    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function validateLead(payload) {
  const normalizedPhone = String(payload.phone || "").replace(/[^\d]/g, "");
  const errors = [];

  if (!payload.name || !String(payload.name).trim()) {
    errors.push("이름을 입력해주세요.");
  }

  if (!/^01[0-9]\d{7,8}$/.test(normalizedPhone)) {
    errors.push("연락처를 정확히 입력해주세요.");
  }

  if (!payload.type || !String(payload.type).trim()) {
    errors.push("관심 타입을 선택해주세요.");
  }

  if (!payload.consent) {
    errors.push("개인정보 수집 및 이용 동의가 필요합니다.");
  }

  return {
    ok: errors.length === 0,
    errors,
    normalized: {
      ...payload,
      phone: normalizedPhone,
    },
  };
}

async function handleLeadRequest(req, res) {
  try {
    const rawBody = await readRequestBody(req);
    const payload = rawBody ? JSON.parse(rawBody) : {};
    const { ok, errors, normalized } = validateLead(payload);

    if (!ok) {
      return sendJson(res, 400, { ok: false, errors });
    }

    const lead = {
      name: String(normalized.name).trim(),
      phone: normalized.phone,
      lead_kind: String(normalized.lead_kind || "inquiry").trim(),
      type: String(normalized.type).trim(),
      time: String(normalized.time || "").trim(),
      message: String(normalized.message || "").trim(),
      utm_source: String(normalized.utm_source || "").trim(),
      utm_medium: String(normalized.utm_medium || "").trim(),
      utm_campaign: String(normalized.utm_campaign || "").trim(),
      utm_content: String(normalized.utm_content || "").trim(),
      utm_term: String(normalized.utm_term || "").trim(),
      landing_path: String(normalized.landing_path || "").trim(),
      submittedAt: new Date().toISOString(),
      ip: req.socket.remoteAddress || "",
      userAgent: req.headers["user-agent"] || "",
    };

    await appendLead(lead);
    const forwarding = await forwardLeadToGoogleScript(lead);
    return sendJson(res, 200, {
      ok: true,
      message: "상담 신청이 정상적으로 접수되었습니다.",
      forwardedToGoogleSheets: Boolean(forwarding.forwarded),
    });
  } catch (error) {
    return sendJson(res, 500, {
      ok: false,
      errors: ["상담 접수 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."],
      detail: error.message,
    });
  }
}

function serveStaticFile(filePath, res) {
  const normalizedRoot = path.resolve(rootDir);
  const normalizedPath = path.resolve(filePath);

  if (!normalizedPath.startsWith(normalizedRoot)) {
    sendJson(res, 403, { ok: false, errors: ["접근이 허용되지 않습니다."] });
    return;
  }

  fs.stat(normalizedPath, (error, stats) => {
    if (error || !stats.isFile()) {
      sendJson(res, 404, { ok: false, errors: ["페이지를 찾을 수 없습니다."] });
      return;
    }

    const ext = path.extname(normalizedPath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": contentTypes[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=86400",
    });

    fs.createReadStream(normalizedPath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "POST" && parsedUrl.pathname === "/api/leads") {
    return handleLeadRequest(req, res);
  }

  if (req.method === "GET") {
    if (parsedUrl.pathname === "/robots.txt") {
      res.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      });
      res.end(buildRobotsTxt(req));
      return;
    }

    if (parsedUrl.pathname === "/sitemap.xml") {
      res.writeHead(200, {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "no-cache",
      });
      res.end(buildSitemapXml(req));
      return;
    }

    if (parsedUrl.pathname === "/rss.xml") {
      res.writeHead(200, {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "no-cache",
      });
      res.end(buildRssXml(req));
      return;
    }

    const filePath = sanitizePathname(parsedUrl.pathname);
    return serveStaticFile(filePath, res);
  }

  sendJson(res, 405, { ok: false, errors: ["허용되지 않는 메서드입니다."] });
});

server.listen(port, async () => {
  await ensureDataDir();
  console.log(`Landing page server running at http://127.0.0.1:${port}`);
});
