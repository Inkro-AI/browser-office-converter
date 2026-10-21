// SPDX-License-Identifier: AGPL-3.0-only
import test from "node:test";
import assert from "node:assert/strict";
import { preserveXlsRowHeights } from "../src/xls-row-heights.js";
import { workbook, compound } from "./xls-fixtures.mjs";

function check(fixture, flags) {
  const original = new Uint8Array(fixture.bytes);
  const result = preserveXlsRowHeights(fixture.bytes);
  const expected = new Uint8Array(original);
  for (const flag of flags) expected[fixture.address(flag)] |= 0x40;
  assert.deepEqual(result, expected);
  assert.deepEqual(new Uint8Array(fixture.bytes), original, "source must remain untouched");
  return result;
}

for (const options of [{}, { fragmented: true }, { mini: true }, { mini: true, fragmented: true },
  { version: 4, fragmented: true }, { difat: true, fragmented: true }]) {
  test(`preserves stored automatic heights across CFB layouts ${JSON.stringify(options)}`, () => {
    const source = workbook({ sheets: [[{ row: 2, height: 1000 }, { row: 6, height: 500 }],
      [{ row: 0, height: 620, flags: 0x1b3 }, { row: 4, height: 800, flags: 0x140 }]] });
    const fixture = compound(source.bytes, options);
    const result = check(fixture, source.flags);
    assert.notStrictEqual(result, fixture.bytes);
    assert.strictEqual(preserveXlsRowHeights(result), result, "already explicit heights are a no-op");
  });
}

test("BIFF5 Book streams and Uint8Array subviews preserve heights without changing surrounding bytes", () => {
  const source = workbook({ version: 0x0500 });
  const fixture = compound(source.bytes, { name: "Book" });
  const parent = new Uint8Array(fixture.bytes.length + 16).fill(37);
  parent.set(fixture.bytes, 8); fixture.bytes = parent.subarray(8, -8);
  check(fixture, source.flags);
  assert.equal(parent[0], 37); assert.equal(parent.at(-1), 37);
});

test("Buffer inputs are copied, never mutated by Buffer.slice semantics", () => {
  const source = workbook(), fixture = compound(source.bytes);
  fixture.bytes = Buffer.from(fixture.bytes); check(fixture, source.flags);
});

test("preserves hidden/outline/border flags, ignores default or invalid heights and nested chart records", () => {
  const source = workbook({ embeddedChart: true, sheets: [[
    { row: 0, height: 500, flags: 0x301b3 }, // hidden, collapsed, outline, formatting, borders
    { row: 1, height: 0 }, { row: 2, height: 0x81f4 }, { row: 3, height: 8193 },
    { row: 4, height: 600, flags: 0x140 }, { row: 5, height: 8192 },
  ]] });
  check(compound(source.bytes), [source.flags[0], source.flags[5]]);
});

test("record fields crossing fragmented sectors are mapped correctly", () => {
  const source = workbook({ padding: 458 }); // first ROW crosses a 512-byte sector boundary
  const fixture = compound(source.bytes, { fragmented: true });
  check(fixture, source.flags);
});

test("unsupported BIFF and encrypted files are left intact", () => {
  for (const source of [workbook({ encrypted: true }), workbook({ version: 0x0400 })]) {
    const { bytes } = compound(source.bytes);
    assert.strictEqual(preserveXlsRowHeights(bytes), bytes);
  }
  const bytes = new Uint8Array(512);
  assert.strictEqual(preserveXlsRowHeights(bytes), bytes);
});

test("truncated later sheets do not leave earlier sheets partially modified", () => {
  const source = workbook({ sheets: [[{ row: 1, height: 500 }], [{ row: 2, height: 1000 }]] });
  new DataView(source.bytes.buffer).setUint16(source.starts[1] + 2, 65535, true);
  const fixture = compound(source.bytes), original = new Uint8Array(fixture.bytes);
  assert.strictEqual(preserveXlsRowHeights(fixture.bytes), fixture.bytes);
  assert.deepEqual(fixture.bytes, original);
});

test("corrupt CFB chains, overlaps, directories and oversized lengths are bounded no-ops", () => {
  const corruptions = [
    f => new DataView(f.bytes.buffer).setUint32(f.fatAddress(f.data[0]), f.data[0], true),
    f => new DataView(f.bytes.buffer).setUint32(f.directory + 128 + 116, 0, true),
    f => new DataView(f.bytes.buffer).setUint32(f.directory + 128 + 120, 0xffffffff, true),
    f => new DataView(f.bytes.buffer).setUint32(f.directory + 128 + 68, 1, true),
    f => new DataView(f.bytes.buffer).setUint32(44, 0xffffffff, true),
    f => new DataView(f.bytes.buffer).setUint32(48, 0xffffffff, true),
  ];
  for (const corrupt of corruptions) {
    const f = compound(workbook().bytes); corrupt(f);
    const original = new Uint8Array(f.bytes);
    assert.strictEqual(preserveXlsRowHeights(f.bytes), f.bytes);
    assert.deepEqual(f.bytes, original);
  }
});

test("corrupt mini-FAT and DIFAT loops do not hang or alter bytes", () => {
  const mini = compound(workbook().bytes, { mini: true });
  new DataView(mini.bytes.buffer).setUint32((mini.miniFatId + 1) * mini.size, 0, true);
  assert.strictEqual(preserveXlsRowHeights(mini.bytes), mini.bytes);
  const difat = compound(workbook().bytes, { difat: true });
  new DataView(difat.bytes.buffer).setUint32(72, 2, true);
  new DataView(difat.bytes.buffer).setUint32(112 * difat.size - 4, 110, true);
  assert.strictEqual(preserveXlsRowHeights(difat.bytes), difat.bytes);
});
