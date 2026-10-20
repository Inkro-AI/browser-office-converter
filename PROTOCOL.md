# Browser Office Converter protocol v1

This is a standalone application with no dependency on any host's code or data
model. A host may embed its `index.html` in an iframe with
`sandbox="allow-scripts allow-same-origin"` and `referrerpolicy="no-referrer"`.
A separate origin is recommended for browser isolation. A same-origin embed
is style/module isolation, not a security boundary.

The iframe fragment contains `origin` (the exact host origin) and `session`
(a random UUID for this frame). Fragments are not sent to the static host.
Neither document URLs nor credentials belong in the iframe URL.

A same-origin host can fetch the static entry and install it using `srcdoc`
after its modal/portal has mounted. Resolve the entry's relative `src`/`href`
attributes against its deployment URL and preserve its CSP. Pass the same
URL-encoded parameters as `iframe.name = "browser-office-converter:" + params`
in this mode. This mode is only for a trusted same-origin deployment and does
not provide a separate origin boundary. Cross-origin deployment uses `src`.

All messages include:

```json
{"channel":"browser-office-converter-v1","session":"<frame UUID>","type":"<message type>"}
```

Both sides check `event.source`, exact `event.origin` and the session. Use the
exact recipient origin in `postMessage`, never `*`.

| Direction | Type | Additional properties |
| --- | --- | --- |
| Host → converter | `ping` | none |
| Converter → host | `ready` | none |
| Host → converter | `convert` | `id` (unique request string), `format` (`doc`, `xls`, `ppt`), `buffer` (`ArrayBuffer`) |
| Converter → host | `result` | matching `id`, `format` (`docx`, `xlsx`, `pptx`), `buffer` (`ArrayBuffer`) |
| Converter → host | `error` | matching `id`, `error` (`invalid`, `tooLarge`, `unsupported`, `busy`, `timeout`, `cancelled`, `conversionFailed`, `unavailable`) |
| Host → converter | `cancel` | matching `id` |

ArrayBuffers are sent using the transfer list (`[buffer]`). Ownership moves
to the receiving context; the sender's original buffer becomes detached.
This message exchange does not upload a document to a server.

Only one operation can be active in a frame. Each operation starts a new
worker, terminated on completion, failure, cancellation or the 120-second
timeout. The parent should also time out a failed handshake and remove the
iframe when finished. Removing the frame abandons its document and workers.

Input must be a CFB binary Office container, at most 50 MiB. Output is at most
50 MiB. Password-protected input is not supported by this interface.
The host must validate the returned format and OOXML archive before rendering
it and apply its own decompression/rendering limits. Conversion does not imply
that the resulting file is safe for unrestricted use.

The protocol contains document bytes only: no file-system paths, application
models, authentication secrets, executable scripts or URLs for remote fetching.
