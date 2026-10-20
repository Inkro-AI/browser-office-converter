# Publish only Browser Office Converter

This folder is a standalone project. It can be a public Git repository at its
existing path inside a private host repository, with **its own new history**.
Do not change the host repository's remote, publish its branch or copy its
`.git` directory here.

## Prepare and review

Run inside `opensource/browser-office-converter`:

```sh
npm test
npm run release
tar -tzf release/0.1.0/browser-office-converter-0.1.0-source.tar.gz
```

The release command packages the existing CryptPad engine; it does not compile
WASM, start Docker, contact a Git host to publish anything, or upload documents.
It downloads and verifies the matching upstream source archive on first use.

Review [publication-files.json](publication-files.json), the source archive and
[LICENSE-EVIDENCE.md](LICENSE-EVIDENCE.md). Packaging uses exact file names and
rejects symlinks; no host files, Git history, credentials, local fixtures,
`.cache/`, `dist/` or `release/` are included in the wrapper source archive.
Git still requires its own staging review; the packaging allowlist cannot
prevent a person from manually staging unrelated files.

The `release/0.1.0/` directory contains:

| File | Use |
| --- | --- |
| `browser-office-converter-0.1.0-source.tar.gz` | Complete standalone wrapper source, tests, CI, legal evidence and packaging instructions |
| `browser-office-converter-0.1.0-static.tar.gz` | Static hosting files, prebuilt engine, notices and wrapper source download |
| `cryptpad-x2t-79bb259bb97519be1c350bf8674aaed53335bf4f-source.tar.gz` | Original, checksum-verified upstream source archive |
| `release.json` | Version, upstream identity and archive hashes |
| `SHA256SUMS` | Checksums of the release archives and manifest |

The engine source archive includes upstream core, helpers and build recipes.
Additional dependency sources and the limits of upstream provenance are listed
in [UPSTREAM-SOURCES.md](UPSTREAM-SOURCES.md); this is not a claim of a new
independently reproduced engine build.

## Create the independent repository in this folder

Create an empty public GitHub repository named `browser-office-converter`
without generated files. Replace `YOUR_ACCOUNT` below with its actual owner.
Run the following **inside this converter folder**, never in the host root:

```sh
git init -b main
node --input-type=module -e '
import { publicationFiles } from "./scripts/publication.mjs";
import { execFileSync } from "node:child_process";
execFileSync("git", ["add", "--", ...await publicationFiles(process.cwd())], { stdio: "inherit" });
'
git status --short
git diff --cached --stat
git diff --cached
git commit -m "Initial standalone browser Office converter"
git remote add origin https://github.com/YOUR_ACCOUNT/browser-office-converter.git
git push -u origin main
```

Only reviewed, allowlisted source files are staged by the command. Neither
large binary/source downloads nor private host history are imported. No Git
repository or remote is created automatically by `npm run release`.

Then, **from the private host repository root**, register this checkout:

```sh
git submodule add https://github.com/YOUR_ACCOUNT/browser-office-converter.git \
  opensource/browser-office-converter
git add .gitmodules opensource/browser-office-converter
```

If the converter's individual files were already committed in the host, first
remove only their host index entries (keeping the files on disk):

```sh
git rm -r --cached -- opensource/browser-office-converter
```

Then register the submodule. The host tracks only the converter's public URL
and commit. Do not add the folder to the host's `.gitignore`.
Commit and push later converter changes there first, then update the private
host's submodule pointer. New clones use `git clone --recurse-submodules`;
existing clones use `git submodule update --init --recursive`.
Build services must fetch submodules before preparing the frontend.

## Publish the release and deploy

In the public converter repository, create release `v0.1.0` from the reviewed
source commit and attach **all five files** from `release/0.1.0/`.
The GitHub-generated source ZIP alone does not archive the engine's source.
Keep old source assets available for as long as the matching binaries are served.

Extract the `-static.tar.gz` archive onto static hosting. Source and hosting
are separate: an existing `/office-converter/` path or a dedicated origin both
work. A separate Cloudflare Pages project is not a license requirement.
No conversion server is needed. Do not copy the 245 MiB upstream source archive
into a Cloudflare Pages deployment; publish that as a GitHub release asset or
on storage that supports large files. It is not a runtime download.

The deployed `sources.html` already links the local wrapper source, original
fixed upstream archive, source/build references, licenses and evidence record.
Keep those links accessible through the host's existing legal notices. If an
upstream download becomes unavailable, replace its source link with the saved
identical release asset and keep the checksum.
Cache and HTTP requirements are in [README.md](README.md).

## License boundary and outstanding upstream record

The public project includes only the independently usable converter. The host
exchanges file bytes over the documented protocol without importing converter
source, and its own source is not published or relicensed by these steps.
An iframe, separate repository or separate domain is not by itself a legal
determination of the AGPL boundary.

[LICENSE-EVIDENCE.md](LICENSE-EVIDENCE.md) preserves the positive AGPL evidence
and the still-open helper-file question in CryptPad issue #18. Publication does
not settle that question. Preserve the original notices and source references;
do not describe them as permission to remove upstream licensing conditions.
