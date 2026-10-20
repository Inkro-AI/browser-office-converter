# Sources for the precompiled engine

The authoritative source is the complete CryptPad archive pinned in
[engine.lock.json](engine.lock.json), including `core/`, `Dockerfile`,
`embuild.sh`, `pre-js.js`, `wrap-main.cpp` and upstream patches.
`npm run release` verifies and copies this archive without modifying it.

The source is available at:

- [Exact source tree](https://github.com/cryptpad/onlyoffice-x2t-wasm/tree/79bb259bb97519be1c350bf8674aaed53335bf4f)
- [Exact source archive](https://codeload.github.com/cryptpad/onlyoffice-x2t-wasm/tar.gz/79bb259bb97519be1c350bf8674aaed53335bf4f)
- [Upstream Dockerfile](https://github.com/cryptpad/onlyoffice-x2t-wasm/blob/79bb259bb97519be1c350bf8674aaed53335bf4f/Dockerfile)

For recipients who want to rebuild the engine, the **upstream** command is
`docker build --target output --output build .` in the extracted source.
Our normal build/release commands only package the existing binary.

## Dependencies fetched by the upstream recipe

The archive contains core sources, patches and instructions that fetch the
following additional sources. These are upstream source locations, not a new
build system maintained by this wrapper:

| Component | Source selected by the upstream recipe |
| --- | --- |
| ONLYOFFICE build tools | [v8.3.0.91](https://github.com/ONLYOFFICE/build_tools/tree/v8.3.0.91) |
| Emscripten SDK and runtime | [emsdk 4.0.11](https://github.com/emscripten-core/emsdk/tree/4.0.11), [Emscripten 4.0.11](https://github.com/emscripten-core/emscripten/tree/4.0.11) |
| Boost, including its submodules | [boost-1.84.0](https://github.com/boostorg/boost/tree/boost-1.84.0) |
| OpenSSL | [OpenSSL_1_1_1f](https://github.com/openssl/openssl/tree/OpenSSL_1_1_1f) |
| Gumbo | [aa91b2](https://github.com/google/gumbo-parser/tree/aa91b2) |
| Katana | [be6df458d4540eee375c513958dcb862a391cdd1](https://github.com/jasenhuang/katana-parser/tree/be6df458d4540eee375c513958dcb862a391cdd1) |
| HarfBuzz | [894a1f72ee93a1fd8dc1d9218cb3fd8f048be29a](https://github.com/harfbuzz/harfbuzz/tree/894a1f72ee93a1fd8dc1d9218cb3fd8f048be29a), patched by the archived `core/Common/3dParty/harfbuzz/make.py` |
| Hyphen | [hunspell/hyphen](https://github.com/hunspell/hyphen), fetched by [the upstream build-tools script](https://github.com/ONLYOFFICE/build_tools/blob/v8.3.0.91/scripts/core_common/modules/hyphen.py) without a revision pin |
| GLM | [33b4a621a697a305bc3a7610d290677b96beb181](https://github.com/g-truc/glm/tree/33b4a621a697a305bc3a7610d290677b96beb181) |
| MDDS | [0783158939c6ce4b0b1b89e345ab983ccb0f0ad0](https://github.com/kohei-us/mdds/tree/0783158939c6ce4b0b1b89e345ab983ccb0f0ad0) |
| librevenge | [becd044b519ab83893ad6398e3cbb499a7f0aaf4](https://github.com/Distrotech/librevenge/tree/becd044b519ab83893ad6398e3cbb499a7f0aaf4) |
| libodfgen | [8ef8c171ebe3c5daebdce80ee422cf7bb96aa3bc](https://github.com/Distrotech/libodfgen/tree/8ef8c171ebe3c5daebdce80ee422cf7bb96aa3bc) |
| libetonyek | [cb396b4a9453a457469b62a740d8fb933c9442c3](https://github.com/LibreOffice/libetonyek/tree/cb396b4a9453a457469b62a740d8fb933c9442c3) |

Apple import dependencies and their modifications are specified in the archived
`core/Common/3dParty/apple/fetch.py`. Emscripten's `USE_ICU` port is requested by
`embuild.sh`; its [4.0.11 port recipe](https://github.com/emscripten-core/emscripten/blob/4.0.11/tools/ports/icu.py)
identifies and checksums that source. Compiler, operating-system packages and
other standard toolchain dependencies are described by the upstream Dockerfile.

## Limits of the available provenance

The release archive, its extracted JavaScript/WASM and the published source
archive are checksum-pinned. This is **not** a claim of a reproducible build or
an independently verified inventory of every object linked into the upstream
binary. In particular, the published Hyphen fetch is unpinned and the upstream
build did not provide a complete dependency attestation. We do not invent a
Hyphen revision or substitute one from the abandoned local-build experiment.

Retain these upstream source/build references and the archived sources with
the binary. Further source clarification, if required, must come from the
upstream publisher. The separate helper-license question is recorded in
[LICENSE-EVIDENCE.md](LICENSE-EVIDENCE.md).
