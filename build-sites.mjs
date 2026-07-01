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
