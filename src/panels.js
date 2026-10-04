const { PART_LABEL } = require("./geom.js");

const PART_ORDER = ["cbL", "cbR", "tmpL", "tmpR", "cer", "stem"];

function el(tag, cls, txt) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
}
function pct(x) { return Math.round(x * 100) + "%"; }
function num(x) { return (Math.round(x * 100) / 100).toString(); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function dotHsl(g) { return "hsl(" + g.hue + "," + ((g.sat ?? 0.85) * 100) + "%,62%)"; }

// Thời gian tương đối kiểu "3 giờ trước". now/ms là mốc & mốc so sánh, cùng đơn vị ms.
function timeAgo(ms, now) {
  const d = Math.max(0, now - ms);
  const min = 60000, hr = 60 * min, day = 24 * hr;
  if (d < min) return "vừa xong";
  if (d < hr) return Math.round(d / min) + " phút trước";
  if (d < day) return Math.round(d / hr) + " giờ trước";
  if (d < 30 * day) return Math.round(d / day) + " ngày trước";
  return Math.round(d / (30 * day)) + " tháng trước";
}

// ---------- Bảng trái: chú giải vùng + danh sách nhóm ----------
function buildLeft(host, graph, onSelect, onSelectPart) {
  const box = el("div", "n3-panel n3-left");
  const h = el("div", "n3-h");
  h.appendChild(el("span", "n3-h-t", "Trong bộ não này có gì"));
  h.appendChild(el("span", "n3-h-s",
    graph.total.notes + " note · " + graph.total.links + " liên kết · " +
    num(graph.total.density) + " liên kết mỗi note"));
  box.appendChild(h);

  // Tìm nhanh: gõ là lọc ngay danh sách nhóm bên dưới, khỏi cuộn qua 80 vị trí.
  const searchWrap = el("div", "n3-search");
  const searchInput = document.createElement("input");
  searchInput.className = "n3-search-i";
  searchInput.type = "text";
  searchInput.placeholder = "Tìm vị trí, khái niệm…";
  searchWrap.appendChild(searchInput);
  box.appendChild(searchWrap);

  const body = el("div", "n3-scroll");
  const btns = new Map(), partBtns = new Map();
  const maxNotes = Math.max(...graph.parts.map((p) => p.notes));

  // --- Phần 1: sáu vùng giải phẫu, màu khớp đúng màu vỏ ngoài ---
  const sixZonesSec = el("div", "n3-sec", "Sáu vùng · màu trùng với vỏ ngoài");
  body.appendChild(sixZonesSec);
  for (const p of graph.parts) {
    const b = el("button", "n3-part");
    const head = el("div", "n3-part-h");
    const dot = el("span", "n3-swatch");
    dot.style.background = "hsl(" + p.hue + ",80%,66%)";
    dot.style.boxShadow = "0 0 10px hsla(" + p.hue + ",80%,66%,.9)";
    head.appendChild(dot);
    head.appendChild(el("span", "n3-part-n", PART_LABEL[p.part].split(" · ")[0]));
    head.appendChild(el("span", "n3-part-c", p.notes + " note"));
    b.appendChild(head);

    const bar = el("div", "n3-pbar");
    const fill = el("div", "n3-pbar-a");
    fill.style.width = Math.round((p.notes / maxNotes) * 100) + "%";
    fill.style.background = "hsl(" + p.hue + ",80%,60%)";
    bar.appendChild(fill);
    b.appendChild(bar);

    b.appendChild(el("div", "n3-part-s", PART_LABEL[p.part].split(" · ")[1] || ""));
    b.appendChild(el("div", "n3-part-g", p.top.join(" · ")));
    b.onclick = () => onSelectPart(p);
    partBtns.set(p.part, b);
    body.appendChild(b);
  }

  // --- Phần 2: từng nhóm, xếp theo vùng ---
  const groupsSec = el("div", "n3-sec", "Từng nhóm một");
  body.appendChild(groupsSec);
  const subHeaders = new Map();   // part -> tiêu đề con, ẩn khi tìm mà vùng đó không khớp
  const groupRows = [];           // {part, needle, el} — nguyên liệu cho ô tìm nhanh
  for (const part of PART_ORDER) {
    const gs = graph.groups.filter((g) => g.part === part);
    if (!gs.length) continue;
    const sub = el("div", "n3-sub2", PART_LABEL[part].split(" · ")[0]);
    body.appendChild(sub);
    subHeaders.set(part, sub);
    for (const g of gs) {
      const b = el("button", "n3-grp");
      const dot = el("span", "n3-dot");
      dot.style.background = dotHsl(g);
      dot.style.boxShadow = "0 0 8px " + dotHsl(g).replace("hsl", "hsla").replace(")", ",.85)");
      b.appendChild(dot);
      b.appendChild(el("span", "n3-grp-n", g.name));
      b.appendChild(el("span", "n3-grp-c", String(g.stat.notes)));
      b.onclick = () => onSelect(g);
      btns.set(g.key, b);
      body.appendChild(b);
      groupRows.push({ part, needle: g.name.toLowerCase(), el: b });
    }
  }
  box.appendChild(body);

  searchInput.addEventListener("input", () => {
    const q = searchInput.value.trim().toLowerCase();
    const searching = q.length > 0;
    // Khi đang tìm, ẩn khối "Sáu vùng" (tổng quan, không phải thứ đang tìm) và
    // chỉ hiện những nhóm khớp tên trong "Từng nhóm một".
    sixZonesSec.style.display = searching ? "none" : "";
    for (const b of partBtns.values()) b.style.display = searching ? "none" : "";
    const hitPart = {};
    for (const row of groupRows) {
      const match = !searching || row.needle.includes(q);
      row.el.style.display = match ? "" : "none";
      if (match) hitPart[row.part] = true;
    }
    for (const [part, subEl] of subHeaders) subEl.style.display = (!searching || hitPart[part]) ? "" : "none";
  });

  const foot = el("div", "n3-foot");
  const reset = el("button", "n3-btn n3-btn-ghost", "Bỏ lấy nét");
  reset.onclick = () => onSelect(null);
  foot.appendChild(reset);
  box.appendChild(foot);

  host.appendChild(box);
  return {
    mark(key, partKey) {
      btns.forEach((b, k) => b.classList.toggle("is-on", k === key));
      partBtns.forEach((b, k) => b.classList.toggle("is-on", k === partKey));
    },
  };
}

// ---------- Bảng phải: khung tab cố định (Phân tích / Gần đây / Cầu nối) ----------
function kpi(wrap, label, value, tone) {
  const c = el("div", "n3-kpi" + (tone ? " n3-kpi-" + tone : ""));
  c.appendChild(el("div", "n3-kpi-v", String(value)));
  c.appendChild(el("div", "n3-kpi-l", label));
  wrap.appendChild(c);
}

function buildRight(host, ctx) {
  const box = el("div", "n3-panel n3-right");

  const tabs = el("div", "n3-rtabs");
  const tAna = el("button", "n3-rtab is-on", "Phân tích");
  const tTop = el("button", "n3-rtab", "Trọng tâm");
  const tRec = el("button", "n3-rtab", "Gần đây");
  const tBri = el("button", "n3-rtab", "Cầu nối");
  tabs.appendChild(tAna); tabs.appendChild(tTop); tabs.appendChild(tRec); tabs.appendChild(tBri);
  box.appendChild(tabs);

  const body = el("div", "n3-scroll");
  box.appendChild(body);
  host.appendChild(box);

  const tabBtns = { ana: tAna, top: tTop, recent: tRec, bridges: tBri };
  let mode = "ana", lastG = null;

  function paintTabs() {
    for (const k in tabBtns) tabBtns[k].classList.toggle("is-on", k === mode);
  }
  function renderBody() {
    body.empty();
    if (mode === "ana") renderAnalysis(body, lastG, ctx);
    else if (mode === "top") renderHighlights(body, ctx);
    else if (mode === "recent") renderRecent(body, ctx);
    else renderBridges(body, ctx);
  }
  function setMode(m) { mode = m; paintTabs(); renderBody(); }

  tAna.onclick = () => setMode("ana");
  tTop.onclick = () => setMode("top");
  tRec.onclick = () => setMode("recent");
  tBri.onclick = () => setMode("bridges");

  return {
    render(g) { lastG = g; mode = "ana"; paintTabs(); renderBody(); },
  };
}

// ---------- Nội dung tab "Phân tích": đổi theo loại của nhóm/vùng đang chọn ----------
function renderAnalysis(body, g, ctx) {
  const { graph, openPath } = ctx;

  const head = el("div", "n3-h");
  const laVung = !!(g && g.groups);
  head.appendChild(el("span", "n3-h-t",
    !g ? "Toàn bộ não" : laVung ? PART_LABEL[g.part].split(" · ")[0] : g.name));
  head.appendChild(el("span", "n3-h-s",
    !g ? "chưa lấy nét vùng nào" : laVung ? (PART_LABEL[g.part].split(" · ")[1] || "") : PART_LABEL[g.part]));
  body.appendChild(head);

  const grid = el("div", "n3-kpis");
  body.appendChild(grid);

  // --- Chọn một VÙNG giải phẫu ---
  if (g && g.groups) {
    kpi(grid, "note", g.notes);
    kpi(grid, "liên kết", g.deg);
    kpi(grid, "mật độ", num(g.density));
    kpi(grid, "mồ côi", g.orphan, g.orphan > g.notes * 0.3 ? "warn" : "ok");

    body.appendChild(el("div", "n3-sub", "Các nhóm trong vùng này"));
    for (const x of g.groups) {
      const r = el("button", "n3-row");
      const dot = el("span", "n3-dot");
      dot.style.background = dotHsl(x);
      r.appendChild(dot);
      r.appendChild(el("span", "n3-row-n", x.name));
      r.appendChild(el("span", "n3-row-c", x.stat.notes + " · " + num(x.stat.density)));
      r.onclick = () => ctx.select(x);
      body.appendChild(r);
    }
    const orphans = g.groups.flatMap((x) => x.stat.orphanList);
    if (orphans.length) {
      const b = el("button", "n3-btn n3-btn-warn", "Mở 1 trong " + orphans.length + " note mồ côi của vùng");
      b.onclick = () => openPath(pick(orphans));
      body.appendChild(b);
    }
    return;
  }

  // --- Không chọn gì: bộ não này đang có gì, và nên làm gì tiếp ---
  if (!g) {
    const t = graph.total;
    kpi(grid, "note", t.notes);
    kpi(grid, "liên kết", t.links);
    kpi(grid, "mật độ", num(t.density));
    kpi(grid, "đã nối", pct(t.notes ? 1 - t.orphan / t.notes : 0),
        t.orphan > t.notes * 0.3 ? "warn" : "ok");

    // Tách riêng nhóm loại "profile" (hồ sơ có bộ tài liệu chuẩn cố định — luôn ít
    // note, liên kết chéo dày sẵn THEO CẤU TRÚC, vd mỗi nhân viên/sản phẩm một bộ hồ
    // sơ giống nhau) khỏi nhóm kiến thức thường (số note biến thiên, liên kết phải tự
    // tích luỹ). Gộp chung một bảng xếp hạng theo mật độ thì nhóm "profile" luôn thắng
    // áp đảo — không sai số liệu, chỉ là so sánh lập lờ hai thứ khác bản chất.
    const profileGroups = graph.groups.filter((x) => x.type === "profile" && x.stat.notes > 0);
    const knGroups = graph.groups.filter((x) => (x.type === "kn" || x.type === "hb") && x.stat.notes >= 2);

    if (profileGroups.length) {
      body.appendChild(el("div", "n3-sub", "Hồ sơ liên kết tốt nhất"));
      const topProfiles = [...profileGroups].sort((a, b) => b.stat.density - a.stat.density).slice(0, 3);
      for (const x of topProfiles) body.appendChild(rowGroup(x, ctx));
    }

    body.appendChild(el("div", "n3-sub", "Khái niệm & thực thể liên kết tốt nhất"));
    const topKn = [...knGroups].sort((a, b) => b.stat.density - a.stat.density).slice(0, 3);
    if (topKn.length) for (const x of topKn) body.appendChild(rowGroup(x, ctx));
    else body.appendChild(el("p", "n3-note", "Chưa có nhóm khái niệm/thực thể nào đủ note để xếp hạng."));

    body.appendChild(el("div", "n3-sub", "Việc nên làm tiếp"));

    if (profileGroups.length) {
      const weakProfiles = [...profileGroups].sort((a, b) => a.stat.density - b.stat.density).slice(0, 3);
      const weakOrphans = weakProfiles.flatMap((x) => x.stat.orphanList);
      if (weakOrphans.length) {
        body.appendChild(el("p", "n3-note",
          "3 hồ sơ liên kết yếu nhất: " + weakProfiles.map((x) => x.name).join(", ") +
          ". Các tài liệu trong một hồ sơ nên trỏ chéo nhau và ra những trang liên quan khác."));
        const b = el("button", "n3-btn n3-btn-warn", "Mở 1 tài liệu của hồ sơ yếu nhất");
        b.onclick = () => openPath(pick(weakOrphans));
        body.appendChild(b);
      }
    }

    const raw = graph.parts.find((x) => x.part === "cer");
    const rawUnused = raw ? raw.groups.flatMap((x) => x.stat.unusedList) : [];
    if (rawUnused.length) {
      body.appendChild(el("p", "n3-note",
        rawUnused.length + " nguồn trong tiểu não chưa trang nào trỏ tới — nạp về mà chưa tiêu hoá."));
      const b = el("button", "n3-btn n3-btn-warn", "Mở một nguồn chưa dùng");
      b.onclick = () => openPath(pick(rawUnused));
      body.appendChild(b);
    }

    const orphans = graph.nodes.filter((n) => n.deg === 0);
    if (orphans.length) {
      body.appendChild(el("p", "n3-note",
        orphans.length + " note chưa có một liên kết nào. Mật độ tăng bằng thói quen gõ [[ ]] lúc viết, không bằng việc đẻ thêm note."));
      const b = el("button", "n3-btn n3-btn-warn", "Mở một note mồ côi để nối ngay");
      b.onclick = () => openPath(pick(orphans).path);
      body.appendChild(b);
    }
    return;
  }

  const s = g.stat;

  // --- Hồ sơ: thư mục có bộ tài liệu chuẩn lặp lại (nhân sự, sản phẩm, khách hàng…) ---
  if (g.type === "profile") {
    kpi(grid, "tài liệu", s.notes);
    kpi(grid, "liên kết", s.deg);
    kpi(grid, "mật độ", num(s.density));
    kpi(grid, "đã nối", pct(s.coverage), s.coverage < 0.5 ? "warn" : "ok");

    if (s.hub) {
      const b = el("button", "n3-btn", "Mở trang tổng: " + g.name);
      b.onclick = () => openPath(s.hub.path);
      body.appendChild(b);
    }
    if (s.top.length) {
      body.appendChild(el("div", "n3-sub", "Tài liệu trong hồ sơ này"));
      for (const t of s.top) body.appendChild(rowNote(t, ctx));
    }
    if (s.orphan) {
      body.appendChild(el("p", "n3-note", s.orphan + " tài liệu trong hồ sơ này chưa liên kết ra ngoài — các tài liệu cùng hồ sơ nên trỏ sang nhau."));
      const b2 = el("button", "n3-btn n3-btn-warn", "Mở 1 trong " + s.orphan + " tài liệu mồ côi");
      b2.onclick = () => openPath(pick(s.orphanList));
      body.appendChild(b2);
    }
    return;
  }

  // --- Thư mục kiến thức ---
  if (g.type === "kn") {
    kpi(grid, "note", s.notes);
    kpi(grid, "liên kết", s.deg);
    kpi(grid, "mật độ", num(s.density));
    kpi(grid, "đã nối", pct(s.coverage), s.coverage < 0.7 ? "warn" : "ok");

    body.appendChild(el("div", "n3-sub", "Liên kết đi đâu"));
    const bar = el("div", "n3-bar");
    const inw = s.inDeg + s.outDeg ? (s.inDeg / (s.inDeg + s.outDeg)) * 100 : 0;
    const a = el("div", "n3-bar-a"); a.style.width = inw + "%";
    bar.appendChild(a); body.appendChild(bar);
    body.appendChild(el("p", "n3-note", "Trong nhóm " + s.inDeg + " · ra ngoài nhóm " + s.outDeg +
      (inw > 82 ? " — nhóm này đang khép kín, thử bắc cầu sang cụm khác." : "")));

    if (s.top.length) {
      body.appendChild(el("div", "n3-sub", "5 note trung tâm"));
      for (const t of s.top) body.appendChild(rowNote(t, ctx));
    }
    if (s.hub) {
      const b = el("button", "n3-btn", "Mở trang tổng: " + s.hub.base);
      b.onclick = () => openPath(s.hub.path);
      body.appendChild(b);
    }
    if (s.orphan) {
      const b = el("button", "n3-btn n3-btn-warn", "Mở 1 trong " + s.orphan + " note mồ côi");
      b.onclick = () => openPath(pick(s.orphanList));
      body.appendChild(b);
    }
    return;
  }

  // --- Hub chủ đề ---
  if (g.type === "hb") {
    kpi(grid, "trang hub", s.notes);
    kpi(grid, "liên kết", s.deg);
    kpi(grid, "toả TB", num(s.density));
    body.appendChild(el("p", "n3-note", "Hub là trang điều hướng của một cụm: nên trỏ RỘNG ra các trang con, không chứa nội dung riêng. Tạo concept mới mà quên thêm dòng vào hub thì trang đó mồ côi khỏi cụm dù index có liệt kê."));
    if (s.top.length) {
      body.appendChild(el("div", "n3-sub", "Hub toả mạnh nhất"));
      for (const t of s.top) body.appendChild(rowNote(t, ctx));
    }
    return;
  }

  // --- Nguyên liệu thô ---
  if (g.type === "rw") {
    const done = s.notes ? 1 - s.unused / s.notes : 0;
    kpi(grid, "nguồn", s.notes);
    kpi(grid, "liên kết", s.deg);
    kpi(grid, "đã tiêu hoá", pct(done), done < 0.4 ? "warn" : "ok");
    kpi(grid, "chưa dùng", s.unused, s.unused ? "warn" : "ok");
    body.appendChild(el("div", "n3-sub", "Tiến độ nạp nguồn"));
    const bar = el("div", "n3-bar");
    const a = el("div", "n3-bar-a"); a.style.width = (done * 100) + "%";
    bar.appendChild(a); body.appendChild(bar);
    body.appendChild(el("p", "n3-note", "“Đã tiêu hoá” = có ít nhất một trang khác trỏ tới. Nguồn nằm im mà không trang nào dẫn thì coi như chưa đọc."));
    if (s.unused) {
      const b = el("button", "n3-btn n3-btn-warn", "Mở một nguồn chưa dùng");
      b.onclick = () => openPath(pick(s.unusedList));
      body.appendChild(b);
    }
    return;
  }

  // --- Nhật ký ---
  if (g.type === "jr") {
    kpi(grid, "ngày đã viết", s.notes);
    kpi(grid, "liên kết", s.deg);
    kpi(grid, "mật độ", num(s.density));
    body.appendChild(el("p", "n3-note", "Nhật ký là nguyên liệu content. Ngày nào có chuyện kể được thì cân nhắc chuyển thành bài đăng Zalo hoặc content khác."));
    if (s.top.length) for (const t of s.top) body.appendChild(rowNote(t, ctx));
    return;
  }

  // --- Mẫu trang ---
  if (g.type === "tp") {
    kpi(grid, "mẫu", s.notes);
    body.appendChild(el("p", "n3-note", "Mẫu trang không cần liên kết — chúng là khuôn, không phải tri thức. Mồ côi ở đây là bình thường."));
    return;
  }

  // --- Điều hướng ---
  if (g.type === "nav") {
    kpi(grid, "trang", s.notes);
    kpi(grid, "liên kết", s.deg);
    body.appendChild(el("p", "n3-note", "Trang điều hướng nên trỏ rộng, không chứa nội dung riêng."));
    for (const t of s.top) body.appendChild(rowNote(t, ctx));
    return;
  }

  // --- Chưa phân loại ---
  kpi(grid, "note", s.notes);
  kpi(grid, "liên kết", s.deg);
  kpi(grid, "mồ côi", s.orphan, "warn");
  body.appendChild(el("p", "n3-note", "Những note này chưa khớp vùng nào trong bản đồ. Xếp chúng vào đúng thư mục, hoặc bổ sung quy tắc vùng trong plugin."));
  for (const t of s.top) body.appendChild(rowNote(t, ctx));
}

// ---------- Nội dung tab "Trọng tâm": note đáng đọc trước nhất, cho người mới vào não ----------
function renderHighlights(body, ctx) {
  const { graph, openPath } = ctx;
  const head = el("div", "n3-h");
  head.appendChild(el("span", "n3-h-t", "Trọng tâm"));
  head.appendChild(el("span", "n3-h-s", "liên kết nhiều nhất toàn não & hub từng vùng — đọc trước, hiểu nhanh"));
  body.appendChild(head);

  const gmapByKey = new Map(graph.groups.map((g) => [g.key, g]));
  const top = [...graph.nodes].sort((a, b) => b.deg - a.deg).slice(0, 15);

  body.appendChild(el("div", "n3-sub", "15 note liên kết nhiều nhất toàn não"));
  for (const n of top) {
    const g = gmapByKey.get(n.grp);
    const r = el("button", "n3-row");
    const dot = el("span", "n3-dot");
    if (g) dot.style.background = dotHsl(g);
    r.appendChild(dot);
    r.appendChild(el("span", "n3-row-n", n.base));
    r.appendChild(el("span", "n3-row-c", String(n.deg)));
    r.onclick = () => openPath(n.path);
    body.appendChild(r);
  }
  if (!top.length) body.appendChild(el("p", "n3-note", "Chưa có liên kết nào trong não."));

  body.appendChild(el("div", "n3-sub", "Hub từng vùng — note trung tâm nhất của vùng đó"));
  for (const p of graph.parts) {
    const inPart = graph.nodes.filter((n) => gmapByKey.get(n.grp)?.part === p.part);
    if (!inPart.length) continue;
    const hub = inPart.reduce((a, b) => (b.deg > a.deg ? b : a));
    const r = el("button", "n3-row");
    const dot = el("span", "n3-swatch");
    dot.style.background = "hsl(" + p.hue + ",80%,66%)";
    r.appendChild(dot);
    r.appendChild(el("span", "n3-row-n", PART_LABEL[p.part].split(" · ")[0] + " — " + hub.base));
    r.appendChild(el("span", "n3-row-c", String(hub.deg)));
    r.onclick = () => openPath(hub.path);
    body.appendChild(r);
  }
}

// ---------- Nội dung tab "Gần đây": note vừa tạo/sửa, thấy ngay đang cập nhật gì ----------
function renderRecent(body, ctx) {
  const { graph, openPath } = ctx;
  const head = el("div", "n3-h");
  head.appendChild(el("span", "n3-h-t", "Hoạt động gần đây"));
  head.appendChild(el("span", "n3-h-s", "note vừa tạo hoặc sửa, mới nhất trước"));
  body.appendChild(head);

  const now = Date.now();
  const sorted = [...graph.nodes].filter((n) => n.mtime).sort((a, b) => b.mtime - a.mtime);
  const grid = el("div", "n3-kpis");
  body.appendChild(grid);
  const dayMs = 86400000;
  kpi(grid, "hôm nay", sorted.filter((n) => now - n.mtime < dayMs).length);
  kpi(grid, "7 ngày qua", sorted.filter((n) => now - n.mtime < 7 * dayMs).length);

  body.appendChild(el("div", "n3-sub", "30 note vừa động tới gần nhất"));
  const gmapByKey = new Map(graph.groups.map((g) => [g.key, g]));
  for (const n of sorted.slice(0, 30)) {
    const g = gmapByKey.get(n.grp);
    const r = el("button", "n3-row");
    const dot = el("span", "n3-dot");
    if (g) dot.style.background = dotHsl(g);
    r.appendChild(dot);
    r.appendChild(el("span", "n3-row-n", n.base));
    r.appendChild(el("span", "n3-row-c", timeAgo(n.mtime, now)));
    r.onclick = () => openPath(n.path);
    body.appendChild(r);
  }
  if (!sorted.length) body.appendChild(el("p", "n3-note", "Chưa đọc được thời gian sửa của note nào."));
}

// ---------- Nội dung tab "Cầu nối": liên kết bắc ngang 2 nhóm khác nhau ----------
function renderBridges(body, ctx) {
  const { graph, openPath } = ctx;
  const head = el("div", "n3-h");
  head.appendChild(el("span", "n3-h-t", "Cầu nối liên vùng"));
  head.appendChild(el("span", "n3-h-s", "cặp nhóm có nhiều liên kết chéo nhất — tri thức đang được dùng chéo ra sao"));
  body.appendChild(head);

  const list = graph.crossLinks || [];
  const grid = el("div", "n3-kpis");
  body.appendChild(grid);
  kpi(grid, "cặp nhóm có cầu nối", list.length);
  kpi(grid, "liên kết chéo", list.reduce((s, c) => s + c.count, 0));

  body.appendChild(el("div", "n3-sub", "20 cầu nối dày nhất"));
  for (const c of list.slice(0, 20)) {
    const r = el("button", "n3-bridge");
    const row1 = el("div", "n3-bridge-r");
    const dotA = el("span", "n3-dot"); dotA.style.background = dotHsl(c.a);
    row1.appendChild(dotA);
    row1.appendChild(el("span", "n3-row-n", c.a.name));
    const row2 = el("div", "n3-bridge-r");
    const dotB = el("span", "n3-dot"); dotB.style.background = dotHsl(c.b);
    row2.appendChild(dotB);
    row2.appendChild(el("span", "n3-row-n", c.b.name));
    r.appendChild(row1);
    r.appendChild(row2);
    r.appendChild(el("span", "n3-bridge-c", c.count + (c.count > 1 ? " liên kết" : " liên kết")));
    r.onclick = () => ctx.select(c.a);
    body.appendChild(r);
  }
  if (!list.length) body.appendChild(el("p", "n3-note", "Chưa có liên kết nào bắc ngang hai nhóm khác nhau."));
}

function rowNote(t, ctx) {
  const r = el("button", "n3-row");
  r.appendChild(el("span", "n3-row-n", t.base));
  r.appendChild(el("span", "n3-row-c", String(t.deg)));
  r.onclick = () => ctx.openPath(t.path);
  return r;
}
function rowGroup(x, ctx) {
  const r = el("button", "n3-row");
  const dot = el("span", "n3-dot");
  dot.style.background = dotHsl(x);
  r.appendChild(dot);
  r.appendChild(el("span", "n3-row-n", x.name));
  r.appendChild(el("span", "n3-row-c", num(x.stat.density)));
  r.onclick = () => ctx.select(x);
  return r;
}

module.exports = { buildLeft, buildRight };
