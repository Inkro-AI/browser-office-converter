// SPDX-License-Identifier: AGPL-3.0-only
import { test } from "node:test";
import assert from "node:assert/strict";
import { CHANNEL, MAX_BYTES, createConverter, inputError, isRequest } from "../src/protocol.js";

const input = () => {
  const bytes = new Uint8Array(512);
  bytes.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  return bytes.buffer;
};
const zip = () => new Uint8Array([0x50, 0x4b, 3, 4]).buffer;
class FakeWorker {
  static instances = [];
  constructor() { FakeWorker.instances.push(this); }
  terminate() { this.terminated = true; }
  postMessage(message, transfer) { this.message = message; this.transfer = transfer; }
}
test("only accepts requests from the expected frame, origin and session", () => {
  const parent = {};
  const good = { source: parent, origin: "https://host.example", data: { channel: CHANNEL, session: "session" } };
  assert.equal(isRequest(good, parent, good.origin, "session"), true);
  for (const altered of [
    { ...good, source: {} }, { ...good, origin: "https://evil.example" },
    { ...good, data: { ...good.data, session: "other" } }, { ...good, data: null },
  ]) assert.equal(isRequest(altered, parent, good.origin, "session"), false);
});
test("only legacy CFB input within the byte budget starts a worker", async () => {
  const converter = createConverter({ WorkerClass: FakeWorker });
  assert.equal(inputError(input(), "doc"), null);
  assert.equal(inputError(input(), "docx"), "unsupported");
  assert.equal(inputError(new ArrayBuffer(512), "doc"), "invalid");
  assert.equal(inputError(new ArrayBuffer(MAX_BYTES + 1), "doc"), "tooLarge");
  const before = FakeWorker.instances.length;
  await assert.rejects(converter.convert(input(), "docx"), /unsupported/);
  assert.equal(FakeWorker.instances.length, before);
});
test("converts once, transfers bytes and releases the worker", async () => {
  const converter = createConverter({ WorkerClass: FakeWorker });
  const bytes = input();
  const result = converter.convert(bytes, "xls");
  const worker = FakeWorker.instances.at(-1);
  assert.deepEqual(worker.transfer, [bytes]);
  assert.equal(worker.message.output, "xlsx");
  await assert.rejects(converter.convert(input(), "ppt"), /busy/);
  worker.onmessage({ data: { type: "result", buffer: zip() } });
  assert.equal((await result).format, "xlsx");
  assert.equal(worker.terminated, true);
});
test("malformed output, engine errors, cancellation and timeout terminate workers", async () => {
  for (const kind of ["invalid", "error", "cancel", "timeout"]) {
    const converter = createConverter({ WorkerClass: FakeWorker, timeoutMs: 10 });
    const result = converter.convert(input(), "ppt");
    const rejected = assert.rejects(result);
    const worker = FakeWorker.instances.at(-1);
    if (kind === "invalid") worker.onmessage({ data: { type: "result", buffer: new ArrayBuffer(8) } });
    if (kind === "error") worker.onerror();
    if (kind === "cancel") converter.cancel();
    await rejected;
    assert.equal(worker.terminated, true);
  }
});
