# License and provenance record

Reviewed on **2026-10-20**. This record documents the selected upstream release;
it does not grant rights on behalf of upstream authors or settle the scope of
AGPL for every host integration.

## What is distributed

- This project's wrapper, protocol, standalone interface and packaging scripts:
  **AGPL-3.0-only**, under [LICENSE](LICENSE).
- CryptPad's precompiled ONLYOFFICE x2t **v8.3.0+0**, from source revision
  `79bb259bb97519be1c350bf8674aaed53335bf4f`. [engine.lock.json](engine.lock.json)
  identifies the release, exact source archive and SHA-256 hashes.
- The upstream `x2t.js` and decompressed `x2t.wasm` are byte-for-byte unchanged.
  Gzip is only a transport encoding. No locally compiled engine is distributed.
- ONLYOFFICE core is AGPLv3 with upstream section 7 terms. Other components keep
  their own licenses. [NOTICE](NOTICE) preserves the conversion entry point's
  original copyright/additional-terms header; [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt)
  preserves the collected upstream license texts.

## CryptPad's explicit classification of its distributed x2t

CryptPad's own REUSE registry at revision
`4f834ce5e8c21b0428988e361dca5263600c408e` contains:

```toml
[[annotations]]
path = "www/common/onlyoffice/x2t/**"
precedence = "aggregate"
SPDX-FileCopyrightText = "Ascensio System Limited 2010-2022"
SPDX-License-Identifier = "AGPL-3.0-or-later"
```

- [Original registry at the fixed revision](https://github.com/cryptpad/cryptpad/blob/4f834ce5e8c21b0428988e361dca5263600c408e/REUSE.toml)
- [Unmodified local snapshot](legal/cryptpad-REUSE.toml)
- Snapshot SHA-256:
  `bfedbb5fc45dfec777f8cbdda934e058dd48df2fdbba180a5cea4ec094c287d2`

On 2026-10-12, CryptPad removed these entries in
[commit 28fecbb86ac81a1f120dc94f3bab3c54bccccf07](https://github.com/cryptpad/cryptpad/commit/28fecbb86ac81a1f120dc94f3bab3c54bccccf07),
explaining that Office files had moved to other repositories. The commit does
not describe a change of license.

This supports CryptPad's treatment of its distributed x2t as AGPL software.
It does **not** by itself establish that every build helper at our selected
source revision has an explicit license grant. We do not use the registry to
relicense ONLYOFFICE or claim broader permissions than the actual source grants.

## Remaining upstream documentation gap

[CryptPad issue #18](https://github.com/cryptpad/onlyoffice-x2t-wasm/issues/18)
was open when checked on 2026-10-20. It asks for explicit licensing of
Dockerfile, build.sh, embuild.sh, wrap-main.cpp, pre-js.js, test.js and patches.
A contributor [proposed AGPL-3.0 on 2026-10-05](https://github.com/cryptpad/onlyoffice-x2t-wasm/issues/18#issuecomment-5990166195);
that proposal is not a completed license grant.

The selected source archive has no root LICENSE covering those helpers
explicitly, although `core/LICENSE.txt` and core source headers state AGPL.
Some helper code is incorporated into the published JavaScript/WASM; using the
binary unchanged does not make that question disappear. This project retains
the original files in the upstream source archive instead of deleting notices
or claiming that a different wrapper resolves the gap.

This record preserves the evidence and the outstanding question. It is not an
assertion that all upstream licensing uncertainty has been eliminated.

## Notices, branding and host separation

The wrapper includes no ONLYOFFICE editor UI, original editor logo asset or
editor icon set. It preserves the upstream logo clause verbatim in NOTICE,
identifies the engine and authors, and states that ONLYOFFICE is a trademark
of Ascensio System SIA. It does not claim affiliation or endorsement.
We do not infer that using a converter instead of an editor nullifies upstream
terms, and do not remove a term based on a disputed interpretation.

The host exchanges whole files with an independently usable converter via
[PROTOCOL.md](PROTOCOL.md). No host source, UI, credentials or internal data
model is included in the public project. A separate repository, iframe or
hosting domain does not by itself decide whether two programs form a combined
work under the AGPL. This project's license does not purport to relicense its
host application.

## Source availability

Every static build includes a downloadable archive of this wrapper's exact
source, build scripts, tests and notices. Its source page also links to the
fixed upstream source archive and [UPSTREAM-SOURCES.md](UPSTREAM-SOURCES.md).
`npm run release` additionally saves a checksum-verified copy of that upstream
archive for publication and long-term availability. No C++/WASM build occurs.

Publish the matching source assets with the release, retain the notices and
keep the existing license/source links available to users. Do not substitute
sources from another engine version or describe this as a proprietary engine.
