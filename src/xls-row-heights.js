// SPDX-License-Identifier: AGPL-3.0-only
// Preserve saved BIFF5/8 row heights in the conversion copy. x2t otherwise
// omits automatic heights and expects the receiving spreadsheet to auto-fit.
// MS-XLS §2.4.221: miyRw is in twips; fUnsynced (bit 6) makes it explicit.
// This is a bounded CFB/BIFF metadata reader, not a cell/formula parser.
const FREE = 0xffffffff, END = 0xfffffffe;
const invalid = () => { throw new Error("Unsupported XLS layout"); };

function workbookStream(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = p => view.getUint16(p, true), u32 = p => view.getUint32(p, true);
  if (bytes.length < 512 || [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].some((b, i) => bytes[i] !== b) ||
      u16(28) !== 0xfffe || u16(32) !== 6 || u32(56) !== 4096) invalid();
  const version = u16(26), shift = u16(30);
  if (!((version === 3 && shift === 9) || (version === 4 && shift === 12))) invalid();
  const size = 2 ** shift, count = bytes.length / size - 1;
  if (!Number.isInteger(count) || count < 1) invalid();
  const sector = id => {
    if (id >= count) invalid();
    return (id + 1) * size;
  };
  // Reject overlapping metadata/data chains before modifying any input byte.
  const allocated = new Set();
  const claim = id => {
    sector(id);
    if (allocated.has(id)) invalid();
    allocated.add(id);
  };
  const fatCount = u32(44), difatCount = u32(72), fat = [];
  if (!fatCount || fatCount > count || difatCount > count) invalid();
  const addFat = id => {
    if (id === FREE) return;
    if (fat.length >= fatCount) invalid();
    claim(id); fat.push(id);
  };
  for (let p = 76; p < 512; p += 4) addFat(u32(p));
  let difat = u32(68);
  for (let i = 0; i < difatCount; i++) {
    claim(difat);
    const p = sector(difat);
    for (let j = 0; j < size - 4; j += 4) addFat(u32(p + j));
    difat = u32(p + size - 4);
  }
  if (fat.length !== fatCount || (difatCount && difat !== END)) invalid();
  const next = id => {
    sector(id);
    const page = fat[Math.floor(id / (size / 4))];
    if (page === undefined) invalid();
    return u32(sector(page) + (id % (size / 4)) * 4);
  };
  const chain = (first, getNext, limit, expected, mark) => {
    const result = [], seen = new Set();
    for (let id = first; id !== END; id = getNext(id)) {
      if (id >= limit || seen.has(id) || result.length >= limit ||
          (expected !== undefined && result.length >= expected)) invalid();
      seen.add(id); mark?.(id); result.push(id);
    }
    if (expected !== undefined && result.length !== expected) invalid();
    return result;
  };
  const directory = chain(u32(48), next, count, version === 4 ? u32(40) : undefined, claim);
  if (!directory.length) invalid();
  const entry = id => {
    if (id >= directory.length * size / 128) invalid();
    return sector(directory[Math.floor(id * 128 / size)]) + id * 128 % size;
  };
  const streamSize = p => {
    if (version === 4 && u32(p + 124)) invalid();
    const length = u32(p + 120);
    if (length > bytes.length) invalid();
    return length;
  };
  const root = entry(0);
  if (bytes[root + 66] !== 5) invalid();
  // Only the root's sibling tree: never use an embedded object's Workbook.
  const pending = [u32(root + 76)], visited = new Set();
  let workbook;
  while (pending.length) {
    const id = pending.pop();
    if (id === FREE) continue;
    if (visited.has(id)) invalid();
    visited.add(id);
    const p = entry(id), nameBytes = u16(p + 64);
    if (nameBytes < 2 || nameBytes > 64 || nameBytes % 2 || u16(p + nameBytes - 2)) invalid();
    let name = "";
    for (let j = 0; j < nameBytes - 2; j += 2) name += String.fromCharCode(u16(p + j));
    if (bytes[p + 66] === 2 && ["workbook", "book"].includes(name.toLowerCase())) {
      if (workbook !== undefined) invalid();
      workbook = p;
    }
    pending.push(u32(p + 68), u32(p + 72));
  }
  if (workbook === undefined) invalid();
  const length = streamSize(workbook), start = u32(workbook + 116);
  let address;
  if (length >= 4096) {
    const blocks = chain(start, next, count, Math.ceil(length / size), claim);
    address = p => sector(blocks[Math.floor(p / size)]) + p % size;
  } else {
    const miniFatCount = u32(64), rootLength = streamSize(root);
    if (!miniFatCount || miniFatCount > count || !rootLength) invalid();
    const miniFat = chain(u32(60), next, count, miniFatCount, claim);
    const rootBlocks = chain(u32(root + 116), next, count, Math.ceil(rootLength / size), claim);
    const rootAddress = p => sector(rootBlocks[Math.floor(p / size)]) + p % size;
    const miniNext = id => {
      const p = id * 4;
      if (p >= miniFat.length * size) invalid();
      return u32(sector(miniFat[Math.floor(p / size)]) + p % size);
    };
    const blocks = chain(start, miniNext, Math.floor(rootLength / 64), Math.ceil(length / 64));
    address = p => rootAddress(blocks[Math.floor(p / 64)] * 64 + p % 64);
  }
  // Copy only the workbook stream for scanning. Preserve the original CFB layout
  // and translate the one-byte flag changes back through its sector mapping.
  const data = new Uint8Array(length);
  for (let p = 0; p < length;) {
    const block = length < 4096 ? 64 : size;
    const n = Math.min(block - p % block, length - p), from = address(p);
    data.set(bytes.subarray(from, from + n), p); p += n;
  }
  return { data, address };
}

function rowFlags(data) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const u16 = p => view.getUint16(p, true), u32 = p => view.getUint32(p, true);
  const record = p => {
    if (p + 4 > data.length) invalid();
    const type = u16(p), length = u16(p + 2), end = p + 4 + length;
    if (end > data.length) invalid();
    return { type, length, body: p + 4, end };
  };
  const first = record(0);
  if (first.type !== 0x0809 || first.length < 8 || u16(6) !== 5) invalid();
  const version = u16(4);
  if (version !== 0x0500 && version !== 0x0600) invalid();
  const sheets = [], starts = new Set();
  let p = first.end;
  for (;;) {
    const r = record(p); p = r.end;
    if (r.type === 0x002f) return []; // FILEPASS: never interpret encrypted rows.
    if (r.type === 0x0809) invalid();
    if (r.type === 0x0085) {
      if (r.length < 7) invalid();
      const start = u32(r.body);
      if (starts.has(start)) invalid();
      starts.add(start);
      sheets.push({ start, worksheet: data[r.body + 5] === 0 });
    }
    if (r.type === 0x000a) break;
  }
  const globalsEnd = p;
  sheets.sort((a, b) => a.start - b.start);
  const patches = [];
  for (let i = 0; i < sheets.length; i++) {
    const { start, worksheet } = sheets[i], limit = sheets[i + 1]?.start ?? data.length;
    if (start < globalsEnd || start >= data.length) invalid();
    if (!worksheet) continue;
    const bof = record(start);
    if (bof.type !== 0x0809 || bof.length < 8 || u16(bof.body) !== version || u16(bof.body + 2) !== 0x0010) invalid();
    let depth = 1, lastRow = -1;
    p = bof.end;
    while (depth) {
      const r = record(p); p = r.end;
      if (p > limit) invalid();
      if (r.type === 0x002f) return [];
      if (r.type === 0x0809) depth++;
      if (r.type === 0x000a) depth--;
      if (r.type !== 0x0208 || depth !== 1) continue;
      if (r.length !== 16) invalid();
      const row = u16(r.body), firstCol = u16(r.body + 2), lastCol = u16(r.body + 4);
      const height = u16(r.body + 6), flags = r.body + 12;
      if (row <= lastRow || firstCol > 255 || lastCol > 256 || firstCol > lastCol) invalid();
      lastRow = row;
      // Skip default-height markers and invalid/zero heights; preserve hidden,
      // collapsed, outline, formatting and border flags exactly as stored.
      if (height >= 2 && height <= 8192 && !(data[flags] & 0x40)) patches.push(flags);
    }
  }
  return patches;
}

export function preserveXlsRowHeights(bytes) {
  // Best effort for supported metadata. Unsupported/corrupt/encrypted files
  // still follow x2t's existing conversion/error path, with zero partial edits.
  if (!(bytes instanceof Uint8Array) || bytes.length > 50 * 1024 * 1024) return bytes;
  try {
    const { data, address } = workbookStream(bytes);
    const patches = rowFlags(data);
    if (!patches.length) return bytes;
    const result = new Uint8Array(bytes);
    for (const p of patches) result[address(p)] |= 0x40;
    return result;
  } catch { return bytes; }
}
