// SPDX-License-Identifier: AGPL-3.0-only
// Packages existing WASM and source archives; never compiles an engine or publishes.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile, copyFile, access } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { legalFiles, publicationFiles } from "./publication.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const lock = JSON.parse(await readFile(resolve(root, "engine.lock.json"), "utf8"));
if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(pkg.version)) throw new Error("Invalid release version");
const output = resolve(root, "release", pkg.version);
await mkdir(output, { recursive: true });
execFileSync(process.execPath, [resolve(root, "scripts/build.mjs")], { stdio: "inherit" });
const files = await publicationFiles(root);
const dist = resolve(root, "dist");
const config = await readFile(resolve(dist, "engine-config.js"), "utf8");
const engine = JSON.parse(config.match(/^self\.OFFICE_ENGINE = (.+);\n$/)[1]);
const sourceName = `browser-office-converter-${pkg.version}-source.tar.gz`;
const staticName = `browser-office-converter-${pkg.version}-static.tar.gz`;
const engineSourceName = `cryptpad-x2t-${lock.commit}-source.tar.gz`;
await copyFile(resolve(dist, "converter-source.tar.gz"), resolve(output, sourceName));
const staticFiles = [
  ...files.filter(file => file.startsWith("src/")).map(file => file.slice(4)),
  ...legalFiles, "sources.html", "engine-config.js", "converter-source.tar.gz",
  engine.js, engine.wasm,
];
execFileSync("tar", ["-czf", resolve(output, staticName), "-C", dist, ...staticFiles], {
  env: { ...process.env, COPYFILE_DISABLE: "1" },
});

const sourceCache = resolve(root, ".cache", `source-${lock.sourceArchiveSha256}.tar.gz`);
try { await access(sourceCache); } catch {
  console.log("Downloading the pinned upstream source archive (no compilation)…");
  const response = await fetch(lock.sourceArchive, { signal: AbortSignal.timeout(300_000) });
  if (!response.ok) throw new Error(`Source download failed (${response.status})`);
  const { Readable } = await import("node:stream");
  const { pipeline } = await import("node:stream/promises");
  const { createWriteStream } = await import("node:fs");
  await pipeline(Readable.fromWeb(response.body), createWriteStream(sourceCache));
}
async function digest(file) {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest("hex");
}
if (await digest(sourceCache) !== lock.sourceArchiveSha256) {
  throw new Error(`Upstream source SHA-256 mismatch; remove the invalid cache file ${sourceCache} and retry`);
}
await copyFile(sourceCache, resolve(output, engineSourceName));
const manifest = {
  project: pkg.name, version: pkg.version,
  engine: { release: lock.release, commit: lock.commit, source: lock.sourceArchive },
  licenseEvidence: "LICENSE-EVIDENCE.md",
  artifacts: [],
};
for (const name of [sourceName, staticName, engineSourceName]) {
  manifest.artifacts.push({ name, sha256: await digest(resolve(output, name)) });
}
await writeFile(resolve(output, "release.json"), JSON.stringify(manifest, null, 2) + "\n");
await writeFile(resolve(output, "SHA256SUMS"), [
  ...manifest.artifacts.map(file => `${file.sha256}  ${file.name}`),
  `${await digest(resolve(output, "release.json"))}  release.json`,
].join("\n") + "\n");
console.log(`Release prepared locally: ${output}\nNo repository, host code or document fixtures were published.`);
