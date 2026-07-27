"use client";
import { useCallback, useState } from "react";
import type { DayView, Expense } from "@/lib/expenses";
import { formatVndShort } from "@/utils/format";
import { ExpenseList } from "./ExpenseList";
import { ExpenseChat } from "./ExpenseChat";
import { ExpenseEditSheet } from "./ExpenseEditSheet";
import { CategorySheet } from "./CategorySheet";

/**
 * The /chi-tieu screen: the ledger on top, the chat underneath. This component
 * owns the day being viewed and the day's data; both halves get it via props,
 * and anything that changes the ledger calls `refresh()` so what you see always
 * comes from the DB rather than from optimistic guesses.
 */
export function ExpenseScreen({ initial, today }: { initial: DayView; today: string }) {
  const [view, setView] = useState<DayView>(initial);
  const [editing, setEditing] = useState<Expense | "new" | null>(null);
  const [catsOpen, setCatsOpen] = useState(false);

  const load = useCallback(async (day: string) => {
    const res = await fetch(`/api/expenses?day=${day}`, { cache: "no-store" });
    if (res.ok) setView(await res.json());
  }, []);

  const refresh = useCallback(() => load(view.day), [load, view.day]);

  return (
    <>
      <div className="appbar">
        <a className="logo" href="/">
          ← <i>Chi tiêu</i>
        </a>
        <div className="stats">
          <span className="chip" title="Hôm nay">
            <span className="n">{formatVndShort(view.day_total)}</span>
          </span>
          <button
            type="button"
            className="iconbtn"
            onClick={() => setCatsOpen(true)}
            aria-label="Quản lý danh mục"
            title="Danh mục"
          >
            ⚙
          </button>
        </div>
      </div>

      <div className="xp">
        <ExpenseList
          view={view}
          today={today}
          onDay={load}
          onPick={(e) => setEditing(e)}
          onAdd={() => setEditing("new")}
        />
        <ExpenseChat
          categories={view.categories}
          onLedgerChanged={refresh}
        />
      </div>

      {editing && (
        <ExpenseEditSheet
          expense={editing === "new" ? null : editing}
          day={view.day}
          categories={view.categories}
          onClose={() => setEditing(null)}
          onSaved={(day) => {
            setEditing(null);
            load(day);
          }}
        />
      )}

      {catsOpen && (
        <CategorySheet
          categories={view.categories}
          onClose={() => setCatsOpen(false)}
          onChanged={refresh}
        />
      )}
    </>
  );
}
