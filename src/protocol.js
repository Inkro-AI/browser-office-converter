// SPDX-License-Identifier: AGPL-3.0-only
export const CHANNEL = "browser-office-converter-v1";
export const MAX_BYTES = 50 * 1024 * 1024;
export const TIMEOUT_MS = 120_000;
export const OUTPUTS = Object.freeze({ doc: "docx", xls: "xlsx", ppt: "pptx" });

export function inputError(buffer, format) {
  if (!Object.hasOwn(OUTPUTS, format)) return "unsupported";
  if (!(buffer instanceof ArrayBuffer)) return "invalid";
  if (buffer.byteLength > MAX_BYTES) return "tooLarge";
  const magic = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 512 || magic.some((b, i) => b !== bytes[i])) return "invalid";
  return null;
}

export function isRequest(event, parentWindow, origin, session) {
  return event.source === parentWindow && event.origin === origin &&
    event.data?.channel === CHANNEL && event.data.session === session;
}

// One disposable worker per operation: closing/cancelling also frees WASM memory.
export function createConverter({ WorkerClass = Worker, timeoutMs = TIMEOUT_MS, onProgress = () => {} } = {}) {
  let active;
  let rejectActive;
  let timer;
  const stop = () => {
    clearTimeout(timer);
    active?.terminate();
    active = undefined;
    rejectActive = undefined;
  };
  return {
    cancel() {
      const reject = rejectActive;
      stop();
      reject?.(new Error("cancelled"));
    },
    convert(buffer, format) {
      if (active) return Promise.reject(new Error("busy"));
      const error = inputError(buffer, format);
      if (error) return Promise.reject(new Error(error));
      return new Promise((resolve, reject) => {
        rejectActive = reject;
        const fail = (code) => { stop(); reject(new Error(code)); };
        try {
          const worker = active = new WorkerClass(new URL("./worker.js", import.meta.url));
          worker.onerror = () => fail("unavailable");
          worker.onmessage = ({ data }) => {
            if (data?.type === "progress" && ["loading", "starting", "converting"].includes(data.stage)) {
              onProgress(data.stage); return;
            }
            if (data?.type === "error") { fail(data.error === "tooLarge" ? "tooLarge" : "conversionFailed"); return; }
            const bytes = data?.buffer;
            if (data?.type !== "result" || !(bytes instanceof ArrayBuffer) ||
                bytes.byteLength < 4 || new DataView(bytes).getUint32(0, true) !== 0x04034b50) {
              fail("invalid"); return;
            }
            if (bytes.byteLength > MAX_BYTES) { fail("tooLarge"); return; }
            stop();
            resolve({ buffer: bytes, format: OUTPUTS[format] });
          };
          timer = setTimeout(() => fail("timeout"), timeoutMs);
          worker.postMessage({ buffer, format, output: OUTPUTS[format] }, [buffer]);
        } catch { fail("unavailable"); }
      });
    },
  };
}
