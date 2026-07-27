"use client";
import { useState } from "react";
import type { ExpenseCategory } from "@/lib/expenses";
import { FALLBACK_CATEGORY } from "@/lib/expenses";

/**
 * Manage the category list. Deleting one moves its expenses to "Khác" rather
 * than deleting them, so the spending history survives a rename-by-deletion.
 */
export function CategorySheet({
  categories,
  onClose,
  onChanged,
}: {
  categories: ExpenseCategory[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!name.trim() || busy) return;
    setBusy(true);
    await fetch("/api/expenses/categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, emoji }),
    });
    setName("");
    setEmoji("");
    setBusy(false);
    onChanged();
  }

  async function remove(target: string) {
    setBusy(true);
    await fetch(`/api/expenses/categories?name=${encodeURIComponent(target)}`, {
      method: "DELETE",
    });
    setBusy(false);
    onChanged();
  }

  return (
    <div className="xsheet-wrap" role="dialog" aria-label="Danh mục chi tiêu">
      <button type="button" className="xsheet-scrim" onClick={onClose} aria-label="Đóng" />
      <div className="xsheet">
        <div className="xsheet-bar">
          <b>Danh mục</b>
          <button type="button" className="kchat-x" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className="xcats">
          {categories.map((c) => (
            <div key={c.name} className="xcat">
              <span>
                {c.emoji} {c.name}
              </span>
              {c.name !== FALLBACK_CATEGORY && (
                <button
                  type="button"
                  className="xcat-x"
                  onClick={() => remove(c.name)}
                  disabled={busy}
                  title="Xoá — khoản chi cũ dồn về Khác"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="xcat-add">
          <input
            className="xcat-emoji"
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            placeholder="🐶"
            aria-label="Emoji"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tên danh mục mới"
            aria-label="Tên danh mục"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <button type="button" className="xbtn primary" onClick={add} disabled={busy}>
            Thêm
          </button>
        </div>
      </div>
    </div>
  );
}
