import { useState, useEffect } from "react";
import { type Theme, THEMES } from "./App";

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTheme: Theme;
  onSelectTheme: (theme: Theme) => void;
  onPickFolder?: () => void;
}

export default function OnboardingModal({
  isOpen,
  onClose,
  currentTheme,
  onSelectTheme,
  onPickFolder,
}: OnboardingModalProps) {
  const [step, setStep] = useState<number>(1);

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
        <div className="onboarding-progress" role="navigation" aria-label="Onboarding steps">
          {[1, 2, 3, 4].map((i) => (
            <button
              key={i}
              type="button"
              className={`progress-pill ${step === i ? "active" : step > i ? "completed" : ""}`}
              onClick={() => setStep(i)}
              aria-label={`Go to step ${i}`}
              aria-current={step === i ? "step" : undefined}
            />
          ))}
        </div>

        {/* STEP 1: Welcome & Engine */}
        {step === 1 && (
          <div className="onboarding-body animate-fade-in">
            <div className="onboarding-icon">⚡</div>
            <h2 id="onboarding-modal-title">Welcome to FileSorter v2</h2>
            <p className="lead-text">
              Rebuilt from the ground up on <strong>Tauri 2 &amp; Rust</strong>: a sub-second startup,
              lightweight native binary with zero UI freeze and instant desktop responsiveness.
            </p>
            <div className="features-grid-mini">
              <div className="feature-item">
                <span className="feature-icon">🦀</span>
                <div>
                  <strong>Native Rust Engine</strong>
                  <p>Parallel disk scans, SHA-256 chunked duplicate hashing, and atomic journaled undo.</p>
                </div>
              </div>
              <div className="feature-item">
                <span className="feature-icon">🛡️</span>
                <div>
                  <strong>Never Overwrites</strong>
                  <p>Smart collision resolver automatically renames conflicts (e.g. <code>file (2).pdf</code>).</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Theme & Design System */}
        {step === 2 && (
          <div className="onboarding-body animate-fade-in">
            <div className="onboarding-icon">✨</div>
            <h2>Choose Your Liquid Glass Aesthetic</h2>
            <p className="lead-text">
              FileSorter features an ultra-refined Liquid Glass Design System. Select your preferred look:
            </p>
            <div className="theme-grid-picker">
              {THEMES.map((th) => (
                <button
                  key={th.id}
                  type="button"
                  className={`theme-pick-card ${currentTheme === th.id ? "selected" : ""}`}
                  onClick={() => onSelectTheme(th.id)}
                  aria-label={`Select ${th.name}`}
                  aria-pressed={currentTheme === th.id}
                >
                  <div className="theme-pick-swatch">
                    {th.swatch.map((c, idx) => (
                      <span key={idx} style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  <div className="theme-pick-info">
                    <span className="theme-pick-icon">{th.icon}</span>
                    <strong>{th.name}</strong>
                    <small>{th.desc}</small>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* STEP 3: Suite Capabilities */}
        {step === 3 && (
          <div className="onboarding-body animate-fade-in">
            <div className="onboarding-icon">🚀</div>
            <h2>All-In-One Desktop Utility</h2>
            <p className="lead-text">
              More than a simple sorter: everything you need to keep your workspace pristine and optimized.
            </p>
            <div className="capabilities-list">
              <div className="cap-row">
                <span className="cap-badge">📁 Smart Organize &amp; Rules</span>
                <p>Categorize by extensions or create keyword rules matching filename tokens.</p>
              </div>
              <div className="cap-row">
                <span className="cap-badge">🗑️ Junk &amp; Cache Cleaner</span>
                <p>Purge temporary files, browser caches, crash dumps, and thumbnail DBs safely.</p>
              </div>
              <div className="cap-row">
                <span className="cap-badge">👥 Duplicates &amp; Disk Analyzer</span>
                <p>Find identical files with 3-stage SHA-256 pipeline and reclaim gigabytes.</p>
              </div>
              <div className="cap-row">
                <span className="cap-badge">👁️ Watch Mode &amp; Scheduler</span>
                <p>Auto-sort Downloads or Desktop on file arrival, or run background cleanup tasks.</p>
              </div>
              <div className="cap-row">
                <span className="cap-badge">🎨 Creative Studios</span>
                <p>Batch Renamer, Image Studio (WebP/JPEG conversion), and PDF Studio included.</p>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: Ready to Start */}
        {step === 4 && (
          <div className="onboarding-body animate-fade-in">
            <div className="onboarding-icon">🎉</div>
            <h2>You&apos;re All Set!</h2>
            <p className="lead-text">
              Pick a messy directory (like your <strong>Downloads</strong> or <strong>Desktop</strong>) and let
              FileSorter work its magic safely with full undo.
            </p>
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
                  📁 Select a Folder to Organize
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost"
                onClick={onClose}
              >
                Go to Workspace
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
            aria-label="Skip onboarding tour"
          >
            Skip
          </button>
          <div className="footer-nav-buttons">
            {step > 1 && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setStep((s) => s - 1)}
                aria-label="Previous step"
              >
                ← Back
              </button>
            )}
            {step < 4 ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setStep((s) => s + 1)}
                aria-label="Next step"
              >
                Continue →
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={onClose}
                aria-label="Get started"
              >
                Get Started ✓
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
