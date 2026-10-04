const { Plugin, ItemView, PluginSettingTab, Setting, Notice } = require("obsidian");
const THREE = require("three");
const { PARTS, partGeometry, latticeSegments, glowTexture, hsl } = require("./geom.js");
const { PART_HUE, STARTER_PRESETS } = require("./regions.js");
const { buildGraph } = require("./graph.js");
const { buildLeft, buildRight } = require("./panels.js");

const VIEW_TYPE = "bo-nao-3d-view";
const BG = 0x05070d;
const VER = "1.0.0";   // hiện ở dòng đáy để biết chắc bản nào đang chạy

// Ba nấc chất lượng. dpr = tỷ lệ điểm ảnh, lat = độ dày lưới vỏ, maxEdges = trần số dây.
const QUALITY = {
  cao:     { dpr: 2.0, lat: 1.00, maxEdges: 14000, skin: true,  label: "Cao" },
  canbang: { dpr: 1.5, lat: 1.00, maxEdges: 9000,  skin: true,  label: "Cân bằng" },
  nhe:     { dpr: 1.0, lat: 0.70, maxEdges: 5000,  skin: false, label: "Nhẹ" },
};
const STEP_DOWN = { cao: "canbang", canbang: "nhe", nhe: null };

const DEFAULTS = {
  nodeScale: 1.0,
  spread: 1.0,
  shellOpacity: 0.135,
  linkOpacity: 0.055,
  autoSpin: true,
  quality: "auto",   // auto | cao | canbang | nhe
  regionRules: [],   // [{pre, part, type, name, indexName?}] — khai báo trong Settings
};

class BrainView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.sel = null;
    this.selPart = null;
    this.raf = null;
  }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return "Bộ Não 3D"; }
  getIcon() { return "brain"; }

  async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass("n3-root");
    this.host = this.contentEl.createDiv({ cls: "n3-host" });
    this.q = this.plugin.settings.quality === "auto" ? "canbang" : this.plugin.settings.quality;

    // Khi Obsidian khởi động, nó khôi phục tab này TRƯỚC khi quét xong vault.
    // Dựng lúc đó thì getMarkdownFiles() trả về 0 note — đồ thị rỗng, khung đen.
    // Đợi bố cục sẵn sàng, rồi đợi thêm metadataCache báo đã phân giải xong liên kết.
    const dungKhiSanSang = () => {
      const chay = () => {
        try { this.build(); } catch (e) { this.showError(e); }
      };
      if (this.app.vault.getMarkdownFiles().length > 0) { chay(); return; }
      this.host.empty();
      this.host.createDiv({ cls: "n3-wait", text: "Đang đợi Obsidian quét xong vault…" });
      const xong = () => { this.host.empty(); chay(); };
      this.registerEvent(this.app.metadataCache.on("resolved", xong));
      window.setTimeout(() => { if (!this.renderer) xong(); }, 4000);   // phòng khi sự kiện không bắn
    };
    this.app.workspace.onLayoutReady(dungKhiSanSang);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.host);

    const relayout = () => this.resize();
    this.registerEvent(this.app.workspace.on("resize", relayout));
    this.registerEvent(this.app.workspace.on("layout-change", relayout));
    this.registerEvent(this.app.workspace.on("active-leaf-change", (leaf) => this.onActiveLeafChange(leaf)));
    this.registerDomEvent(document, "visibilitychange", relayout);
  }

  async onClose() { this.teardown(); this.contentEl.empty(); }

  teardown() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss?.();
      this.renderer.domElement.remove();
      this.renderer = null;
    }
    if (this.scene) {
      this.scene.traverse((o) => {
        o.geometry?.dispose?.();
        if (o.material) { o.material.map?.dispose?.(); o.material.dispose?.(); }
      });
      this.scene = null;
    }
  }

  // Khung đen câm thì không ai biết hỏng ở đâu. Lỗi nào cũng phải hiện ra chữ.
  showError(e) {
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; }
    this.host.empty();
    const box = this.host.createDiv({ cls: "n3-err" });
    box.createEl("div", { cls: "n3-err-t", text: "Bộ Não 3D dựng không xong" });
    box.createEl("div", { cls: "n3-err-m", text: String(e && e.message ? e.message : e) });

    const info = [];
    try { info.push("số note markdown: " + this.app.vault.getMarkdownFiles().length); } catch (_) {}
    try {
      const cv = document.createElement("canvas");
      const gl = cv.getContext("webgl2") || cv.getContext("webgl");
      info.push("WebGL: " + (gl ? "tạo được" : "KHÔNG tạo được context"));
    } catch (err) { info.push("WebGL: lỗi — " + err.message); }
    info.push("phiên bản plugin: v" + VER);
    box.createEl("div", { cls: "n3-err-m", text: info.join("  ·  ") });

    if (e && e.stack) {
      const pre = box.createEl("pre", { cls: "n3-err-s" });
      pre.setText(String(e.stack).split("\n").slice(0, 8).join("\n"));
    }
    const b = box.createEl("button", { cls: "n3-btn", text: "Thử dựng lại" });
    b.onclick = () => this.rebuild();
    console.error("[Bộ Não 3D]", e);
  }

  rebuild() {
    const keep = { yaw: this.yaw, pitch: this.pitch, dist: this.dist, sel: this.sel };
    this.teardown();
    if (this.ro) this.ro.disconnect();
    this.host.empty();
    try { this.build(keep); }
    catch (e) { this.showError(e); return; }
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.host);
  }

  // ------------------------------------------------------------------
  build(keep) {
    const S = this.plugin.settings;
    const Q = QUALITY[this.q] || QUALITY.canbang;

    if (!S.regionRules || !S.regionRules.length) {
      const box = this.host.createDiv({ cls: "n3-empty" });
      box.createEl("div", { text: "Chưa khai báo vùng nào.", cls: "n3-empty-t" });
      box.createEl("div", {
        text: "Vào Settings → Bộ Não 3D, chọn một mẫu khởi đầu hoặc tự viết quy tắc gán thư mục vào 6 vùng giải phẫu, rồi mở lại view này.",
      });
      const b = box.createEl("button", { cls: "n3-btn", text: "Mở Settings" });
      b.onclick = () => { this.app.setting.open(); this.app.setting.openTabById(this.plugin.manifest.id); };
      return;
    }

    const graph = buildGraph(this.app, { spread: S.spread, rules: S.regionRules });
    this.graph = graph;
    this.pathIndex = new Map(graph.nodes.map((n) => [n.path, n.i]));
    this.nowViewingIdx = null;

    if (!graph.nodes.length) {
      this.host.createDiv({ cls: "n3-empty", text: "Không có note nào khớp bản đồ vùng." });
      return;
    }

    const w = Math.max(320, this.host.clientWidth), h = Math.max(240, this.host.clientHeight);

    // antialias TẮT: khử răng cưa MSAA nhân số điểm ảnh phải tô lên nhiều lần,
    // mà các chấm phát sáng vốn đã mềm viền nên gần như không thấy khác biệt.
    // preserveDrawingBuffer BẮT BUỘC phải bật ở đây. Mặc định nó tắt, nghĩa là trình
    // duyệt được phép vứt nội dung canvas ngay sau khi hiển thị xong. Plugin này chỉ
    // vẽ lại khi có thay đổi (để GPU nghỉ), nên những khung không vẽ sẽ lộ ra bộ nhớ
    // rác — chính là mảng sáng nhấp nháy đè lên bộ não.
    const renderer = new THREE.WebGLRenderer({
      antialias: false, alpha: false, preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(Q.dpr, window.devicePixelRatio || 1));
    renderer.setSize(w, h);
    renderer.setClearColor(BG, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = "n3-canvas";
    this.host.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(BG, 0.055);
    const camera = new THREE.PerspectiveCamera(48, w / h, 0.05, 100);
    this.scene = scene; this.camera = camera;
    const root = new THREE.Group();
    scene.add(root);

    // ---------- vỏ: mỗi thuỳ một màu riêng, vẫn gộp về MỘT lệnh vẽ ----------
    // Màu nằm ở từng đỉnh (vertexColors) nên sáu khối sáu màu mà GPU chỉ vẽ một lần.
    const latt = [], lattCol = [];
    this.partColor = {};
    for (const key in PARTS) {
      const [h0, h1] = PART_HUE[key] || [200, 200];
      const c = hsl((h0 + h1) / 2, 0.80, 0.66);
      this.partColor[key] = c;
      const seg = latticeSegments(PARTS[key], Q.lat);
      latt.push(...seg);
      for (let i = 0; i < seg.length / 3; i++) lattCol.push(c.r, c.g, c.b);
    }
    const shellGeo = new THREE.BufferGeometry();
    shellGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(latt), 3));
    shellGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(lattCol), 3));
    this.shell = new THREE.LineSegments(shellGeo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: S.shellOpacity,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    root.add(this.shell);
    this.shellSegs = latt.length / 6;
    this.shellBase = new Float32Array(lattCol);
    this.shellPartOf = [];                       // mỗi đỉnh thuộc thuỳ nào, để lấy nét
    for (const key in PARTS) {
      const n = latticeSegments(PARTS[key], Q.lat).length / 3;
      for (let i = 0; i < n; i++) this.shellPartOf.push(key);
    }

    // ---------- lớp da mờ, cũng nhuộm theo thuỳ (bỏ ở nấc Nhẹ) ----------
    if (Q.skin) {
      for (const key in PARTS) {
        root.add(new THREE.Mesh(partGeometry(PARTS[key]), new THREE.MeshBasicMaterial({
          color: this.partColor[key], transparent: true, opacity: 0.045,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
        })));
      }
    }

    // ---------- chấm ----------
    const N = graph.nodes.length;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    const psz = new Float32Array(N), dimA = new Float32Array(N).fill(1);
    const activeA = new Float32Array(N);
    const gmap = new Map(graph.groups.map((g) => [g.key, g]));
    this.gmap = gmap;

    graph.nodes.forEach((n, i) => {
      pos.set(n.pos, i * 3);
      const g = gmap.get(n.grp);
      const light = 0.46 + 0.30 * Math.min(1, Math.sqrt(n.deg) / 5);
      const c = hsl(g.hue, g.sat ?? 0.88, n.deg === 0 ? 0.34 : light);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      psz[i] = (5.5 + Math.min(18, Math.sqrt(n.deg) * 4.2)) * S.nodeScale;
    });

    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    pg.setAttribute("acolor", new THREE.BufferAttribute(col, 3));
    pg.setAttribute("psize", new THREE.BufferAttribute(psz, 1));
    pg.setAttribute("dimf", new THREE.BufferAttribute(dimA, 1));
    pg.setAttribute("nowv", new THREE.BufferAttribute(activeA, 1));

    // LƯU Ý: mọi biến dùng trong công thức GLSL phải có dòng `uniform`/`attribute`
    // khai báo đúng kiểu TRONG CHÍNH chuỗi shader này. Khai báo `uniforms:{...}` ở
    // JS không tự sinh ra khai báo GLSL — thiếu một cái là chương trình không biên
    // dịch được, GPU từ chối useProgram ở MỌI khung hình, và hậu quả nhìn thấy là
    // mảng hình chữ nhật trắng/đổi màu liên tục — rất dễ nhầm là lỗi CSS/compositor.
    const pmat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: glowTexture() }, uH: { value: h }, uTime: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `
        uniform float uH;
        uniform float uTime;
        attribute vec3 acolor; attribute float psize; attribute float dimf; attribute float nowv;
        varying vec3 vCol; varying float vDim; varying float vActive;
        void main(){
          vCol = acolor; vDim = dimf; vActive = nowv;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float pulse = 1.0 + nowv * (0.55 + 0.45 * sin(uTime * 5.2));
          gl_PointSize = psize * pulse * (uH / 700.0) * (3.6 / max(0.3, -mv.z)) * (0.55 + 0.45 * dimf);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uMap;
        varying vec3 vCol; varying float vDim; varying float vActive;
        void main(){
          vec4 t = texture2D(uMap, gl_PointCoord);
          if (t.a < 0.02) discard;
          vec3 col = mix(vCol, vec3(1.0), vActive * 0.55);
          gl_FragColor = vec4(col, t.a * (0.10 + 0.90 * vDim));
        }`,
    });
    this.points = new THREE.Points(pg, pmat);
    this.pmat = pmat;
    root.add(this.points);

    // ---------- dây: ưu tiên cạnh nối note quan trọng khi phải cắt bớt ----------
    let edges = graph.edges;
    if (edges.length > Q.maxEdges) {
      edges = [...edges]
        .sort((a, b) => (graph.nodes[b[0]].deg + graph.nodes[b[1]].deg) - (graph.nodes[a[0]].deg + graph.nodes[a[1]].deg))
        .slice(0, Q.maxEdges);
    }
    const lp = new Float32Array(edges.length * 6), lc = new Float32Array(edges.length * 6);
    edges.forEach((e, k) => {
      const a = graph.nodes[e[0]], b = graph.nodes[e[1]];
      lp.set(a.pos, k * 6); lp.set(b.pos, k * 6 + 3);
      const ca = gmap.get(a.grp), cb = gmap.get(b.grp);
      const c1 = hsl(ca.hue, ca.sat ?? 0.88, 0.62), c2 = hsl(cb.hue, cb.sat ?? 0.88, 0.62);
      lc.set([c1.r, c1.g, c1.b, c2.r, c2.g, c2.b], k * 6);
    });
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.BufferAttribute(lp, 3));
    lg.setAttribute("color", new THREE.BufferAttribute(lc, 3));
    this.lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: S.linkOpacity,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    root.add(this.lines);
    this.linkBase = lc.slice(); this.edgesUsed = edges;

    // ---------- bảng ----------
    const overlay = this.host.createDiv({ cls: "n3-overlay" });
    const ctx = {
      graph,
      openPath: (p) => this.app.workspace.openLinkText(p, "", false),
      select: (g) => this.select(g),
    };
    this.leftUI = buildLeft(overlay, graph, (g) => this.select(g), (p) => this.selectPart(p));
    this.rightUI = buildRight(overlay, ctx);
    this.rightUI.render(null);

    // Khung hẹp thì hai bảng chồng lên nhau che kín não — cho mở từng cái một.
    const tabs = overlay.createDiv({ cls: "n3-tabs" });
    this.tabL = tabs.createEl("button", { cls: "n3-tab", text: "Nhóm" });
    this.tabR = tabs.createEl("button", { cls: "n3-tab", text: "Phân tích" });
    this.panelL = overlay.querySelector(".n3-left");
    this.panelR = overlay.querySelector(".n3-right");
    this.openPanel = null;
    this.tabL.onclick = () => { this.openPanel = this.openPanel === "L" ? null : "L"; this.applyPanels(); };
    this.tabR.onclick = () => { this.openPanel = this.openPanel === "R" ? null : "R"; this.applyPanels(); };
    this.tip = this.host.createDiv({ cls: "n3-tip" });
    this.tip.style.display = "none";
    this.legend = overlay.createDiv({ cls: "n3-legend" });

    // Thanh "Đang xem" — ghim ở trên, bấm vào thì lấy nét nhóm của note đó.
    this.nowBadge = overlay.createDiv({ cls: "n3-now" });
    this.nowBadge.style.display = "none";

    // ---------- trạng thái ----------
    this.yaw = keep?.yaw ?? 0.42;
    this.pitch = keep?.pitch ?? -0.12;
    this.dist = keep?.dist ?? 4.4;
    this.idle = 0; this.last = performance.now();
    this.lastDraw = 0;
    this.fSum = 0; this.fCnt = 0; this.fps = 0; this.fWin = 0;
    this.bindInput(renderer.domElement);
    this.resize();
    this.updateLegend();
    if (keep?.sel) { const g = graph.groups.find((x) => x.key === keep.sel.key); if (g) this.select(g); }
    this.onActiveLeafChange(this.app.workspace.activeLeaf);
    this.loop();
  }

  updateLegend() {
    const q = QUALITY[this.q];
    const auto = this.plugin.settings.quality === "auto" ? " tự chỉnh" : "";
    // fps = 0 nghĩa là đang KHÔNG vẽ (đúng thiết kế), không phải hỏng — nói rõ ra.
    const rate = this.fps ? this.fps + " hình/giây" : "đang nghỉ, không vẽ";
    this.legend.setText(
      "kéo để xoay · lăn để phóng · bấm chấm để mở note   —   v" + VER +
      " · " + rate + " · " + q.label + auto +
      " · " + this.edgesUsed.length + "/" + this.graph.edges.length + " dây");
  }

  // ------------------------------------------------------------------
  // "Đang xem" — note đang mở ở leaf khác tự sáng lên trên hình não.
  onActiveLeafChange(leaf) {
    this.resize();
    if (!this.graph || !this.pathIndex) return;
    try {
      if (leaf && leaf.view === this) return;   // đang bấm trong chính bộ não — giữ nguyên
      const file = leaf?.view?.file;
      this.setNowViewing(file ? file.path : null);
    } catch (_) { /* leaf không có file (vd trang Settings) — bỏ qua */ }
  }

  setNowViewing(path) {
    if (!this.points) return;
    const idx = path != null ? this.pathIndex.get(path) : undefined;
    const prev = this.nowViewingIdx;
    if (idx === prev) return;
    const act = this.points.geometry.attributes.nowv;
    if (prev != null) act.array[prev] = 0;
    if (idx != null) act.array[idx] = 1;
    act.needsUpdate = true;
    this.nowViewingIdx = idx ?? null;
    this.updateNowBadge();
  }

  updateNowBadge() {
    if (!this.nowBadge) return;
    if (this.nowViewingIdx == null) { this.nowBadge.style.display = "none"; return; }
    const n = this.graph.nodes[this.nowViewingIdx];
    const g = this.gmap.get(n.grp);
    this.nowBadge.empty();
    this.nowBadge.style.display = "flex";
    const dot = this.nowBadge.createSpan({ cls: "n3-dot" });
    dot.style.background = "hsl(" + g.hue + "," + ((g.sat ?? 0.85) * 100) + "%,62%)";
    this.nowBadge.createSpan({ cls: "n3-now-l", text: "Đang xem" });
    this.nowBadge.createSpan({ cls: "n3-now-t", text: n.base });
    this.nowBadge.onclick = () => this.select(g);
  }

  // ------------------------------------------------------------------
  bindInput(cv) {
    let drag = false, px = 0, py = 0, moved = 0, hoverTick = 0;
    const ray = new THREE.Raycaster();
    ray.params.Points.threshold = 0.035;
    const ndc = new THREE.Vector2();

    const hit = (ev) => {
      const r = cv.getBoundingClientRect();
      ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
      ndc.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(ndc, this.camera);
      const h = ray.intersectObject(this.points, false);
      return h.length ? this.graph.nodes[h[0].index] : null;
    };

    cv.addEventListener("pointerdown", (e) => {
      drag = true; moved = 0; px = e.clientX; py = e.clientY;
      cv.setPointerCapture(e.pointerId); this.idle = 0;
    });
    cv.addEventListener("pointermove", (e) => {
      this.idle = 0;
      if (drag) {
        const dx = e.clientX - px, dy = e.clientY - py;
        moved += Math.abs(dx) + Math.abs(dy); px = e.clientX; py = e.clientY;
        this.yaw += dx * 0.0055;
        this.pitch = Math.max(-1.25, Math.min(1.25, this.pitch + dy * 0.0045));
        return;
      }
      // dò chuột là phép chiếu tia trên hàng nghìn điểm — hạn 25ms/lần cho khỏi nghẽn
      const now = performance.now();
      if (now - hoverTick < 25) return;
      hoverTick = now;
      const n = hit(e);
      if (n) {
        const r = cv.getBoundingClientRect();
        this.tip.style.display = "block";
        this.tip.textContent = n.base + "  ·  " + n.deg + " liên kết";
        this.tip.style.left = (e.clientX - r.left + 14) + "px";
        this.tip.style.top = (e.clientY - r.top + 14) + "px";
        cv.style.cursor = "pointer";
      } else { this.tip.style.display = "none"; cv.style.cursor = "grab"; }
    });
    cv.addEventListener("pointerup", (e) => {
      drag = false;
      try { cv.releasePointerCapture(e.pointerId); } catch (_) {}
      if (moved < 5) { const n = hit(e); if (n) this.app.workspace.openLinkText(n.path, "", false); }
    });
    cv.addEventListener("pointerleave", () => { drag = false; this.tip.style.display = "none"; });
    cv.addEventListener("wheel", (e) => {
      e.preventDefault(); this.idle = 0;
      this.dist = Math.max(1.6, Math.min(11, this.dist * (1 + Math.sign(e.deltaY) * 0.09)));
    }, { passive: false });
  }

  // ------------------------------------------------------------------
  // Lấy nét cả một vùng giải phẫu: chấm, dây, VÀ vỏ ngoài của vùng đó cùng sáng lên.
  selectPart(p) {
    this.selPart = this.selPart && this.selPart.part === p.part ? null : p;
    this.sel = null;
    const key = this.selPart ? this.selPart.part : null;
    this.leftUI.mark(null, key);
    this.rightUI.render(this.selPart);
    this.applyFocus(null, key);
    if (this.narrow && this.selPart) { this.openPanel = "R"; this.applyPanels(); }
  }

  // Một chỗ duy nhất quyết định cái gì sáng, cái gì mờ.
  applyFocus(groupKey, partKey) {
    const dim = this.points.geometry.attributes.dimf;
    this.graph.nodes.forEach((n, i) => {
      const g = this.gmap.get(n.grp);
      const hit = !groupKey && !partKey
        ? true
        : groupKey ? n.grp === groupKey : g && g.part === partKey;
      dim.array[i] = hit ? 1 : 0.10;
    });
    dim.needsUpdate = true;

    const lcol = this.lines.geometry.attributes.color;
    this.edgesUsed.forEach((e, k) => {
      const a = this.graph.nodes[e[0]], b = this.graph.nodes[e[1]];
      let m = 1;
      if (groupKey) m = (a.grp === groupKey || b.grp === groupKey) ? 1 : 0.06;
      else if (partKey) {
        const pa = this.gmap.get(a.grp), pb = this.gmap.get(b.grp);
        m = ((pa && pa.part === partKey) || (pb && pb.part === partKey)) ? 1 : 0.06;
      }
      for (let j = 0; j < 6; j++) lcol.array[k * 6 + j] = this.linkBase[k * 6 + j] * m;
    });
    lcol.needsUpdate = true;

    // vỏ ngoài: thuỳ được chọn giữ màu, các thuỳ khác chìm xuống
    const scol = this.shell.geometry.attributes.color;
    const gOwner = groupKey ? this.gmap.get(groupKey) : null;
    const want = partKey || (gOwner ? gOwner.part : null);
    for (let i = 0; i < this.shellPartOf.length; i++) {
      const m = !want ? 1 : (this.shellPartOf[i] === want ? 1.25 : 0.14);
      for (let j = 0; j < 3; j++) scol.array[i * 3 + j] = Math.min(1, this.shellBase[i * 3 + j] * m);
    }
    scol.needsUpdate = true;
  }

  select(g) {
    this.sel = g && this.sel && g.key === this.sel.key ? null : g;
    this.selPart = null;
    const key = this.sel ? this.sel.key : null;
    this.leftUI.mark(key, null);
    this.rightUI.render(this.sel);
    this.applyFocus(key, null);
    if (this.narrow && this.sel) { this.openPanel = "R"; this.applyPanels(); }
  }

  // Khung hẹp thì hai bảng chồng nhau che kín não — chỉ cho hiện một bảng mỗi lúc.
  applyPanels() {
    if (!this.panelL) return;
    const n = this.narrow;
    this.panelL.classList.toggle("is-off", n && this.openPanel !== "L");
    this.panelR.classList.toggle("is-off", n && this.openPanel !== "R");
    this.tabL.classList.toggle("is-on", n && this.openPanel === "L");
    this.tabR.classList.toggle("is-on", n && this.openPanel === "R");
  }

  resize() {
    if (!this.renderer) return;
    const w = this.host.clientWidth, h = this.host.clientHeight;
    // Tab bị ẩn thì khung về 0. Bản trước vẫn nâng lên tối thiểu 320x240 rồi đặt vào
    // canvas — thế là canvas kẹt ở cỡ tí hon, quay lại tab thì phần còn lại của khung
    // là bộ nhớ chưa vẽ, hiện ra thành mảng chữ nhật. Ẩn thì đừng đụng gì cả.
    if (w < 2 || h < 2) return;
    this.vw = w; this.vh = h;
    this.narrow = w < 900;
    this.host.classList.toggle("is-narrow", this.narrow);
    this.applyPanels();
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.pmat.uniforms.uH.value = h;
  }

  // Hạ một nấc chất lượng khi khung hình đuối, chỉ khi người dùng để chế độ tự chỉnh.
  stepDown() {
    const next = STEP_DOWN[this.q];
    if (!next || this.plugin.settings.quality !== "auto") return false;
    this.q = next;
    this.rebuild();
    return true;
  }

  loop() {
    this.raf = requestAnimationFrame(() => this.loop());
    try { this.frame(); } catch (e) { this.showError(e); }
  }

  frame() {
    const now = performance.now(), dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;

    // khung ẩn thì không vẽ, nhưng đánh dấu để vẽ lại ngay khi hiện ra
    if (document.hidden || this.host.offsetParent === null) return;
    // Chốt chặn cuối: nếu khung đã đổi cỡ mà chưa ai báo, tự nhận ra ngay khung sau.
    if (this.host.clientWidth !== this.vw || this.host.clientHeight !== this.vh) this.resize();

    this.idle += dt;
    if (this.plugin.settings.autoSpin && this.idle > 2.6 && this.idle < 40) this.yaw += dt * 0.13;

    // VẼ ĐỀU MỖI KHUNG, không bỏ khung nào.
    // Bản trước chỉ vẽ khi có thay đổi để GPU nghỉ. Nhưng cảnh này chỉ tốn 1-3 ms
    // trên ngân sách 16,7 ms — tiết kiệm một thứ vốn không tốn gì, đổi lại canvas
    // có những khung không được vẽ và trình duyệt để lộ bộ nhớ cũ thành mảng nhấp
    // nháy. Trần 60 khung/giây là đủ mượt và vẫn chỉ dùng hết 1/5 ngân sách.
    if (now - this.lastDraw < 1000 / 60 - 1) return;
    const prevDraw = this.lastDraw;
    this.lastDraw = now;

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this.camera.position.set(
      Math.sin(this.yaw) * cp * this.dist,
      sp * this.dist + 0.05,
      Math.cos(this.yaw) * cp * this.dist);
    this.camera.lookAt(0, -0.12, -0.06);

    this.pmat.uniforms.uTime.value = now / 1000;

    const t0 = performance.now();
    this.renderer.render(this.scene, this.camera);

    // Hai con số khác nhau, đừng lẫn:
    //  cost = riêng việc vẽ tốn bao nhiêu mili giây (dùng để quyết định hạ chất lượng)
    //  fps  = thực tế mỗi giây vẽ được mấy khung (đếm khung trong một giây đồng hồ)
    this.fSum += performance.now() - t0;
    this.fCnt++;
    // Phải cộng khoảng cách giữa hai lần VẼ, không phải giữa hai nhịp màn hình.
    // Màn chạy 120 nhịp/giây mà ta chỉ vẽ mỗi nhịp thứ hai — lấy nhầm nhịp màn hình
    // thì con số bị gấp đôi, nên bản trước báo 116 trong khi trần là 60.
    this.fWin += prevDraw ? Math.min(0.5, (now - prevDraw) / 1000) : 1 / 60;
    if (this.fWin >= 1) {
      const cost = this.fSum / this.fCnt;
      this.fps = Math.round(this.fCnt / this.fWin);
      this.fSum = 0; this.fCnt = 0; this.fWin = 0;
      if (cost > 12 && this.stepDown()) return;
      this.updateLegend();
    }
  }
}

// ------------------------------------------------------------------
class BrainSettings extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const c = this.containerEl; c.empty();
    const S = this.plugin.settings;
    const save = async (rebuild) => { await this.plugin.saveData(S); if (rebuild) this.plugin.refresh(); };

    new Setting(c).setHeading().setName("Bản đồ vùng");
    c.createEl("p", {
      cls: "setting-item-description",
      text: "Mỗi vùng giải phẫu (6 khối trong hình não) cần biết thư mục nào của vault bạn thuộc về nó. Khai báo bằng một mảng JSON — mỗi phần tử là một quy tắc: pre (tiền tố đường dẫn, không có \"/\" ở cuối), part (cbL/cbR/tmpL/tmpR/cer/stem), type (kn/hb/rw/jr/tp/nav/profile — quyết định bảng phân tích hiện gì), name (tên hiển thị). Quy tắc khớp trước thắng, nên xếp quy tắc cụ thể lên trên quy tắc chung.",
    });

    new Setting(c).setName("Mẫu khởi đầu")
      .setDesc("Nạp một bộ quy tắc mẫu vào ô bên dưới rồi tự chỉnh lại cho đúng vault của bạn. Nạp mẫu sẽ GHI ĐÈ nội dung đang có trong ô.")
      .addDropdown((d) => {
        for (const key in STARTER_PRESETS) d.addOption(key, STARTER_PRESETS[key].label);
        d.setValue("trong");
        this._presetChoice = "trong";
        d.onChange((v) => { this._presetChoice = v; });
      })
      .addButton((b) => b.setButtonText("Nạp mẫu").onClick(() => {
        const preset = STARTER_PRESETS[this._presetChoice];
        if (!preset) return;
        this._rulesArea.value = JSON.stringify(preset.rules, null, 2);
      }));

    const rulesSetting = new Setting(c).setName("Quy tắc vùng (JSON)");
    rulesSetting.settingEl.style.display = "block";
    const rulesArea = document.createElement("textarea");
    rulesArea.className = "n3-rules-area";
    rulesArea.value = JSON.stringify(S.regionRules, null, 2);
    rulesSetting.controlEl.appendChild(rulesArea);
    this._rulesArea = rulesArea;

    new Setting(c)
      .addButton((b) => b.setButtonText("Lưu & dựng lại").setCta().onClick(async () => {
        let parsed;
        try { parsed = JSON.parse(rulesArea.value); }
        catch (e) { new Notice("JSON sai cú pháp: " + e.message); return; }
        if (!Array.isArray(parsed)) { new Notice("Phải là một mảng [...]"); return; }
        const validParts = new Set(["cbL", "cbR", "tmpL", "tmpR", "cer", "stem"]);
        for (const [i, r] of parsed.entries()) {
          if (!r || typeof r.pre !== "string" || !r.pre) { new Notice("Quy tắc #" + (i + 1) + " thiếu \"pre\""); return; }
          if (!validParts.has(r.part)) { new Notice("Quy tắc #" + (i + 1) + ' part phải là cbL/cbR/tmpL/tmpR/cer/stem, không phải "' + r.part + '"'); return; }
        }
        S.regionRules = parsed;
        await save(true);
        new Notice("Đã lưu " + parsed.length + " quy tắc vùng, đang dựng lại bộ não.");
      }));

    new Setting(c).setHeading().setName("Hiển thị");

    new Setting(c).setName("Chất lượng hiển thị")
      .setDesc("Giật thì hạ xuống Nhẹ. Tự chỉnh sẽ tự hạ nấc khi khung hình đuối.")
      .addDropdown((d) => d
        .addOptions({ auto: "Tự chỉnh", cao: "Cao", canbang: "Cân bằng", nhe: "Nhẹ" })
        .setValue(S.quality)
        .onChange(async (v) => { S.quality = v; await save(true); }));

    const slider = (name, desc, key, min, max, step) =>
      new Setting(c).setName(name).setDesc(desc).addSlider((s) =>
        s.setLimits(min, max, step).setValue(S[key]).setDynamicTooltip()
          .onChange(async (v) => { S[key] = v; await save(true); }));

    slider("Cỡ chấm", "Note trông loãng thì tăng lên", "nodeScale", 0.5, 2.2, 0.05);
    slider("Độ toả", "Giảm để các cụm đặc lại trong khối", "spread", 0.5, 1.8, 0.05);
    slider("Độ rõ của vỏ", "Vỏ não mờ quá thì tăng", "shellOpacity", 0.02, 0.35, 0.005);
    slider("Độ rõ của dây", "Rối mắt thì giảm", "linkOpacity", 0.01, 0.2, 0.005);

    new Setting(c).setName("Tự xoay khi rảnh tay")
      .setDesc("Mặc định bật: sau 2,6 giây rảnh tay hình tự quay, tự dừng sau 40 giây để đỡ hao pin. Tắt thì lúc không đụng chuột plugin ngừng vẽ hoàn toàn.")
      .addToggle((t) => t.setValue(S.autoSpin).onChange(async (v) => { S.autoSpin = v; await save(false); }));
  }
}

module.exports = class BrainPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULTS, await this.loadData());
    this.registerView(VIEW_TYPE, (leaf) => new BrainView(leaf, this));
    this.addRibbonIcon("brain", "Bộ Não 3D", () => this.open());
    this.addCommand({ id: "mo-bo-nao-3d", name: "Mở Bộ Não 3D", callback: () => this.open() });
    this.addSettingTab(new BrainSettings(this.app, this));
  }
  // KHÔNG gọi detachLeavesOfType ở đây. Obsidian đã khuyến cáo bỏ từ lâu và ở các
  // bản mới nó có thể không còn — gọi hàm không tồn tại lúc gỡ/nạp làm hỏng cả plugin.
  // Obsidian tự dọn view đã registerView khi plugin tắt.
  onunload() {}

  async open() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) { leaf = workspace.getLeaf(true); await leaf.setViewState({ type: VIEW_TYPE, active: true }); }
    workspace.revealLeaf(leaf);
  }
  refresh() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view instanceof BrainView) leaf.view.rebuild();
    }
  }
};
