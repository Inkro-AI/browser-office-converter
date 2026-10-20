// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, copyFile, readdir, unlink } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync, inflateRawSync } from "node:zlib";
import { legalFiles, publicationFiles, createSourceArchive } from "./publication.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(process.argv[2] || resolve(root, "dist"));
if (output === root || output.startsWith(resolve(root, "src"))) throw new Error("Choose a separate output directory");
const lock = JSON.parse(await readFile(resolve(root, "engine.lock.json"), "utf8"));
const publicFiles = await publicationFiles(root);
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const cache = resolve(root, ".cache", `${lock.sha256}.zip`);
await mkdir(dirname(cache), { recursive: true });
let archive;
try { archive = await readFile(cache); } catch {
  console.log(`Downloading pinned CryptPad x2t release ${lock.release}…`);
  const response = await fetch(lock.archive, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Engine download failed (${response.status})`);
  archive = Buffer.from(await response.arrayBuffer());
}
if (digest(archive) !== lock.sha256) throw new Error("Engine archive SHA-256 mismatch");
await writeFile(cache, archive);

// Read only the two expected entries from the checksum-verified release ZIP.
function extract(name) {
  let end = archive.length - 22;
  while (end >= Math.max(0, archive.length - 65557) && archive.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error("Invalid engine ZIP");
  let offset = archive.readUInt32LE(end + 16);
  for (let i = 0; i < archive.readUInt16LE(end + 10); i++) {
    if (archive.readUInt32LE(offset) !== 0x02014b50) throw new Error("Invalid central directory");
    const length = archive.readUInt16LE(offset + 28);
    const entry = archive.subarray(offset + 46, offset + 46 + length).toString();
    if (entry === name) {
      const local = archive.readUInt32LE(offset + 42);
      const start = local + 30 + archive.readUInt16LE(local + 26) + archive.readUInt16LE(local + 28);
      const compressed = archive.subarray(start, start + archive.readUInt32LE(offset + 20));
      const method = archive.readUInt16LE(offset + 10);
      const bytes = method === 8 ? inflateRawSync(compressed) : method === 0 ? compressed : null;
      if (!bytes || digest(bytes) !== lock.files[name]) throw new Error(`Checksum mismatch: ${name}`);
      return bytes;
    }
    offset += 46 + length + archive.readUInt16LE(offset + 30) + archive.readUInt16LE(offset + 32);
  }
  throw new Error(`Missing engine asset: ${name}`);
}
const js = extract("x2t.js"), wasm = extract("x2t.wasm");
const engine = {
  js: `assets/x2t-${lock.files["x2t.js"].slice(0, 16)}.js`,
  wasm: `assets/x2t-${lock.files["x2t.wasm"].slice(0, 16)}.wasm-gzip.bin`,
  bytes: wasm.length,
};
await mkdir(resolve(output, "assets"), { recursive: true });
// Remove only obsolete assets produced by this builder, never caller files.
for (const name of await readdir(resolve(output, "assets"))) {
  if (/^x2t-[a-f0-9]{16}\.(js|wasm\.gz|wasm-gzip\.bin)$/.test(name) &&
      ![engine.js, engine.wasm].includes(`assets/${name}`)) {
    await unlink(resolve(output, "assets", name));
  }
}
for (const file of publicFiles.filter(file => file.startsWith("src/"))) {
  const destination = resolve(output, file.slice(4));
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(resolve(root, file), destination);
}
await writeFile(resolve(output, engine.js), js);
const compressed = gzipSync(wasm, { level: 9 });
await writeFile(resolve(output, engine.wasm), compressed);
await writeFile(resolve(output, "engine-config.js"), `self.OFFICE_ENGINE = ${JSON.stringify(engine)};\n`);
for (const name of legalFiles) {
  await mkdir(dirname(resolve(output, name)), { recursive: true });
  await copyFile(resolve(root, name), resolve(output, name));
}
// The archive is intentionally scoped to this standalone project, never its
// parent repository, caches, environment files or customer document fixtures.
await createSourceArchive(root, resolve(output, "converter-source.tar.gz"));
await writeFile(resolve(output, "sources.html"), `<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self'; base-uri 'none'; form-action 'none'">
<title>Browser Office Converter — source</title><link rel="stylesheet" href="./style.css"><main>
<h1>Source code and legal notices</h1>
<p>Browser Office Converter is free software under GNU AGPL version 3, without warranty.
You may redistribute and modify it under the license.</p>
<ul><li><a href="./converter-source.tar.gz">Download complete wrapper source, tests and build scripts</a></li>
<li><a href="./LICENSE">GNU AGPL version 3</a> and <a href="./NOTICE">copyright and additional notices</a></li>
<li><a href="./THIRD_PARTY_NOTICES.txt">Upstream component license collection</a></li>
<li><a href="./LICENSE-EVIDENCE.md">License evidence and outstanding upstream clarification</a></li>
<li><a href="./legal/cryptpad-REUSE.toml">Archived CryptPad license registry</a></li>
<li><a href="${lock.sourceArchive}">Download exact x2t source (${lock.commit})</a></li>
<li><a href="${lock.source}">Browse x2t source and its third-party notices</a></li>
<li><a href="./UPSTREAM-SOURCES.md">Upstream build dependencies and source provenance</a></li>
<li><a href="./engine.lock.json">Engine release and checksums</a></li>
<li><a href="./README.md">Build and deployment instructions</a></li></ul>
<p>Powered by ONLYOFFICE x2t, adapted to WebAssembly by CryptPad. Independent project, not an official ONLYOFFICE product.</p>
<p>Copyright © 2010–2023 Ascensio System SIA and other upstream contributors.
Wrapper and standalone interface © 2026 Browser Office Converter contributors, modified on 20 October 2026.
ONLYOFFICE is a trademark of Ascensio System SIA.</p>
<a href="./index.html">Back to converter</a></main></html>`);
console.log(`Built standalone converter: ${output}\nWASM: ${wasm.length} bytes; gzip transfer: ${compressed.length} bytes`);
