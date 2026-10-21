// SPDX-License-Identifier: AGPL-3.0-only
// Synthetic metadata only. No customer documents, values or formulas.
const FREE = 0xffffffff, END = 0xfffffffe;
const u16 = (b, p, n) => new DataView(b.buffer, b.byteOffset).setUint16(p, n, true);
const u32 = (b, p, n) => new DataView(b.buffer, b.byteOffset).setUint32(p, n, true);
export function biffRecord(type, body = new Uint8Array()) {
  const out = new Uint8Array(4 + body.length);
  u16(out, 0, type); u16(out, 2, body.length); out.set(body, 4); return out;
}
const join = chunks => {
  const out = new Uint8Array(chunks.reduce((n, b) => n + b.length, 0));
  let p = 0; for (const b of chunks) { out.set(b, p); p += b.length; } return out;
};
const bof = (version, type) => {
  const body = new Uint8Array(16); u16(body, 0, version); u16(body, 2, type);
  return biffRecord(0x0809, body);
};
export function workbook({ sheets = [[{ row: 0, height: 500 }]], version = 0x0600,
  encrypted = false, padding = 0, embeddedChart = false } = {}) {
  const streams = [], relativeFlags = [], bounds = [];
  for (let i = 0; i < sheets.length; i++) {
    const chunks = [bof(version, 0x10)], flags = [];
    for (const row of sheets[i]) {
      const body = new Uint8Array(16);
      u16(body, 0, row.row); u16(body, 2, 0); u16(body, 4, 1); u16(body, 6, row.height);
      u32(body, 12, row.flags ?? 0x100);
      flags.push(chunks.reduce((n, b) => n + b.length, 0) + 16);
      chunks.push(biffRecord(0x0208, body));
    }
    if (embeddedChart) {
      const row = new Uint8Array(16); u16(row, 6, 800);
      chunks.push(bof(version, 0x20), biffRecord(0x0208, row), biffRecord(0x000a));
    }
    chunks.push(biffRecord(0x000a)); streams.push(join(chunks)); relativeFlags.push(flags);
    const body = new Uint8Array(9); body[6] = 1; body[8] = 65 + i;
    bounds.push(biffRecord(0x0085, body));
  }
  const prefix = [bof(version, 5), ...(encrypted ? [biffRecord(0x002f, new Uint8Array(6))] : []),
    ...(padding ? [biffRecord(0x1234, new Uint8Array(padding))] : []), ...bounds, biffRecord(0x000a)];
  let offset = prefix.reduce((n, b) => n + b.length, 0);
  const flags = [], starts = [];
  for (let i = 0; i < streams.length; i++) {
    u32(bounds[i], 4, offset); starts.push(offset);
    flags.push(...relativeFlags[i].map(p => p + offset)); offset += streams[i].length;
  }
  return { bytes: join([...prefix, ...streams]), flags, starts };
}

export function compound(stream, { mini = false, fragmented = false, version = 3,
  name = "Workbook", difat = false } = {}) {
  const size = version === 4 ? 4096 : 512;
  const length = mini ? stream.length : Math.max(4096, stream.length);
  const miniCount = Math.ceil(length / 64);
  const dataCount = Math.ceil((mini ? miniCount * 64 : length) / size);
  // The DIFAT fixture exercises the actual >109-FAT-sector boundary (~7 MiB).
  const fatCount = difat ? 110 : 1;
  const directoryId = fatCount + (difat ? 1 : 0), miniFatId = directoryId + 1;
  const dataStart = directoryId + 1 + (mini ? 1 : 0);
  const count = Math.max(dataStart + dataCount, difat ? 13900 : 0);
  const bytes = new Uint8Array((count + 1) * size);
  bytes.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  u16(bytes, 26, version); u16(bytes, 28, 0xfffe); u16(bytes, 30, version === 4 ? 12 : 9); u16(bytes, 32, 6);
  u32(bytes, 40, version === 4 ? 1 : 0); u32(bytes, 44, fatCount); u32(bytes, 48, directoryId);
  u32(bytes, 56, 4096); u32(bytes, 60, mini ? miniFatId : END); u32(bytes, 64, mini ? 1 : 0);
  u32(bytes, 68, difat ? 110 : END); u32(bytes, 72, difat ? 1 : 0);
  for (let i = 0; i < 109; i++) u32(bytes, 76 + i * 4, i < fatCount ? i : FREE);
  for (let id = 0; id < fatCount; id++) bytes.fill(0xff, (id + 1) * size, (id + 2) * size);
  const fatAddress = id => (Math.floor(id / (size / 4)) + 1) * size + (id % (size / 4)) * 4;
  const link = (id, next) => u32(bytes, fatAddress(id), next);
  for (let id = 0; id < fatCount; id++) link(id, 0xfffffffd);
  if (difat) {
    const p = 111 * size; bytes.fill(0xff, p, p + size);
    u32(bytes, p, 109); u32(bytes, p + size - 4, END); link(110, 0xfffffffc);
  }
  link(directoryId, END);
  const data = Array.from({ length: dataCount }, (_, i) => dataStart + i);
  if (fragmented) data.reverse();
  data.forEach((id, i) => link(id, data[i + 1] ?? END));
  const directory = (directoryId + 1) * size;
  const writeEntry = (index, label, type, start, n) => {
    const p = directory + index * 128;
    for (let i = 0; i < label.length; i++) u16(bytes, p + i * 2, label.charCodeAt(i));
    u16(bytes, p + 64, (label.length + 1) * 2); bytes[p + 66] = type;
    u32(bytes, p + 68, FREE); u32(bytes, p + 72, FREE); u32(bytes, p + 76, FREE);
    u32(bytes, p + 116, start); u32(bytes, p + 120, n);
  };
  writeEntry(0, "Root Entry", 5, mini ? data[0] : END, mini ? miniCount * 64 : 0);
  writeEntry(1, name, 2, mini ? (fragmented ? miniCount - 1 : 0) : data[0], length);
  u32(bytes, directory + 76, 1);
  const minis = Array.from({ length: miniCount }, (_, i) => i);
  if (fragmented) minis.reverse();
  if (mini) {
    link(miniFatId, END); bytes.fill(0xff, (miniFatId + 1) * size, (miniFatId + 2) * size);
    minis.forEach((id, i) => u32(bytes, (miniFatId + 1) * size + id * 4, minis[i + 1] ?? END));
  }
  const address = p => {
    const q = mini ? minis[Math.floor(p / 64)] * 64 + p % 64 : p;
    return (data[Math.floor(q / size)] + 1) * size + q % size;
  };
  for (let p = 0; p < stream.length; p++) bytes[address(p)] = stream[p];
  return { bytes, address, fatAddress, directory, data, miniFatId, size };
}
