"use client";
import { useState } from "react";
import type { Expense, ExpenseCategory } from "@/lib/expenses";

/**
 * Bottom sheet to add an expense by hand or fix one the model got wrong. This
 * is also the escape hatch when DeepSeek is unreachable — you can always record
 * spending without the model.
 */
export function ExpenseEditSheet({
  expense,
  day,
  categories,
  onClose,
  onSaved,
}: {
  expense: Expense | null;
  day: string;
  categories: ExpenseCategory[];
  onClose: () => void;
  onSaved: (day: string) => void;
}) {
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const [category, setCategory] = useState(expense?.category ?? categories[0]?.name ?? "Khác");
  const [note, setNote] = useState(expense?.note ?? "");
  const [spentOn, setSpentOn] = useState(expense?.spent_on ?? day);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    const value = Math.round(Number(amount.replace(/[^\d]/g, "")));
    if (!Number.isFinite(value) || value < 1) {
      setError("Nhập số tiền đã nào.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(expense ? `/api/expenses/${expense.id}` : "/api/expenses", {
        method: expense ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: value, category, note, spent_on: spentOn }),
      });
      if (!res.ok) throw new Error(`save ${res.status}`);
      onSaved(spentOn);
    } catch {
      setError("Không lưu được, thử lại nhé.");
      setBusy(false);
    }
  }

  async function remove() {
    if (!expense) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/expenses/${expense.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`delete ${res.status}`);
      onSaved(expense.spent_on);
    } catch {
      setError("Không xoá được, thử lại nhé.");
      setBusy(false);
    }
  }

  return (
    <div className="xsheet-wrap" role="dialog" aria-label="Sửa khoản chi">
      <button type="button" className="xsheet-scrim" onClick={onClose} aria-label="Đóng" />
      <div className="xsheet">
        <div className="xsheet-bar">
          <b>{expense ? "Sửa khoản chi" : "Thêm khoản chi"}</b>
          <button type="button" className="kchat-x" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>

        <label className="xfield">
          <span>Số tiền (VND)</span>
          <input
            type="text"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="45000"
            autoFocus
          />
        </label>

        <label className="xfield">
          <span>Danh mục</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c.name} value={c.name}>
                {c.emoji} {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="xfield">
          <span>Mô tả</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Cơm trưa"
          />
        </label>

        <label className="xfield">
          <span>Ngày</span>
          <input type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} />
        </label>

        {error && <p className="xsheet-err">{error}</p>}

        <div className="xsheet-actions">
          {expense && (
            <button type="button" className="xbtn danger" onClick={remove} disabled={busy}>
              Xoá
            </button>
          )}
          <button type="button" className="xbtn primary" onClick={save} disabled={busy}>
            {busy ? "…" : "Lưu"}
          </button>
        </div>
      </div>
    </div>
  );
}
