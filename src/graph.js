const { classify, PART_HUE } = require("./regions.js");
const { PARTS, clampInside, fnv, mulberry32, gauss } = require("./geom.js");

// Dựng toàn bộ dữ liệu đồ thị: node, vị trí, cạnh, chỉ số từng nhóm.
function buildGraph(app, opt) {
  const spread = opt.spread ?? 1.0;
  const rules = opt.rules ?? [];
  const files = app.vault.getMarkdownFiles();

  // 1. Phân loại note vào nhóm
  const nodes = [];
  const byPath = new Map();
  const groups = new Map(); // key = part + "|" + name

  for (const f of files) {
    const g = classify(f.path, rules);
    if (!g) continue;
    const key = g.part + "|" + g.name;
    if (!groups.has(key)) {
      groups.set(key, { key, part: g.part, type: g.type, name: g.name, indexName: g.indexName, list: [] });
    }
    const grp = groups.get(key);
    const n = {
      i: nodes.length, path: f.path, base: f.basename, grp: key,
      mtime: f.stat?.mtime ?? 0,
      deg: 0, inDeg: 0, outDeg: 0, inbound: 0, pos: null,
    };
    grp.list.push(n); nodes.push(n); byPath.set(f.path, n);
  }

  // 2. Cạnh từ resolvedLinks, bỏ trùng và bỏ note ngoài phạm vi
  const rl = app.metadataCache.resolvedLinks || {};
  const seen = new Set();
  const edges = [];
  const crossMap = new Map(); // "keyA|keyB" (thứ tự từ điển) -> {a,b,count,sample:[i,j]}
  for (const src in rl) {
    const a = byPath.get(src); if (!a) continue;
    for (const dst in rl[src]) {
      if (dst === src) continue;
      const b = byPath.get(dst); if (!b) continue;
      const k = a.i < b.i ? a.i + ":" + b.i : b.i + ":" + a.i;
      if (seen.has(k)) continue;
      seen.add(k);
      edges.push([a.i, b.i]);
      a.deg++; b.deg++; b.inbound++;
      if (a.grp === b.grp) {
        a.inDeg++; b.inDeg++;
      } else {
        a.outDeg++; b.outDeg++;
        const [gA, gB] = a.grp < b.grp ? [a.grp, b.grp] : [b.grp, a.grp];
        const ck = gA + "||" + gB;
        if (!crossMap.has(ck)) crossMap.set(ck, { gA, gB, count: 0, sample: [a.i, b.i] });
        crossMap.get(ck).count++;
      }
    }
  }

  // 3. Xếp nhóm vào khối, mỗi nhóm một dải chạy dọc trước-sau, bề rộng theo tỷ trọng
  const partTotal = {};
  for (const g of groups.values()) partTotal[g.part] = (partTotal[g.part] || 0) + g.list.length;

  const ordered = [...groups.values()].sort((a, b) =>
    a.part === b.part ? b.list.length - a.list.length : a.part.localeCompare(b.part));

  // Rải sắc độ trong dải của vùng: nhóm đông note lấy đầu dải, nhóm nhỏ lấy cuối dải.
  // Cùng vùng thì cùng gam, khác vùng thì khác hẳn — nhìn là biết chấm thuộc đâu.
  const perPart = {};
  for (const g of ordered) (perPart[g.part] = perPart[g.part] || []).push(g);
  for (const part in perPart) {
    const list = perPart[part];
    const [h0, h1] = PART_HUE[part] || [0, 0];
    list.forEach((g, i) => {
      g.hue = list.length === 1 ? (h0 + h1) / 2 : h0 + ((h1 - h0) * i) / (list.length - 1);
      g.sat = g.type === "un" ? 0.08 : 0.85;   // nhóm chưa phân loại để xám cho dễ nhận
    });
  }

  const acc = {};
  for (const g of ordered) {
    const part = PARTS[g.part];
    const share = g.list.length / Math.max(1, partTotal[g.part]);
    const t0 = acc[g.part] || 0, t1 = t0 + share;
    acc[g.part] = t1;
    const tm = (t0 + t1) / 2;

    g.center = [
      part.c[0],
      part.c[1] + (g.list.length % 2 ? -0.16 : 0.18) * part.r[1],
      part.c[2] + (0.62 - 1.24 * tm) * part.r[2],
    ];

    const rnd = mulberry32(fnv(g.key));
    const sx = 0.55 * part.r[0] * spread;
    const sy = 0.42 * part.r[1] * spread;
    const sz = Math.max(0.10, share * 0.72) * part.r[2] * spread;

    // note nối nhiều nằm gần lõi, note mồ côi dạt ra rìa
    const maxDeg = Math.max(1, ...g.list.map((n) => n.deg));
    for (const n of g.list) {
      const pull = 0.42 + 0.58 * (1 - Math.sqrt(n.deg / maxDeg));
      const p = [
        g.center[0] + gauss(rnd) * sx * pull,
        g.center[1] + gauss(rnd) * sy * pull,
        g.center[2] + gauss(rnd) * sz,
      ];
      n.pos = clampInside(part, p);
    }

    // 4. Chỉ số của nhóm
    const notes = g.list.length;
    const deg = g.list.reduce((s, n) => s + n.deg, 0) / 2 * 2; // tổng bậc
    const orphans = g.list.filter((n) => n.deg === 0);
    const unused = g.list.filter((n) => n.inbound === 0);
    g.stat = {
      notes,
      deg,
      inDeg: g.list.reduce((s, n) => s + n.inDeg, 0) / 2,
      outDeg: g.list.reduce((s, n) => s + n.outDeg, 0),
      orphan: orphans.length,
      orphanList: orphans.map((n) => n.path),
      unused: unused.length,
      unusedList: unused.map((n) => n.path),
      density: notes ? deg / notes : 0,
      coverage: notes ? 1 - orphans.length / notes : 0,
      top: [...g.list].sort((a, b) => b.deg - a.deg).slice(0, 5).map((n) => ({ base: n.base, path: n.path, deg: n.deg })),
      hub: null,
    };
    const hubName = g.name.toLowerCase();
    const idxName = g.indexName ? g.indexName.toLowerCase().replace(/\.md$/, "") : null;
    g.stat.hub = (idxName && g.list.find((n) => n.base.toLowerCase() === idxName))
      || g.list.find((n) => n.base.toLowerCase() === hubName)
      || g.list.find((n) => n.base.toLowerCase() === "index")
      || g.list.find((n) => n.base.toLowerCase().startsWith("topic-"))
      || null;
  }

  // Gộp theo vùng giải phẫu — nguyên liệu cho bảng phụ chú giải.
  const parts = [];
  for (const part in perPart) {
    const gs = perPart[part];
    const notes = gs.reduce((s, g) => s + g.stat.notes, 0);
    const deg = gs.reduce((s, g) => s + g.stat.deg, 0);
    const orphan = gs.reduce((s, g) => s + g.stat.orphan, 0);
    const [h0, h1] = PART_HUE[part] || [0, 0];
    parts.push({
      part, notes, deg, orphan, hue: (h0 + h1) / 2, hue0: h0, hue1: h1,
      density: notes ? deg / notes : 0,
      groups: gs,
      top: gs.slice(0, 4).map((g) => g.name),
    });
  }
  parts.sort((a, b) => b.notes - a.notes);

  // Cầu nối liên vùng: những cặp nhóm có nhiều liên kết CHÉO nhất (khác nhóm nhau).
  const byKey = new Map(ordered.map((g) => [g.key, g]));
  const crossLinks = [...crossMap.values()]
    .map((c) => ({
      a: byKey.get(c.gA), b: byKey.get(c.gB), count: c.count,
      sampleA: nodes[c.sample[0]], sampleB: nodes[c.sample[1]],
    }))
    .filter((c) => c.a && c.b)
    .sort((x, y) => y.count - x.count);

  const totalDeg = nodes.reduce((s, n) => s + n.deg, 0);
  const total = {
    notes: nodes.length,
    links: edges.length,
    density: nodes.length ? totalDeg / nodes.length : 0,
    orphan: nodes.filter((n) => n.deg === 0).length,
  };

  return { nodes, edges, groups: ordered, parts, crossLinks, total };
}

module.exports = { buildGraph };
