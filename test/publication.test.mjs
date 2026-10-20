// SPDX-License-Identifier: AGPL-3.0-only
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { publicationFiles, createSourceArchive } from "../scripts/publication.mjs";

async function fixture(t, files) {
  const root = await mkdtemp(join(tmpdir(), "office-publication-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "publication-files.json"), JSON.stringify(files));
  return root;
}

test("source archive excludes unlisted host secrets, fixtures and Git history", async t => {
  const root = await fixture(t, ["publication-files.json", "src/public.js"]);
  await mkdir(join(root, "src"));
  await mkdir(join(root, ".git"));
  await writeFile(join(root, "src/public.js"), "export const publicApi = true;");
  await writeFile(join(root, "src/private.js"), "PRIVATE_HOST_CODE");
  await writeFile(join(root, ".env"), "PRIVATE_TOKEN");
  await writeFile(join(root, ".git/config"), "PRIVATE_REMOTE");
  await writeFile(join(root, "customer.doc"), "PRIVATE_DOCUMENT");
  const archive = join(root, "source.tar.gz");
  await createSourceArchive(root, archive);
  const entries = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" }).trim().split("\n").sort();
  assert.deepEqual(entries, ["publication-files.json", "src/public.js"]);
});

test("publication rejects traversal and private paths even if explicitly listed", async t => {
  for (const path of ["../host.js", "/host.js", ".git/config", ".env", ".env.production", "test/client.docx", ".cache/engine"]) {
    const root = await fixture(t, [path]);
    await assert.rejects(publicationFiles(root), /Unsafe publication path/);
  }
});

test("publication rejects symlink files and symlink parent directories", async t => {
  const root = await fixture(t, ["linked.js"]);
  await writeFile(join(root, "private.js"), "PRIVATE");
  await symlink(join(root, "private.js"), join(root, "linked.js"));
  await assert.rejects(publicationFiles(root), /without symlinks/);
  await symlink(root, join(root, "linked-directory"));
  await writeFile(join(root, "publication-files.json"), JSON.stringify(["linked-directory/private.js"]));
  await assert.rejects(publicationFiles(root), /without symlinks/);
});

test("real publication includes legal evidence with the original upstream checksum", async () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const files = await publicationFiles(root);
  for (const name of ["LICENSE", "NOTICE", "LICENSE-EVIDENCE.md", "UPSTREAM-SOURCES.md", "legal/cryptpad-REUSE.toml"]) {
    assert.ok(files.includes(name), `${name} must ship with source`);
  }
  const evidence = await readFile(join(root, "legal/cryptpad-REUSE.toml"));
  assert.equal(createHash("sha256").update(evidence).digest("hex"),
    "bfedbb5fc45dfec777f8cbdda934e058dd48df2fdbba180a5cea4ec094c287d2");
});
