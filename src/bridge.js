// SPDX-License-Identifier: AGPL-3.0-only
import { CHANNEL, MAX_BYTES, createConverter, isRequest } from "./protocol.js";

// No host application imports, cookies, storage keys or document URLs.
// A same-origin host may install this static entry via srcdoc to avoid portal
// navigation races. Cross-origin hosts use the normal URL/hash interface.
const params = new URLSearchParams(location.hash.slice(1) ||
  (window.name.startsWith("browser-office-converter:") ? window.name.slice(25) : ""));
const session = params.get("session");
const caller = params.get("origin");
let origin;
try {
  const url = new URL(caller);
  if (["https:", "http:"].includes(url.protocol) && url.origin === caller) origin = url.origin;
} catch { /* Standalone mode. */ }

const status = document.querySelector("#status");
const converter = createConverter({ onProgress(stage) {
  status.textContent = {
    loading: "Loading the conversion engine…",
    starting: "Starting the conversion engine…",
    converting: "Converting locally in your browser…",
  }[stage];
} });
if (parent !== window && origin && session && /^[a-zA-Z0-9-]{16,80}$/.test(session)) {
  let activeId;
  const reply = (data, transfer = []) => parent.postMessage({ channel: CHANNEL, session, ...data }, origin, transfer);
  window.addEventListener("message", async (event) => {
    if (!isRequest(event, parent, origin, session)) return;
    const data = event.data;
    if (data.type === "ping") { reply({ type: "ready" }); return; }
    if (data.type === "cancel" && data.id === activeId) { converter.cancel(); return; }
    if (data.type !== "convert" || typeof data.id !== "string" || data.id.length > 80) return;
    if (activeId) { reply({ id: data.id, type: "error", error: "busy" }); return; }
    activeId = data.id;
    status.textContent = "Preparing conversion…";
    try {
      const result = await converter.convert(data.buffer, data.format);
      status.textContent = "Conversion complete.";
      reply({ id: data.id, type: "result", ...result }, [result.buffer]);
    } catch (error) {
      status.textContent = "Conversion could not be completed.";
      reply({ id: data.id, type: "error", error: error.message });
    } finally { activeId = undefined; }
  });
  reply({ type: "ready" });
} else if (parent === window) {
  const fileInput = document.querySelector("#file");
  const button = document.querySelector("#convert");
  const cancel = document.querySelector("#cancel");
  const download = document.querySelector("#download");
  let outputUrl;
  button.addEventListener("click", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    button.disabled = fileInput.disabled = true;
    cancel.hidden = false;
    download.hidden = true;
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    status.textContent = "Converting locally in your browser…";
    try {
      if (file.size > MAX_BYTES) throw new Error("tooLarge");
      const format = file.name.split(".").pop().toLowerCase();
      const result = await converter.convert(await file.arrayBuffer(), format);
      outputUrl = URL.createObjectURL(new Blob([result.buffer]));
      download.href = outputUrl;
      download.download = file.name.replace(/\.[^.]+$/, "") + "." + result.format;
      download.hidden = false;
      status.textContent = "Ready. Your original file has not been changed.";
    } catch (error) {
      status.textContent = error.message === "cancelled" ? "Conversion cancelled." :
        error.message === "tooLarge" ? "This converter supports files up to 50 MiB." :
        "This file could not be converted. Password-protected or damaged files may be unsupported.";
    } finally { button.disabled = fileInput.disabled = false; cancel.hidden = true; }
  });
  cancel.addEventListener("click", () => converter.cancel());
}
window.addEventListener("pagehide", () => converter.cancel());
