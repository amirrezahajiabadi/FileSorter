import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { type UpdateCheckResult } from "./types";
import { getStrings, type Locale } from "./i18n";

interface UpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  updateData: UpdateCheckResult | null;
  lang: Locale;
}

export default function UpdateModal({ isOpen, onClose, updateData, lang }: UpdateModalProps) {
  const t = getStrings(lang);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !updateData) return null;

  const handleDownload = async () => {
    try {
      const url = updateData.download_url || updateData.html_url;
      if (url) {
        await invoke("open_external_url", { url });
      }
    } catch (e) {
      console.error("Failed to open download url", e);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="glass modal-card update-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="update-modal-header">
          <div className="update-icon-circle">🚀</div>
          <div>
            <h3 id="update-modal-title">{t.um_title}</h3>
            <p className="muted" style={{ margin: "2px 0 0" }}>
              {t.um_desc}
            </p>
          </div>
        </div>

        <div className="update-versions-badge">
          <span className="badge-version current">
            {t.um_current} <b>v{updateData.current_version}</b>
          </span>
          <span className="badge-arrow">→</span>
          <span className="badge-version latest">
            {t.um_latest} <b>{updateData.latest_version}</b>
          </span>
        </div>

        {updateData.release_notes && (
          <div className="update-notes-container">
            <b>{t.um_highlights}</b>
            <div className="update-notes-box mono">
              {updateData.release_notes}
            </div>
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: "24px" }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t.um_later}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleDownload}
            autoFocus
          >
            {t.um_download}
          </button>
        </div>
      </div>
    </div>
  );
}
