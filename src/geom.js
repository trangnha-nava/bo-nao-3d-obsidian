const THREE = require("three");

// x ngang · y dọc · z trước-sau (z dương = phía trước mặt)
// seg = độ mịn lớp da mờ · par/mer = số vĩ tuyến / kinh tuyến của lưới vỏ
const PARTS = {
  cbL:  { c: [-0.50,  0.10,  0.00], r: [0.52, 0.74, 1.02], seg: 30, wob: true,  par: 13, mer: 18 },
  cbR:  { c: [ 0.50,  0.10,  0.00], r: [0.52, 0.74, 1.02], seg: 30, wob: true,  par: 13, mer: 18 },
  tmpL: { c: [-0.66, -0.50,  0.16], r: [0.30, 0.27, 0.64], seg: 20, wob: true,  par:  8, mer: 12 },
  tmpR: { c: [ 0.66, -0.50,  0.16], r: [0.30, 0.27, 0.64], seg: 20, wob: true,  par:  8, mer: 12 },
  cer:  { c: [ 0.00, -0.66, -0.80], r: [0.66, 0.32, 0.44], seg: 22, wob: true,  par:  9, mer: 14 },
  stem: { c: [ 0.00, -0.92, -0.34], r: [0.15, 0.42, 0.17], seg: 16, wob: false, par:  6, mer:  8 },
};

// Gợi ý vai trò mỗi vùng — chỉ là gợi ý mặc định, người dùng gán nội dung thật
// qua "quy tắc vùng" trong Settings nên subtitle này không bắt buộc đúng.
const PART_LABEL = {
  cbL:  "Bán cầu trái · gợi ý: định lượng, hệ thống, kỹ thuật",
  cbR:  "Bán cầu phải · gợi ý: định tính, con người, ngôn ngữ",
  tmpL: "Thuỳ trái · gợi ý: hồ sơ, sản phẩm, bản ghi",
  tmpR: "Thuỳ phải · gợi ý: nguồn, thực thể, khuôn mẫu",
  cer:  "Tiểu não · gợi ý: nguyên liệu thô, nhật ký",
  stem: "Thân não · gợi ý: trang điều hướng (index, log)",
};

// Nếp cuộn giả: nhiễu tần số thấp nhân vào bán kính từng đỉnh
function gyri(x, y, z) {
  return 0.052 * Math.sin(6.1 * x + 1.3) * Math.cos(5.4 * y - 0.7)
       + 0.038 * Math.sin(7.7 * z + 2.1) * Math.cos(6.6 * x + 0.4)
       + 0.026 * Math.sin(9.3 * y - 1.1) * Math.cos(8.2 * z + 1.7);
}

function partGeometry(p) {
  const g = new THREE.SphereGeometry(1, p.seg, Math.max(12, Math.round(p.seg * 0.7)));
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = p.wob ? 1 + gyri(x * 2.2, y * 2.2, z * 2.2) : 1;
    pos.setXYZ(i, x * k, y * k, z * k);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  g.scale(p.r[0], p.r[1], p.r[2]);
  g.translate(p.c[0], p.c[1], p.c[2]);
  return g;
}

// Điểm trên mặt khối, theo goc cuc (theta) va goc phuong vi (phi)
function surf(p, theta, phi) {
  const st = Math.sin(theta);
  let x = st * Math.cos(phi), y = Math.cos(theta), z = st * Math.sin(phi);
  const k = p.wob ? 1 + gyri(x * 2.2, y * 2.2, z * 2.2) : 1;
  return [p.c[0] + x * k * p.r[0], p.c[1] + y * k * p.r[1], p.c[2] + z * k * p.r[2]];
}

// Lưới vỏ thưa: vài vòng vĩ tuyến + vài cung kinh tuyến, thay cho wireframe tam giác.
// Rẻ hơn nhiều lần và nhìn gọn hơn vì các đường chạy đều theo hình khối.
function latticeSegments(p, quality) {
  const par = Math.max(4, Math.round(p.par * quality));
  const mer = Math.max(4, Math.round(p.mer * quality));
  const ringSteps = Math.max(16, Math.round(mer * 2.6));
  const arcSteps  = Math.max(14, Math.round(par * 2.6));
  const out = [];
  const push = (a, b) => { out.push(a[0], a[1], a[2], b[0], b[1], b[2]); };

  for (let i = 1; i < par; i++) {                       // vĩ tuyến
    const th = (i * Math.PI) / par;
    let prev = surf(p, th, 0);
    for (let j = 1; j <= ringSteps; j++) {
      const cur = surf(p, th, (j / ringSteps) * Math.PI * 2);
      push(prev, cur); prev = cur;
    }
  }
  for (let j = 0; j < mer; j++) {                       // kinh tuyến
    const ph = (j / mer) * Math.PI * 2;
    let prev = surf(p, 0, ph);
    for (let i = 1; i <= arcSteps; i++) {
      const cur = surf(p, (i / arcSteps) * Math.PI, ph);
      push(prev, cur); prev = cur;
    }
  }
  return out;
}

// Ép một điểm nằm gọn trong ellipsoid của khối
function clampInside(part, p, lim = 0.88) {
  const [cx, cy, cz] = part.c, [a, b, c] = part.r;
  let dx = p[0] - cx, dy = p[1] - cy, dz = p[2] - cz;
  const t = Math.hypot(dx / a, dy / b, dz / c);
  if (t > lim) { const s = lim / t; dx *= s; dy *= s; dz *= s; }
  return [cx + dx, cy + dy, cz + dz];
}

// PRNG có seed để bố cục ổn định giữa các lần mở
function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rnd) {
  const u = Math.max(1e-9, rnd()), v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Chấm tròn phát sáng bằng canvas gradient
function glowTexture() {
  const s = 128, cv = document.createElement("canvas");
  cv.width = cv.height = s;
  const g = cv.getContext("2d");
  const rad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  rad.addColorStop(0.00, "rgba(255,255,255,1)");
  rad.addColorStop(0.22, "rgba(255,255,255,0.86)");
  rad.addColorStop(0.50, "rgba(255,255,255,0.26)");
  rad.addColorStop(1.00, "rgba(255,255,255,0)");
  g.fillStyle = rad; g.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function hsl(h, s, l) { return new THREE.Color().setHSL(h / 360, s, l); }

module.exports = { PARTS, PART_LABEL, partGeometry, latticeSegments, surf, clampInside, fnv, mulberry32, gauss, glowTexture, hsl, gyri };
