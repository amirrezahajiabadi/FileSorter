import { useEffect } from 'react';

import { useStore, clearNotice } from '../store';

const AUTODISMISS_MS = 4000;

export default function Toasts() {
  const notice = useStore().notice;

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(clearNotice, AUTODISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (!notice) return null;
  return (
    <div className={`toast toast-${notice.kind}`} role="status">
      <span className="toast-text">{notice.text}</span>
      <button type="button" className="toast-close" onClick={clearNotice} aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}
