"use client";
import { useEffect, useState } from "react";

export function SettingsSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStatus(null);
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d: { interests: string[] }) => setText((d.interests ?? []).join("\n")))
      .catch(() => {});
  }, [open]);

  async function save() {
    if (saving) return;
    setSaving(true);
    setStatus(null);
    const interests = text
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ interests }),
      });
      setStatus("Đã lưu — đang tạo thẻ theo chủ đề của bạn…");
      // Kick off generation with the new interests (non-blocking).
      fetch("/api/knowledge/topup", { method: "POST" }).catch(() => {});
      setTimeout(onClose, 900);
    } catch {
      setStatus("Lưu thất bại — thử lại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className={`scrim${open ? " open" : ""}`} onClick={onClose} />
      <div className={`sheet settings${open ? " open" : ""}`} role="dialog" aria-label="Settings">
        <div className="grab" />
        <h2 className="settings-h">Chủ đề bạn quan tâm</h2>
        <p className="settings-sub">
          Mỗi dòng một chủ đề (bất kỳ lĩnh vực nào). Ở mode Kiến thức, DeepSeek sẽ random một chủ đề
          trong danh sách này để dạy sâu.
        </p>
        <textarea
          className="settings-ta"
          rows={7}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Chăm con\nSức khoẻ & dinh dưỡng\nBackend system design\nĐầu tư tài chính cá nhân\nTâm lý học"}
        />
        <div className="sheet-actions">
          <button type="button" className="save" onClick={save} disabled={saving}>
            {saving ? "Đang lưu…" : "Lưu chủ đề"}
          </button>
        </div>
        {status && <p className="settings-status">{status}</p>}
      </div>
    </>
  );
}
