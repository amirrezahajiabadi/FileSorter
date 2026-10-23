import { useState, useEffect } from "react";
import { type Theme, THEMES, themeMeta } from "./App";
import { fmt, getStrings, type Locale } from "./i18n";

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTheme: Theme;
  onSelectTheme: (theme: Theme) => void;
  onPickFolder?: () => void;
  lang: Locale;
}

export default function OnboardingModal({
  isOpen,
  onClose,
  currentTheme,
  onSelectTheme,
  onPickFolder,
  lang,
}: OnboardingModalProps) {
  const [step, setStep] = useState<number>(1);
  const t = getStrings(lang);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowRight") {
        setStep((s) => Math.min(4, s + 1));
      } else if (e.key === "ArrowLeft") {
        setStep((s) => Math.max(1, s - 1));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="glass modal-card onboarding-card" onClick={(e) => e.stopPropagation()}>
        {/* Step Indicator */}
        <div className="onboarding-progress" role="navigation" aria-label={t.ob_steps_aria}>
          {[1, 2, 3, 4].map((i) => (
            <button
              key={i}
              type="button"
              className={`progress-pill ${step === i ? "active" : step > i ? "completed" : ""}`}
              onClick={() => setStep(i)}
              aria-label={fmt(t.ob_goto_step, { n: i })}
              aria-current={step === i ? "step" : undefined}
            />
          ))}
        </div>

        {/* STEP 1: Welcome & Engine */}
        {step === 1 && (
          <div className="onboarding-body animate-fade-in">
            <div className="onboarding-icon">⚡</div>
            <h2 id="onboarding-modal-title">{t.ob_welcome_title}</h2>
            <p className="lead-text">
              {t.ob_welcome_lead_a}
              <strong>{t.banner_tech}</strong>
              {t.ob_welcome_lead_b}
            </p>
            <div className="features-grid-mini">
              <div className="feature-item">
                <span className="feature-icon">🦀</span>
                <div>
                  <strong>{t.ob_feature_engine_title}</strong>
                  <p>{t.ob_feature_engine_desc}</p>
                </div>
              </div>
              <div className="feature-item">
                <span className="feature-icon">🛡️</span>
                <div>
                  <strong>{t.ob_feature_safe_title}</strong>
                  <p>{t.ob_feature_safe_desc}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Theme & Design System */}
        {step === 2 && (
          <div className="onboarding-body animate-fade-in">
            <div className="onboarding-icon">✨</div>
            <h2>{t.ob_theme_title}</h2>
            <p className="lead-text">
              {t.ob_theme_lead}</p>
            <div className="theme-grid-picker">
              {THEMES.map((th) => {
                const meta = themeMeta(t, th.id);
                return (
                <button
                  key={th.id}
                  type="button"
                  className={`theme-pick-card ${currentTheme === th.id ? "selected" : ""}`}
                  onClick={() => onSelectTheme(th.id)}
                  aria-label={fmt(t.ob_theme_select_aria, { name: meta.name })}
                  aria-pressed={currentTheme === th.id}
                >
                  <div className="theme-pick-swatch">
                    {th.swatch.map((c, idx) => (
                      <span key={idx} style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  <div className="theme-pick-info">
                    <span className="theme-pick-icon">{th.icon}</span>
                    <strong>{meta.name}</strong>
                    <small>{meta.desc}</small>
                  </div>
                </button>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 3: Suite Capabilities */}
        {step === 3 && (
          <div className="onboarding-body animate-fade-in">
            <div className="onboarding-icon">🚀</div>
            <h2>{t.ob_caps_title}</h2>
            <p className="lead-text">
              {t.ob_caps_lead}
            </p>
            <div className="capabilities-list">
              <div className="cap-row">
                <span className="cap-badge">📁 {t.ob_cap1_title}</span>
                <p>{t.ob_cap1_desc}</p>
              </div>
              <div className="cap-row">
                <span className="cap-badge">🗑️ {t.ob_cap2_title}</span>
                <p>{t.ob_cap2_desc}</p>
              </div>
              <div className="cap-row">
                <span className="cap-badge">👥 {t.ob_cap3_title}</span>
                <p>{t.ob_cap3_desc}</p>
              </div>
              <div className="cap-row">
                <span className="cap-badge">👁️ {t.ob_cap4_title}</span>
                <p>{t.ob_cap4_desc}</p>
              </div>
              <div className="cap-row">
                <span className="cap-badge">🎨 {t.ob_cap5_title}</span>
                <p>{t.ob_cap5_desc}</p>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: Ready to Start */}
        {step === 4 && (
          <div className="onboarding-body animate-fade-in">
            <div className="onboarding-icon">🎉</div>
            <h2>{t.ob_ready_title}</h2>
            <p className="lead-text">
              {t.ob_ready_lead_a}<strong>{t.ob_downloads}</strong>{t.ob_ready_lead_b}<strong>{t.ob_desktop}</strong>{t.ob_ready_lead_c}</p>
            <div className="onboarding-actions-center">
              {onPickFolder && (
                <button
                  type="button"
                  className="btn btn-primary btn-large"
                  onClick={() => {
                    onClose();
                    onPickFolder();
                  }}
                  autoFocus
                >
                  {t.ob_pick_folder_btn}
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost"
                onClick={onClose}
              >
                {t.ob_go_workspace}
              </button>
            </div>
          </div>
        )}

        {/* Footer Navigation */}
        <div className="onboarding-footer">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            aria-label={t.ob_skip_aria}
          >
            {t.ob_skip}
          </button>
          <div className="footer-nav-buttons">
            {step > 1 && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setStep((s) => s - 1)}
                aria-label={t.ob_back_aria}
              >
                {t.ob_back}
              </button>
            )}
            {step < 4 ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setStep((s) => s + 1)}
                aria-label={t.ob_continue_aria}
              >
                {t.ob_continue}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={onClose}
                aria-label={t.ob_get_started_aria}
              >
                {t.ob_get_started}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
