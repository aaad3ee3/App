import { useState, type ReactNode } from "react";

interface ConfirmModalProps {
  title: string;
  confirmLabel?: string;
  danger?: boolean;
  requireNote?: boolean;
  children?: ReactNode;
  onConfirm: (note: string) => Promise<void> | void;
  onClose: () => void;
}

export function ConfirmModal({
  title,
  confirmLabel = "تأكيد",
  danger,
  requireNote,
  children,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (requireNote && !note.trim()) {
      setError("لازم تكتب ملاحظة");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(note.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {children}
        <div className="field" style={{ marginTop: 10 }}>
          <label>ملاحظة{requireNote ? "" : " (اختياري)"}</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {error && <div className="error-text">{error}</div>}
        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose} disabled={busy}>
            إلغاء
          </button>
          <button className={`btn ${danger ? "btn-danger" : ""}`} onClick={handleConfirm} disabled={busy}>
            {busy ? "..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
