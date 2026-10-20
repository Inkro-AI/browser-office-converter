# Browser Office Converter

An independent, browser-only converter for DOC → DOCX, XLS → XLSX and PPT → PPTX.
It uses the unmodified ONLYOFFICE x2t WASM release published by CryptPad.
Documents stay in memory on the user's device. There is no conversion backend,
upload endpoint, analytics, editor SDK or dependency on a host application's UI.

This directory is a complete standalone project. It can be copied into its own
repository and built without the parent repository. The license applies to this
project; it does not purport to determine the license of every application that
communicates with it. Publishing/deploying a particular host integration still
requires assessment of its actual relationship to this AGPL component.
It can also remain at its current path as an independent Git submodule; see
[PUBLISHING.md](PUBLISHING.md). The engine is CryptPad's precompiled release;
there is no custom WASM build or Docker requirement in this project.
[LICENSE-EVIDENCE.md](LICENSE-EVIDENCE.md) records CryptPad's explicit AGPL
classification of its distributed x2t, preserves the original REUSE registry,
and describes the remaining upstream helper-file licensing question.

## Build and run

Requirements: Node.js 22+, `tar` (Linux/macOS), and network access for the first
build. There are no npm runtime or build dependencies.

```sh
npm run build
npm run dev
```

Open `http://localhost:5175`. The dev command only serves static files.
`npm test` tests the protocol, limits and worker lifecycle without downloading
the engine. To run a real engine conversion against your own local fixtures:

```sh
npm run test:engine -- /path/to/sample.doc /path/to/sample.xls /path/to/sample.ppt
```

The build downloads a checksum-pinned release ZIP into ignored `.cache/`,
verifies both extracted assets and emits `dist/`. It also emits a source archive
containing this project's complete wrapper, build scripts, tests and notices.
Only the exact files in [publication-files.json](publication-files.json) enter
the source archive. Symlinks, parent paths, caches and document fixtures are
rejected. Unlisted files are excluded even when placed in `src/` or `test/`.
This project does not import or package the parent application's code.

To rebuild x2t itself, obtain the exact source revision in `engine.lock.json`
and run `docker build --target output --output build .` in that source checkout.
The upstream Dockerfile specifies its Emscripten toolchain and native libraries.
[UPSTREAM-SOURCES.md](UPSTREAM-SOURCES.md) maps its additional source downloads
and records the limits of the available build provenance. The prebuilt engine
used here is pinned to an upstream release and matching source commit;
bit-for-bit reproduction has not been independently established.

To prepare a public release without compiling or publishing anything:

```sh
npm test
npm run release
```

`release/0.1.0/` contains the standalone source archive, static deployment
archive, checksum-verified upstream source archive, `release.json` and
`SHA256SUMS`. The upstream source download is about 245 MiB, cached locally,
and is never loaded when opening a document. See [PUBLISHING.md](PUBLISHING.md)
for the review, independent Git repository and release-upload steps.
The package's `private: true` prevents accidental npm publication; it does not
change the AGPL license or prevent publishing this project on GitHub.

## Static deployment and embedding

Deploy `dist/` on existing static hosting, either at a path or a dedicated origin.
No Node/Docker runtime is needed in production. [PROTOCOL.md](PROTOCOL.md)
describes the generic iframe interface. A host receives OOXML bytes and may use
any renderer it chooses. The protocol passes no host credentials, database
access or original storage URLs. The wrapper does not read host state.
A separate origin provides browser isolation; a same-origin deployment is
trusted code and must not be described as a security boundary.

WASM is loaded **only when `convert` is requested**, in a disposable worker.
Opening the standalone page or completing an iframe handshake does not load it.
The compressed engine has a content-hashed filename. Serve `assets/*` with
`Cache-Control: public, max-age=31536000, immutable`; serve the small shell,
worker and engine config with revalidation (`no-cache`).

The pinned 8.3.0+0 engine transfers about 13.9 MB (65.6 MB decompressed).
It passed six DOC/XLS/PPT compatibility fixtures. 9.3.2+3 was evaluated but
throws a native `vector` exception on the LibreOffice DOC fixture; test that
regression when upgrading. This pin should be reviewed as upstream releases
and security fixes become available.

The `.wasm-gzip.bin` asset is a gzip file decoded explicitly via `DecompressionStream`
in the browser. Serve it as `application/octet-stream`, **without
`Content-Encoding: gzip`**. No Brotli/gzip server module or special WASM MIME
mapping is required. The modern browser must support WebAssembly, workers and
gzip DecompressionStream; otherwise the caller receives an error.
The `.bin` suffix prevents static servers such as Vite from treating the file
as an HTTP-precompressed response.

Recommended HTTP response headers, including for worker scripts:

```text
Content-Security-Policy: default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
```

You can restrict embedding with an HTTP `frame-ancestors` directive to your
allowed host origins. Do not set `X-Frame-Options: DENY` or a conflicting global
policy if embedding is desired.

## Source and license

Wrapper: GNU AGPL version 3 only. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
Engine: ONLYOFFICE x2t, with CryptPad's WebAssembly adaptations, AGPLv3 and
applicable upstream additional terms and third-party notices. No license fee
is required when the applicable license conditions are met.

`sources.html` exposes this wrapper's corresponding source archive and links to
the exact engine source archive and its notices. Keep equivalent source access
available with every deployed binary version. The source archive may be mirrored
on your own static storage; do not substitute unrelated or latest engine sources.
Publish the pinned engine source saved by `npm run release` as a release asset
for long-term availability, along with the source/build references.

When embedding, make the license/source information accessible to users through
your application's legal notices. Merely hiding this component in an iframe or
putting it in a separate repository is not a determination of AGPL compliance.
No source code, binary or document is automatically published by the build.

## Scope

This converts file formats; the host renderer still determines page layout.
Conversion is read-only and does not execute document macros. The wrapper
provides no password input or remote-resource API. No font files are bundled.
Compatibility and rendering fidelity depend on the source document.

Limits: 50 MiB input/output, one conversion per worker, 120-second operation
timeout. These are guards, not a promise that every file below the size limit
fits in a device's available memory. Host applications should retain download
and failure handling and validate OOXML expansion limits before rendering.
