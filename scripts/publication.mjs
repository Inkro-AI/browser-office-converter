// SPDX-License-Identifier: AGPL-3.0-only
import { lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

export const legalFiles = [
  "LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.txt", "LICENSE-EVIDENCE.md",
  "UPSTREAM-SOURCES.md", "legal/cryptpad-REUSE.toml",
  "engine.lock.json", "publication-files.json", "README.md", "PROTOCOL.md", "PUBLISHING.md",
];

// Exact files, never recursive directories: private fixtures, credentials and
// a containing application's source/history cannot enter via a wildcard.
export async function publicationFiles(root) {
  const files = JSON.parse(await readFile(resolve(root, "publication-files.json"), "utf8"));
  if (!Array.isArray(files) || !files.length || new Set(files).size !== files.length) {
    throw new Error("Invalid publication allowlist");
  }
  for (const file of files) {
    if (typeof file !== "string" || !/^[\w./-]+$/.test(file) ||
        file.split("/").some(part => !part || part === "." || part === ".." || part.startsWith(".env.") ||
          [".git", ".env", ".cache", "node_modules", "dist", "release"].includes(part)) ||
        /\.(docx?|xlsx?|pptx?|pem|key)$/i.test(file)) {
      throw new Error(`Unsafe publication path: ${file}`);
    }
    const parts = file.split("/");
    for (let i = 1; i <= parts.length; i++) {
      const stat = await lstat(resolve(root, ...parts.slice(0, i)));
      if (stat.isSymbolicLink() || (i === parts.length ? !stat.isFile() : !stat.isDirectory())) {
        throw new Error(`Publication path must be a regular file, without symlinks: ${file}`);
      }
    }
  }
  return files;
}

export async function createSourceArchive(root, destination) {
  const files = await publicationFiles(root);
  execFileSync("tar", ["-czf", resolve(destination), "-C", resolve(root), ...files], {
    // macOS extended attributes must not add AppleDouble metadata/files.
    env: { ...process.env, COPYFILE_DISABLE: "1" },
  });
  return files;
}
