// SPDX-License-Identifier: AGPL-3.0-only
// Real engine compatibility check without a browser or any document uploads.
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { createContext, runInContext } from "node:vm";
import { preserveXlsRowHeights } from "../src/xls-row-heights.js";
const root = fileURLToPath(new URL("../dist/", import.meta.url));
const config = await readFile(resolve(root, "engine-config.js"), "utf8");
const paths = process.argv.slice(2);
if (!paths.length) throw new Error("Provide local DOC/XLS/PPT fixtures as arguments");
const { inputError, OUTPUTS } = await import("../src/protocol.js");
for (const file of paths) {
  const bytes = await readFile(file), format = extname(file).slice(1).toLowerCase();
  const buffer = new Uint8Array(bytes).buffer;
  const error = inputError(buffer, format);
  if (error) throw new Error(`${file}: ${error}`);
  const context = createContext({ console, URL, TextDecoder, TextEncoder, WebAssembly, setTimeout, clearTimeout,
    performance, crypto: webcrypto, Uint8Array, ArrayBuffer, importScripts: () => {}, location: { href: "http://localhost/worker.js" } });
  context.self = context;
  runInContext(config, context);
  const engineConfig = context.OFFICE_ENGINE;
  const started = performance.now();
  await new Promise(async (resolveRuntime, reject) => {
    try {
      context.Module = { wasmBinary: gunzipSync(await readFile(resolve(root, engineConfig.wasm))),
        onRuntimeInitialized: resolveRuntime, onAbort: reject, print: console.log, printErr: console.error };
      runInContext(await readFile(resolve(root, engineConfig.js), "utf8"), context);
    } catch (error) { reject(error); }
  });
  const engine = context.Module;
  for (const path of ["/working", "/working/fonts", "/working/themes"]) engine.FS.mkdir(path);
  const source = `/working/input.${format}`, output = `/working/output.${OUTPUTS[format]}`;
  engine.FS.writeFile(source, format === "xls" ? preserveXlsRowHeights(new Uint8Array(bytes)) : bytes);
  engine.FS.writeFile("/working/params.xml", `<TaskQueueDataConvert><m_sFileFrom>${source}</m_sFileFrom><m_sFileTo>${output}</m_sFileTo><m_sFontDir>/working/fonts/</m_sFontDir><m_sThemeDir>/working/themes</m_sThemeDir></TaskQueueDataConvert>`);
  const code = engine.ccall("main1", "number", ["string"], ["/working/params.xml"]);
  if (code !== 0) throw new Error(`${file}: engine returned ${code}`);
  const result = engine.FS.readFile(output);
  if (result[0] !== 0x50 || result[1] !== 0x4b) throw new Error(`${file}: invalid OOXML result`);
  console.log(JSON.stringify({ file, format: OUTPUTS[format], outputBytes: result.length, totalMs: Math.round(performance.now() - started) }));
}
