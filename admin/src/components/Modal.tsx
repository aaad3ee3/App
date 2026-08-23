import { useEffect, useRef, type ReactNode } from "react";

/**
 * Shared backdrop/box shell so Escape-to-close and initial focus are fixed once
 * instead of copied into every modal that uses this pattern.
 */
export function Modal({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    boxRef.current?.focus();
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" ref={boxRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
