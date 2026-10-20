// SPDX-License-Identifier: AGPL-3.0-only
// Classic worker: x2t's published Emscripten loader uses importScripts globals.
importScripts("./engine-config.js");
let used = false;
self.onmessage = async ({ data }) => {
  if (used) return;
  used = true;
  try {
    self.postMessage({ type: "progress", stage: "loading" });
    // Explicit gzip decoding works on ordinary static hosting, without requiring
    // Content-Encoding configuration. Versioned compressed bytes use HTTP cache.
    const response = await fetch(new URL(self.OFFICE_ENGINE.wasm, self.location.href), {
      credentials: "omit", referrerPolicy: "no-referrer", cache: "force-cache",
    });
    if (!response.ok || !response.body) throw new Error("unavailable");
    const wasm = await new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    if (wasm.byteLength !== self.OFFICE_ENGINE.bytes) throw new Error("invalid");
    self.postMessage({ type: "progress", stage: "starting" });
    const runtime = new Promise((resolve, reject) => {
      self.Module = { wasmBinary: wasm, onRuntimeInitialized: resolve, onAbort: reject,
        print: () => {}, printErr: () => {} };
      importScripts(new URL(self.OFFICE_ENGINE.js, self.location.href).href);
    });
    await runtime;
    const engine = self.Module;
    self.postMessage({ type: "progress", stage: "converting" });
    for (const path of ["/working", "/working/fonts", "/working/themes"]) engine.FS.mkdir(path);
    // Fixed names: neither paths nor arbitrary XML come from the document/user.
    const formats = { doc: "docx", xls: "xlsx", ppt: "pptx" };
    if (!Object.hasOwn(formats, data.format) || formats[data.format] !== data.output ||
        !(data.buffer instanceof ArrayBuffer)) throw new Error("invalid");
    if (data.buffer.byteLength > 50 * 1024 * 1024) throw new Error("tooLarge");
    const input = `/working/input.${data.format}`;
    const output = `/working/output.${data.output}`;
    engine.FS.writeFile(input, new Uint8Array(data.buffer));
    engine.FS.writeFile("/working/params.xml", `<?xml version="1.0"?>
      <TaskQueueDataConvert><m_sFileFrom>${input}</m_sFileFrom><m_sFileTo>${output}</m_sFileTo>
      <m_sFontDir>/working/fonts/</m_sFontDir><m_sThemeDir>/working/themes</m_sThemeDir></TaskQueueDataConvert>`);
    const code = engine.ccall("main1", "number", ["string"], ["/working/params.xml"]);
    if (code !== 0) throw new Error("conversionFailed");
    // Check file size before creating a JS copy of potentially large output.
    if (engine.FS.stat(output).size > 50 * 1024 * 1024) throw new Error("tooLarge");
    const buffer = engine.FS.readFile(output).slice().buffer;
    self.postMessage({ type: "result", buffer }, [buffer]);
  } catch (error) {
    self.postMessage({ type: "error", error: error?.message === "tooLarge" ? "tooLarge" : "conversionFailed" });
  }
};
