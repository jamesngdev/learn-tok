# Quản lý chi tiêu bằng chat — thiết kế

Màn hình mới ở `/chi-tieu` trong app DailyTok: ghi chi tiêu bằng cách gõ tiếng
Việt tự nhiên, DeepSeek bóc tách thành từng khoản và ghi vào SQLite qua function
calling. Cùng ô chat đó cũng trả lời được câu hỏi thống kê.

## Mục tiêu

- Ghi một khoản chi nhanh hơn mọi app chi tiêu có form: gõ "trưa cơm 45k, gửi xe
  5k" là xong, không chọn danh mục, không bấm Lưu.
- Hỏi được bằng lời: "tháng này ăn uống bao nhiêu?", "tuần trước tiêu gì nhiều
  nhất?" — trả lời bằng số **chính xác**, không phải số model tự cộng.
- Luôn thấy mình đã tiêu gì hôm nay mà không phải mở thêm màn nào.

## Ngoài phạm vi

Ngân sách theo danh mục, cảnh báo vượt hạn mức, ghi thu nhập / số dư, báo cáo
tháng dạng biểu đồ, nhiều người dùng, xuất Excel. Lưu lịch sử chat vào DB.

## Quyết định đã chốt

| Điểm | Chốt |
|---|---|
| URL | `/chi-tieu`, có nút 💸 trên appbar của feed, có nút ← về feed |
| Ghi | Lưu thẳng vào DB, không xác nhận trước; sai thì bấm vào dòng để sửa/xoá |
| Danh mục | 10 danh mục seed sẵn, người dùng thêm/sửa/xoá được |
| Bố cục | Chia đôi: danh sách khoản chi ở trên, chat ở dưới |
| Kiến trúc | Function calling — DeepSeek tự gọi tool `add_expenses` / `query_expenses` / … |
| Lịch sử chat | Không lưu DB, chỉ trong React state |

## Nền tảng có sẵn

Next.js 15 App Router · better-sqlite3 (một file DB, dùng chung với crawler) ·
DeepSeek qua `openai` SDK (`baseURL: https://api.deepseek.com`, model
`deepseek-v4-flash`) · vitest · không có auth (app cá nhân, chạy trên personal
server) · giao diện "phone" một cột, tiếng Việt.

Function calling được DeepSeek hỗ trợ trên `deepseek-v4-flash`. Hai ràng buộc
lấy từ docs và đã tính vào thiết kế:

- `supportsToolChoice: false` — không ép được `tool_choice`, nên thiết kế không
  dựa vào nó. Muốn model trả lời bằng chữ thì gọi lại **không truyền `tools`**.
- `requiresAssistantContentForToolCalls: true` — message assistant mang
  `tool_calls` phải có field `content` (chuỗi rỗng cũng được) khi gửi lại.

## Dữ liệu

Nối vào `MIGRATION` trong `src/lib/db.ts` (`CREATE TABLE IF NOT EXISTS`, không
cần migration tool):

```sql
CREATE TABLE IF NOT EXISTS expense_categories (
  name       TEXT PRIMARY KEY,
  emoji      TEXT NOT NULL DEFAULT '',
  sort       INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS expenses (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  amount     INTEGER NOT NULL,   -- VND, số nguyên
  category   TEXT NOT NULL,
  note       TEXT NOT NULL DEFAULT '',
  spent_on   TEXT NOT NULL,      -- YYYY-MM-DD theo Asia/Ho_Chi_Minh
  created_at TEXT NOT NULL,      -- ISO
  source     TEXT NOT NULL DEFAULT 'chat'  -- 'chat' | 'manual'
);
CREATE INDEX IF NOT EXISTS idx_expenses_day ON expenses (spent_on DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_cat ON expenses (category, spent_on);
```

`amount` là INTEGER VND: tiền lẻ VND không tồn tại, và float thì cộng dồn sinh
sai số. `category` là tên danh mục dạng text (không phải FK) — xoá danh mục
không được làm mất khoản chi.

Seed bằng `INSERT OR IGNORE`: Ăn uống 🍜 · Di chuyển 🛵 · Nhà ở 🏠 · Hóa đơn 🧾 ·
Mua sắm 🛍️ · Sức khoẻ 💊 · Giải trí 🎬 · Học tập 📚 · Con cái 🧒 · Khác 📦.

## Bộ tool

| Tool | Tham số | Trả về |
|---|---|---|
| `add_expenses` | `items[]: {amount, category, note, spent_on?}` | khoản đã ghi kèm `id`, `today_total`, `month_total` |
| `query_expenses` | `period` \| `from`+`to`, `category?`, `group_by`, `limit?` | `{total, count, rows[]}` — số do SQL tính |
| `update_expense` | `id`, `amount?`, `category?`, `note?`, `spent_on?` | khoản sau khi sửa |
| `delete_expense` | `id` | `{deleted, ...}` |
| `add_category` | `name`, `emoji?` | danh sách danh mục sau khi thêm |

Hai việc model **không** được làm, vì đây là hai chỗ LLM sai nhiều nhất:

1. **Số học.** `query_expenses` trả về tổng đã `SUM()` trong SQL. Model chỉ diễn
   giải câu chữ quanh con số.
2. **Số học ngày tháng.** `period` là enum — `today`, `yesterday`, `this_week`,
   `this_month`, `last_month`, `last_7_days`, `last_30_days` — server quy ra
   khoảng ngày theo `Asia/Ho_Chi_Minh`. Model không cần biết hôm nay thứ mấy.

`group_by`: `"category"` (mỗi danh mục một dòng) · `"day"` (mỗi ngày một dòng) ·
`"none"` (từng khoản, để trả lời "khoản nào lớn nhất" và để có `id` mà sửa/xoá).

Validate trước khi ghi DB — sai thì trả `{error}` **cho model** chứ không insert:

- `amount` phải là số nguyên trong `[1, 1_000_000_000]`. Chặn cả trường hợp model
  hiểu "45k" thành `45`: nếu `amount < 1000` thì vẫn ghi nhưng đánh dấu
  `low_amount: true` trong kết quả để model tự xác nhận lại với người dùng.
- `category` khớp không phân biệt hoa/thường với danh mục hiện có; không khớp thì
  rơi về `"Khác"` và báo lại trong kết quả tool.
- `spent_on` phải đúng `YYYY-MM-DD`; thiếu thì mặc định hôm nay theo giờ VN.
- `note` cắt còn 200 ký tự.
- `id` không tồn tại → `{error: "không tìm thấy khoản chi id=…"}`.

## Vòng lặp agent

`src/lib/expense-agent.ts`:

```
turns = [system(danh mục + ngày hôm nay + thứ), ...12 lượt gần nhất đã clip]
lặp tối đa MAX_TOOL_ROUNDS = 5:
  gọi DeepSeek (stream = true, tools = EXPENSE_TOOLS)
  ├─ text delta  → yield ngay ra client
  └─ tool_calls  → chạy tool trên SQLite
                   yield event tool ra client
                   append assistant(tool_calls, content: "") + role:"tool"
                   lặp tiếp
  không có tool_calls → xong
vòng cuối: gọi KHÔNG truyền tools → model buộc trả lời bằng chữ
```

Vòng lặp nhận hàm stream và tool executor qua tham số (dependency injection) nên
test được mà không chạm mạng — cùng cách `src/lib/chat.ts` tách hàm thuần khỏi
route. Giới hạn lượt/độ dài dùng lại `MAX_TURNS = 12`, `MAX_MESSAGE_CHARS = 2000`.

`src/lib/deepseek.ts` thêm `deepseekToolStream(messages, tools, opts)`: async
generator yield `{type: "text", delta}` | `{type: "tool_calls", calls}`, tự gom
`delta.tool_calls` theo `index` (tên tool và `arguments` đến rải rác nhiều chunk).

## Giao thức stream

`POST /api/expenses/chat` trả NDJSON (`text/plain`, mỗi dòng một JSON object):

```
{"t":"text","d":"Tháng này bạn "}
{"t":"tool","name":"add_expenses","result":{...}}
{"t":"error","m":"Không gọi được DeepSeek"}
```

Dùng NDJSON thay vì plain text như knowledge chat vì client cần hai tín hiệu có
cấu trúc: vẽ thẻ "✓ đã ghi", và **refetch danh sách + tổng**. Refetch (thay vì
tự cập nhật state từ kết quả tool) giữ UI luôn đúng bằng DB, kể cả khi model gọi
ba tool trong một lượt.

Lỗi xảy ra sau khi status đã 200 thì báo in-band bằng event `error` — giống cách
route knowledge chat đang làm.

## API

| Route | Việc |
|---|---|
| `POST /api/expenses/chat` | body `{messages}`, trả stream NDJSON |
| `GET /api/expenses?day=YYYY-MM-DD` | `{day, items[], day_total, month_total}` |
| `POST /api/expenses` | thêm tay một khoản |
| `PATCH /api/expenses/[id]` | sửa |
| `DELETE /api/expenses/[id]` | xoá |
| `GET/POST /api/expenses/categories` | xem / thêm danh mục |
| `DELETE /api/expenses/categories?name=` | xoá danh mục, dồn khoản chi về "Khác" |

Không auth (app cá nhân, không mở port ra ngoài) — đúng như mọi route hiện có.
`DEEPSEEK_API_KEY` chỉ ở server env, không lộ ra browser.

## Giao diện

```
┌────────────────────┐
│ ←  Chi tiêu   120k │   appbar: về feed + tổng hôm nay
├────────────────────┤
│ ‹   27/07   ›   ⚙ │   đổi ngày + mở sheet danh mục
│ 🍜 Cơm trưa    45k │   bấm một dòng → sheet sửa/xoá
│ 🛵 Gửi xe       5k │
│ ⛽ Đổ xăng     70k │
│ ＋ thêm tay        │
│ ───────────────── │
│ Tháng này:  4.5tr  │
├────────────────────┤
│    trưa cơm 45k    │   chat
│ ✓ đã ghi Cơm trưa  │
├────────────────────┤
│ [Ghi chi tiêu…]  ↑ │
└────────────────────┘
```

Nửa trên cao ~42%, cuộn riêng; chat cuộn riêng ở nửa dưới. Composer dính đáy,
Enter để gửi (Shift+Enter xuống dòng) — cùng hành vi `KnowledgeChat`.

Component:

- `ExpenseScreen` (client) — chủ state: ngày đang xem, danh sách, tổng, danh
  mục, hàm `refresh()`. Truyền xuống hai nửa.
- `ExpenseList` — nửa trên, thuần render + callback.
- `ExpenseChat` — nửa dưới, đọc NDJSON, gọi `refresh()` khi có event `tool`.
- `ExpenseEditSheet` — bottom sheet thêm/sửa/xoá một khoản.
- `CategorySheet` — thêm/xoá danh mục, đổi emoji.

Mỗi component một việc, giao tiếp qua props tường minh; không component nào tự
fetch ngoài phần việc của nó (trừ `ExpenseChat` gọi route chat).

## File

```
src/lib/expenses.ts                        tầng DB thuần
src/lib/expense-date.ts                    todayInVN(), resolvePeriod()
src/lib/expense-tools.ts                   schema 5 tool + executor + validate
src/lib/expense-agent.ts                   system prompt + vòng lặp agent
src/lib/db.ts                              + 2 bảng, + seed danh mục
src/lib/deepseek.ts                        + deepseekToolStream()
src/utils/format.ts                        + formatVnd(), formatVndShort()
src/app/chi-tieu/page.tsx                  server component
src/app/api/expenses/chat/route.ts
src/app/api/expenses/route.ts
src/app/api/expenses/[id]/route.ts
src/app/api/expenses/categories/route.ts
src/components/ExpenseScreen.tsx
src/components/ExpenseList.tsx
src/components/ExpenseChat.tsx
src/components/ExpenseEditSheet.tsx
src/components/CategorySheet.tsx
src/components/Feed.tsx                    + nút 💸 trên appbar
src/app/globals.css                        + block CSS màn chi tiêu
```

## Khi có lỗi

| Tình huống | Xử lý |
|---|---|
| DeepSeek chết / hết quota | event `error` → bubble "Không gọi được DeepSeek, thử lại nhé". Nút **＋ thêm tay** luôn có nên không bao giờ bị kẹt |
| Model bịa tên danh mục | rơi về "Khác", báo lại trong kết quả tool để model nói với người dùng |
| `arguments` không parse được JSON | trả `{error}` cho model, nó thử lại trong cùng vòng lặp (vẫn tính vào 4 vòng) |
| Model gọi tool mãi không dừng | vòng thứ 4 gọi không truyền `tools` → buộc trả lời bằng chữ |
| Người dùng gõ câu không liên quan | model trả lời bình thường bằng chữ, không gọi tool |
| Client mất mạng giữa stream | `AbortController` như `KnowledgeChat`; khoản đã ghi vẫn nằm trong DB, `refresh()` lần sau thấy |
| Model viết tool call ra thành **text** (`<｜｜DSML｜｜tool_calls>…`) | `TextGate` cắt câu trả lời tại chỗ markup bắt đầu — markup không lên UI và cũng không được nhồi lại vào context vòng sau |
| Model trả lời hai lần trong một lượt (nói → gọi tool → nói) | chèn `\n\n` giữa hai đoạn, tránh dán liền thành một câu |

Hai lỗi dưới đây phát hiện khi gọi DeepSeek thật, đã sửa và có test:

1. **Danh mục kèm emoji không khớp.** System prompt liệt kê `🧾 Hóa đơn` → model
   trả lại đúng chuỗi đó → so tên thất bại → khoản chi rơi vào "Khác", rồi model
   đốt thêm 2 vòng tool để tự "sửa". Sửa hai đầu: prompt chỉ liệt kê **tên**, và
   `resolveCategory` bỏ emoji trước khi so.
2. **Markup tool call lọt ra text.** Hết vòng tool mà model vẫn muốn gọi tool thì
   nó viết luôn `<｜｜DSML｜｜tool_calls>` ra như văn bản. Thêm `TextGate`, và nâng
   `MAX_TOOL_ROUNDS` 4 → 5 cho các chuỗi nhiều bước (query → update → xác nhận).

## Test

Theo pattern sẵn có (`:memory:` DB + `vi.mock("@/lib/server-db")`):

- `tests/lib/expenses.test.ts` — insert/list theo ngày, tổng ngày & tháng,
  `sumByCategory`, update, delete, xoá danh mục thì dồn về "Khác".
- `tests/lib/expense-date.test.ts` — từng `period`, biên tháng/năm, và mốc UTC
  17:00 phải ra ngày hôm sau theo giờ VN.
- `tests/lib/expense-tools.test.ts` — validate `amount`, khớp danh mục không
  phân biệt hoa/thường, `id` không tồn tại, cắt `note`.
- `tests/lib/expense-agent.test.ts` — stream giả: gọi tool → kết quả feed lại →
  text cuối stream ra; cắt vòng lặp ở vòng 4; `arguments` lỗi.
- `tests/api/expenses.test.ts` — GET/POST/PATCH/DELETE.
- `tests/api/expenses-chat.test.ts` — mock deepseek, assert đúng chuỗi event
  NDJSON.

## Deploy

Không có gì mới: cùng image, cùng file SQLite (bảng tự tạo khi app khởi động),
cùng `DEEPSEEK_API_KEY`. Chỉ cần build lại và `docker compose up -d` trên
personal server.
