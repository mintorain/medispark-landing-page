import { mkdir, cp, rm, writeFile, access } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.join(__dirname, "dist");
const clientDir = path.join(distDir, "client");
const serverDir = path.join(distDir, "server");
const openaiDir = path.join(distDir, ".openai");

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(clientDir, { recursive: true });
  await mkdir(serverDir, { recursive: true });
  await mkdir(openaiDir, { recursive: true });

  const assetsToCopy = [
    "index.html",
    "styles.css",
    "script.js",
    "google-script-url.txt",
    "image",
  ];

  for (const asset of assetsToCopy) {
    await cp(path.join(__dirname, asset), path.join(clientDir, asset), {
      recursive: true,
    });
  }

  const workerSource = `export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = url.origin;

    if (url.pathname === "/robots.txt") {
      return new Response(\`User-agent: *\\nAllow: /\\nSitemap: \${origin}/sitemap.xml\\n\`, {
        headers: { "content-type": "text/plain; charset=utf-8" }
      });
    }

    if (url.pathname === "/sitemap.xml") {
      const now = new Date().toISOString();
      const body = \`<?xml version="1.0" encoding="UTF-8"?>\\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\\n  <url>\\n    <loc>\${origin}/</loc>\\n    <lastmod>\${now}</lastmod>\\n    <changefreq>daily</changefreq>\\n    <priority>1.0</priority>\\n  </url>\\n</urlset>\\n\`;
      return new Response(body, {
        headers: { "content-type": "application/xml; charset=utf-8" }
      });
    }

    if (url.pathname === "/rss.xml") {
      const now = new Date().toUTCString();
      const body = \`<?xml version="1.0" encoding="UTF-8"?>\\n<rss version="2.0">\\n  <channel>\\n    <title>브레인시티 메디스파크 로제비앙 모아엘가</title>\\n    <link>\${origin}/</link>\\n    <description>브레인시티 메디스파크 로제비앙 모아엘가 분양 안내</description>\\n    <lastBuildDate>\${now}</lastBuildDate>\\n    <item>\\n      <title>브레인시티 메디스파크 로제비앙 모아엘가 분양 안내</title>\\n      <link>\${origin}/</link>\\n      <description>공원, 학교, 실거주형 평면을 갖춘 1,215세대 대단지 분양 안내 페이지</description>\\n      <pubDate>\${now}</pubDate>\\n      <guid>\${origin}/</guid>\\n    </item>\\n  </channel>\\n</rss>\\n\`;
      return new Response(body, {
        headers: { "content-type": "application/rss+xml; charset=utf-8" }
      });
    }

    const assetResponse = await env.ASSETS.fetch(request);

    if (assetResponse.status !== 404) {
      return assetResponse;
    }

    if (!url.pathname.includes(".")) {
      return env.ASSETS.fetch(new Request(new URL("/index.html", request.url), request));
    }

    return assetResponse;
  }
};
`;

  await writeFile(path.join(serverDir, "index.js"), workerSource, "utf8");

  const hostingPath = path.join(__dirname, ".openai", "hosting.json");
  if (await pathExists(hostingPath)) {
    await cp(hostingPath, path.join(openaiDir, "hosting.json"));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
