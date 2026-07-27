import type { DB } from "./db";
import { PERIODS, isValidDay, resolvePeriod, todayInVN } from "./expense-date";
import {
  addCategory,
  addExpense,
  countRange,
  deleteExpense,
  getExpense,
  listCategories,
  listRange,
  resolveCategory,
  sumByCategory,
  sumByDay,
  totalRange,
  updateExpense,
  currentTotals,
  type Expense,
} from "./expenses";

/** VND. Below this a "45k"-style amount was probably taken literally as 45. */
const SUSPICIOUS_BELOW = 1000;
const MAX_AMOUNT = 1_000_000_000;
const MAX_ITEMS_PER_CALL = 20;

/**
 * The tools DeepSeek may call. Two things are deliberately kept away from the
 * model, because they are what LLMs get wrong most often:
 *   1. Arithmetic — `query_expenses` returns totals already SUM()-ed in SQL.
 *   2. Date arithmetic — `period` is an enum the server resolves to a range.
 */
export const EXPENSE_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "add_expenses",
      description:
        "Ghi một hoặc nhiều khoản chi vào sổ. Gọi tool này ngay khi người dùng " +
        "kể ra khoản đã chi, không cần hỏi lại để xác nhận.",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            description: "Danh sách khoản chi bóc tách được từ câu của người dùng.",
            items: {
              type: "object",
              properties: {
                amount: {
                  type: "integer",
                  description:
                    "Số tiền bằng VND, số nguyên. '45k' hoặc '45 nghìn' = 45000, " +
                    "'1tr2' hoặc '1.2 triệu' = 1200000.",
                },
                category: {
                  type: "string",
                  description: "Tên danh mục, phải chọn đúng một tên trong danh sách đã cho.",
                },
                note: {
                  type: "string",
                  description: "Mô tả ngắn, ví dụ 'Cơm trưa', 'Gửi xe', 'Đổ xăng'.",
                },
                spent_on: {
                  type: "string",
                  description: "Ngày chi dạng YYYY-MM-DD. Bỏ trống nếu là hôm nay.",
                },
              },
              required: ["amount", "category", "note"],
            },
          },
        },
        required: ["items"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_expenses",
      description:
        "Đọc số liệu chi tiêu đã tính sẵn. Luôn dùng tool này khi cần bất kỳ con số nào — " +
        "tuyệt đối không tự cộng trừ hay tự suy ra tổng.",
      parameters: {
        type: "object",
        properties: {
          period: {
            type: "string",
            enum: [...PERIODS],
            description: "Khoảng thời gian. Dùng cái này thay vì tự tính ngày.",
          },
          from: { type: "string", description: "Ngày bắt đầu YYYY-MM-DD (khi không dùng period)." },
          to: { type: "string", description: "Ngày kết thúc YYYY-MM-DD (khi không dùng period)." },
          category: { type: "string", description: "Chỉ tính một danh mục." },
          group_by: {
            type: "string",
            enum: ["category", "day", "none"],
            description:
              "'category' = tổng theo từng danh mục, 'day' = tổng theo từng ngày, " +
              "'none' = liệt kê từng khoản (kèm id, để sửa/xoá hoặc tìm khoản lớn nhất).",
          },
          limit: { type: "integer", description: "Số dòng tối đa khi group_by='none'. Mặc định 20." },
        },
        required: ["period", "group_by"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_expense",
      description:
        "Sửa một khoản chi đã ghi. Cần id — lấy id bằng query_expenses với group_by='none'.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "integer" },
          amount: { type: "integer", description: "Số tiền mới, VND." },
          category: { type: "string" },
          note: { type: "string" },
          spent_on: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "delete_expense",
      description: "Xoá một khoản chi đã ghi. Cần id.",
      parameters: {
        type: "object",
        properties: { id: { type: "integer" } },
        required: ["id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_category",
      description:
        "Thêm một danh mục mới. Chỉ gọi khi người dùng yêu cầu rõ ràng, " +
        "không tự thêm chỉ vì khoản chi không khớp danh mục nào.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          emoji: { type: "string", description: "Một emoji đại diện." },
        },
        required: ["name"],
      },
    },
  },
];

export type ToolResult = Record<string, unknown>;

/** Run one tool call against the DB. Never throws — errors go back to the model. */
export type ToolRunner = (name: string, args: Record<string, unknown>) => ToolResult;

interface AddedExpense extends Expense {
  /** Set when the category the model asked for did not exist. */
  category_fallback?: boolean;
  /** Set when the amount looks like a "45k" read literally as 45. */
  low_amount?: boolean;
}

function validateAmount(raw: unknown): { amount: number } | { error: string } {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return { error: "amount không phải số" };
  const amount = Math.round(n);
  if (amount < 1) return { error: "amount phải lớn hơn 0" };
  if (amount > MAX_AMOUNT) return { error: `amount vượt mức cho phép (${MAX_AMOUNT} VND)` };
  return { amount };
}

function addExpensesTool(db: DB, args: Record<string, unknown>, today: string): ToolResult {
  const raw = Array.isArray(args.items) ? args.items : [];
  if (raw.length === 0) return { error: "items rỗng — không có khoản nào để ghi" };
  if (raw.length > MAX_ITEMS_PER_CALL) {
    return { error: `mỗi lần chỉ ghi tối đa ${MAX_ITEMS_PER_CALL} khoản` };
  }

  const added: AddedExpense[] = [];
  const rejected: { input: unknown; error: string }[] = [];

  for (const item of raw as Record<string, unknown>[]) {
    const amount = validateAmount(item?.amount);
    if ("error" in amount) {
      rejected.push({ input: item, error: amount.error });
      continue;
    }
    const { category, matched } = resolveCategory(db, item?.category);
    const day = isValidDay(item?.spent_on) ? (item.spent_on as string) : today;
    const saved = addExpense(db, {
      amount: amount.amount,
      category,
      note: typeof item?.note === "string" ? item.note : "",
      spent_on: day,
      source: "chat",
    });
    const entry: AddedExpense = { ...saved };
    if (!matched) entry.category_fallback = true;
    if (saved.amount < SUSPICIOUS_BELOW) entry.low_amount = true;
    added.push(entry);
  }

  return {
    added,
    rejected: rejected.length ? rejected : undefined,
    ...currentTotals(db, today),
    note_for_model:
      added.some((a) => a.category_fallback) || added.some((a) => a.low_amount)
        ? "Có khoản bị đưa vào 'Khác' hoặc số tiền nhỏ bất thường — nói lại cho người dùng biết."
        : undefined,
  };
}

function queryExpensesTool(db: DB, args: Record<string, unknown>, today: string): ToolResult {
  const hasExplicit = isValidDay(args.from) && isValidDay(args.to);
  const range = hasExplicit
    ? { from: args.from as string, to: args.to as string, label: `${args.from} → ${args.to}` }
    : resolvePeriod(String(args.period ?? "this_month"), today);

  const category = typeof args.category === "string" && args.category.trim()
    ? resolveCategory(db, args.category).category
    : undefined;

  const groupBy = args.group_by === "category" || args.group_by === "day" ? args.group_by : "none";
  const total = totalRange(db, range.from, range.to, category);
  const count = countRange(db, range.from, range.to, category);

  let rows: unknown[];
  if (groupBy === "category") {
    rows = sumByCategory(db, range.from, range.to);
  } else if (groupBy === "day") {
    rows = sumByDay(db, range.from, range.to);
  } else {
    const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100);
    rows = listRange(db, range.from, range.to, limit)
      .filter((e) => !category || e.category === category)
      .map((e) => ({
        id: e.id,
        amount: e.amount,
        category: e.category,
        note: e.note,
        spent_on: e.spent_on,
      }));
  }

  return {
    period: range.label,
    from: range.from,
    to: range.to,
    category,
    total,
    count,
    group_by: groupBy,
    rows,
  };
}

/**
 * Build the tool runner bound to a DB. `today` is passed in so a single request
 * uses one consistent "today" even if it straddles midnight.
 */
export function makeToolRunner(db: DB, today: string = todayInVN()): ToolRunner {
  return (name, args) => {
    switch (name) {
      case "add_expenses":
        return addExpensesTool(db, args, today);

      case "query_expenses":
        return queryExpensesTool(db, args, today);

      case "update_expense": {
        const id = Number(args.id);
        if (!Number.isInteger(id)) return { error: "id không hợp lệ" };
        if (!getExpense(db, id)) return { error: `không tìm thấy khoản chi id=${id}` };
        const patch: Record<string, unknown> = {};
        if (args.amount !== undefined) {
          const amount = validateAmount(args.amount);
          if ("error" in amount) return { error: amount.error };
          patch.amount = amount.amount;
        }
        if (typeof args.category === "string") {
          patch.category = resolveCategory(db, args.category).category;
        }
        if (typeof args.note === "string") patch.note = args.note;
        if (isValidDay(args.spent_on)) patch.spent_on = args.spent_on;
        return { updated: updateExpense(db, id, patch), ...currentTotals(db, today) };
      }

      case "delete_expense": {
        const id = Number(args.id);
        if (!Number.isInteger(id)) return { error: "id không hợp lệ" };
        const gone = deleteExpense(db, id);
        if (!gone) return { error: `không tìm thấy khoản chi id=${id}` };
        return { deleted: gone, ...currentTotals(db, today) };
      }

      case "add_category": {
        const name = typeof args.name === "string" ? args.name.trim() : "";
        if (!name) return { error: "name rỗng" };
        const emoji = typeof args.emoji === "string" ? args.emoji : "";
        return { categories: addCategory(db, name, emoji) };
      }

      default:
        return { error: `tool không tồn tại: ${name}` };
    }
  };
}

/** Tool calls that change the ledger — the client refetches when it sees one. */
export const MUTATING_TOOLS = new Set([
  "add_expenses",
  "update_expense",
  "delete_expense",
  "add_category",
]);

export { listCategories };
