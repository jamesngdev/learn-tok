"use client";
import type { DayView, Expense } from "@/lib/expenses";
import { addDays, weekdayVN } from "@/lib/expense-date";
import { formatDayShort, formatVnd, formatVndShort } from "@/utils/format";

/** Top half of /chi-tieu: one day's expenses, with the month total underneath. */
export function ExpenseList({
  view,
  today,
  onDay,
  onPick,
  onAdd,
}: {
  view: DayView;
  today: string;
  onDay: (day: string) => void;
  onPick: (e: Expense) => void;
  onAdd: () => void;
}) {
  const emoji = (name: string) =>
    view.categories.find((c) => c.name === name)?.emoji || "📦";

  return (
    <section className="xp-list" aria-label="Sổ chi tiêu">
      <div className="xp-daybar">
        <button
          type="button"
          className="xp-arrow"
          onClick={() => onDay(addDays(view.day, -1))}
          aria-label="Ngày trước"
        >
          ‹
        </button>
        <button
          type="button"
          className="xp-day"
          onClick={() => onDay(today)}
          title="Về hôm nay"
        >
          {view.day === today ? "Hôm nay" : weekdayVN(view.day)} · {formatDayShort(view.day)}
        </button>
        <button
          type="button"
          className="xp-arrow"
          onClick={() => onDay(addDays(view.day, 1))}
          disabled={view.day >= today}
          aria-label="Ngày sau"
        >
          ›
        </button>
      </div>

      <div className="xp-rows">
        {view.items.length === 0 && (
          <p className="xp-empty">
            Chưa có khoản nào. Gõ xuống dưới, ví dụ “trưa cơm 45k, gửi xe 5k”.
          </p>
        )}
        {view.items.map((e) => (
          <button key={e.id} type="button" className="xp-row" onClick={() => onPick(e)}>
            <span className="xp-emoji">{emoji(e.category)}</span>
            <span className="xp-note">
              {e.note || e.category}
              <small>{e.category}</small>
            </span>
            <span className="xp-amount">{formatVnd(e.amount)}</span>
          </button>
        ))}
        <button type="button" className="xp-manual" onClick={onAdd}>
          ＋ thêm tay
        </button>
      </div>

      <div className="xp-totals">
        <span>
          Ngày <b>{formatVnd(view.day_total)}</b>
        </span>
        <span>
          Tháng này <b>{formatVndShort(view.month_total)}</b>
        </span>
      </div>
    </section>
  );
}
