// Bản đồ vùng — KHÔNG gắn cứng cho vault nào. Người dùng tự khai báo "rules" trong
// Settings (một mảng JSON), mỗi rule khớp một tiền tố đường dẫn với một khối giải
// phẫu (part) + loại bảng phân tích (type) + tên hiển thị (name).
//
// part hợp lệ: cbL, cbR, tmpL, tmpR, cer, stem (sáu khối ellipsoid, xem geom.js).
// type quyết định nội dung bảng phân tích bên phải khi chọn nhóm đó — xem panels.js:
//   kn  = thư mục kiến thức chung      hb  = trang hub/mục lục chủ đề
//   rw  = nguyên liệu thô chưa tiêu hoá jr  = nhật ký (ngày tháng)
//   tp  = mẫu trang, không cần liên kết nav = trang điều hướng (index/log)
//   profile = thư mục hồ sơ có bộ tài liệu chuẩn lặp lại (nhân sự, sản phẩm, khách hàng…)
//   (bất kỳ chuỗi nào khác đều rơi về bảng "chưa phân loại" chung)

function classify(path, rules) {
  const list = Array.isArray(rules) ? rules : [];
  for (const r of list) {
    if (!r || !r.pre) continue;
    if (path === r.pre || path.startsWith(r.pre + "/")) {
      return { pre: r.pre, part: r.part, type: r.type || "kn", name: r.name || r.pre, indexName: r.indexName || null };
    }
  }
  // Note rời ở gốc vault (không có "/" trong đường dẫn) -> tiểu não, nhóm gộp chung
  if (!path.includes("/")) {
    return { pre: "*root", part: "cer", type: "rw", name: "Ghi chú rời ở gốc vault" };
  }
  return { pre: "*", part: "cer", type: "un", name: "Chưa phân loại" };
}

// Mẫu khởi đầu — người dùng chỉnh lại cho đúng cấu trúc vault của họ.
// Đây CHỈ là gợi ý ban đầu, không phải quy tắc bắt buộc.
const STARTER_PRESETS = {
  trong: { label: "Trống — tự viết từ đầu", rules: [] },
  para: {
    label: "PARA (Projects / Areas / Resources / Archive)",
    rules: [
      { pre: "Projects", part: "cbL", type: "kn", name: "Projects" },
      { pre: "Areas", part: "cbR", type: "kn", name: "Areas" },
      { pre: "Resources", part: "tmpR", type: "rw", name: "Resources" },
      { pre: "Archive", part: "cer", type: "rw", name: "Archive" },
    ],
  },
  zettel: {
    label: "Zettelkasten đơn giản",
    rules: [
      { pre: "permanent", part: "cbL", type: "kn", name: "Permanent notes" },
      { pre: "literature", part: "cbR", type: "kn", name: "Literature notes" },
      { pre: "fleeting", part: "tmpL", type: "jr", name: "Fleeting notes" },
      { pre: "sources", part: "tmpR", type: "rw", name: "Sources" },
      { pre: "templates", part: "stem", type: "tp", name: "Templates" },
    ],
  },
};

// Dải màu từng vùng: [đầu dải, cuối dải] theo vòng màu (độ).
// Sáu dải tách hẳn nhau để không vùng nào lẫn vùng nào. Cố định cho mọi vault —
// ý nghĩa của từng vùng do người dùng gán qua "rules", màu chỉ để phân biệt mắt.
const PART_HUE = {
  cbL:  [168, 204],   // bán cầu trái  · lam ngọc → lam
  cbR:  [296, 336],   // bán cầu phải  · tím → hồng
  tmpL: [ 42,  62],   // thuỳ trái     · vàng → vàng cam
  tmpR: [  6,  26],   // thuỳ phải     · đỏ cam → cam
  cer:  [246, 278],   // tiểu não      · tím lam
  stem: [100, 130],   // thân não      · lục
};

module.exports = { classify, PART_HUE, STARTER_PRESETS };
