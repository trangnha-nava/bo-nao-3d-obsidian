# Bộ Não 3D (Obsidian Brain 3D)

Turns your vault into a glowing, rotatable 3D brain — six anatomical regions (two
hemispheres, two temporal lobes, cerebellum, brainstem), each note a point of light,
each link a thread between them. You decide which folders map to which region with
a small JSON rule list in Settings; the plugin builds the anatomy, the colors, and
the layout from that.

This is **not** a force-directed graph wearing a brain skin — the shape is a fixed
set of six ellipsoids with a procedurally wrinkled shell, and your notes are placed
*inside* the region they're assigned to. The graph structure of your vault never
produces a brain shape on its own; the anatomy is drawn first, your notes are
poured into it second.

**Interface language: Vietnamese.** Built for Vietnamese-speaking vault owners;
all panel labels, settings descriptions, and in-app text are in Vietnamese. The
code and this README are documented in both languages so non-Vietnamese-speaking
developers can still read and modify it.

**Desktop only** — not available on Obsidian mobile.

---

## Quick start

1. Install, enable the plugin.
2. Open **Settings → Bộ Não 3D**, pick a starter preset (or write your own), edit
   the rules to match your vault's folders, click **Lưu & dựng lại** (Save & rebuild).
3. Open the brain from the ribbon icon (🧠) or the command palette: "Mở Bộ Não 3D".

## Bản đồ vùng (region rules)

Mỗi quy tắc là một object JSON:

```json
{ "pre": "wiki/jobs/ke-toan", "part": "cbL", "type": "kn", "name": "Kế toán" }
```

- `pre` — tiền tố đường dẫn (không có `/` ở cuối). Note khớp nếu đường dẫn bằng
  đúng `pre`, hoặc bắt đầu bằng `pre + "/"`. Quy tắc nằm TRƯỚC trong mảng được ưu
  tiên khi nhiều quy tắc cùng khớp — xếp quy tắc cụ thể lên trên quy tắc chung.
- `part` — một trong 6 khối giải phẫu: `cbL`, `cbR` (hai bán cầu), `tmpL`, `tmpR`
  (hai thuỳ thái dương), `cer` (tiểu não), `stem` (thân não).
- `type` — quyết định bảng phân tích bên phải hiện gì khi chọn nhóm đó:
  - `kn` — thư mục kiến thức chung (mặc định hợp lý cho hầu hết trường hợp)
  - `hb` — trang hub/mục lục chủ đề (nhiều trang con, ít liên kết riêng)
  - `rw` — nguyên liệu thô, theo dõi "đã tiêu hoá" (có trang nào trỏ tới chưa)
  - `jr` — nhật ký theo ngày
  - `tp` — mẫu trang (không cần liên kết, mồ côi là bình thường)
  - `nav` — trang điều hướng (index, log)
  - `profile` — thư mục hồ sơ có bộ tài liệu chuẩn lặp lại (mỗi nhân viên/sản
    phẩm/khách hàng một bộ file giống nhau)
  - bất kỳ chuỗi khác → rơi về bảng "chưa phân loại"
- `name` — tên hiển thị trong các bảng.
- `indexName` (tuỳ chọn) — tên file (vd `"index.md"`) được coi là "trang tổng"
  của nhóm, hiện nút mở riêng.

Note không khớp quy tắc nào: nếu nằm ngay gốc vault (không có `/` trong đường dẫn)
thì xếp vào tiểu não dạng "ghi chú rời"; còn lại rơi vào "chưa phân loại" (vẫn
hiện trên hình, màu xám, để bạn biết cần thêm quy tắc).

Có 2 mẫu khởi đầu dựng sẵn (PARA, Zettelkasten đơn giản) để nạp rồi tự chỉnh,
hoặc bắt đầu từ mảng rỗng.

## Tính năng

- 6 khối giải phẫu, mỗi khối một dải màu riêng, các nhóm trong cùng khối rải
  sắc độ khác nhau trong dải đó
- Tự xoay khi rảnh tay (tắt được), kéo chuột để xoay thủ công, lăn để phóng to
- **Nhóm** — danh sách nhóm theo 6 vùng, có ô tìm nhanh để lọc khi vault lớn
- **Phân tích** — số liệu + gợi ý hành động theo từng nhóm/vùng đang chọn
- **Trọng tâm** — note liên kết nhiều nhất toàn vault & hub từng vùng
- **Gần đây** — note vừa tạo/sửa
- **Cầu nối** — cặp nhóm có liên kết bắc ngang nhiều nhất (tri thức dùng chéo)
- **Đang xem** — note đang mở ở pane khác tự sáng nhấp nháy trên hình não
- 3 nấc chất lượng (tự chỉnh theo khung hình/giây thực tế), chỉnh được cỡ chấm,
  độ toả, độ rõ vỏ/dây

## Why not a mobile version?

The render loop draws every frame continuously and the scene can hold thousands
of points and edges — acceptable on desktop GPUs, risky for mobile battery and
thermals. `isDesktopOnly` is set until this gets a mobile-specific render budget.

## Development

```bash
npm install
npx esbuild src/main.js --bundle --minify --format=cjs \
  --platform=browser --target=es2018 --external:obsidian \
  --outfile=dist/main.js
```

Copy `dist/main.js`, `manifest.json`, `styles.css` into
`<vault>/.obsidian/plugins/bo-nao-3d/` to test locally.

## License

MIT — see [LICENSE](LICENSE).
