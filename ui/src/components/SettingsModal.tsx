import { useState } from 'react';

import type { CategoryDraft, RuleDraft } from '../store';
import {
  closeSettings,
  restoreDefaults,
  rulesSnapshot,
  saveSettings,
  settingsSnapshot,
  useStore,
} from '../store';
import { fmt, inline, t } from '../i18n';

function displayName(d: CategoryDraft, lang: string): string {
  return lang === 'fa' ? d.nameFa : d.nameEn;
}

export default function SettingsModal() {
  const store = useStore();
  const S = store.strings;
  const lang = store.lang;

  const [tab, setTab] = useState<'categories' | 'rules'>('categories');
  const [drafts, setDrafts] = useState<CategoryDraft[]>(() => settingsSnapshot());
  const [ruleDrafts, setRuleDrafts] = useState<RuleDraft[]>(() => rulesSnapshot());
  const [selectedId, setSelectedId] = useState<string>(() => {
    const snap = settingsSnapshot();
    const others = snap.find((d) => d.id === 'others');
    return (snap[0] ?? others ?? snap[0])?.id ?? '';
  });
  const [newName, setNewName] = useState('');

  const selected = drafts.find((d) => d.id === selectedId) ?? null;

  const updateDraft = (id: string, patch: Partial<CategoryDraft>) => {
    setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  const addCategory = () => {
    const label = newName.trim();
    if (!label) return;
    const id = `cat_${Date.now().toString(36)}`;
    setDrafts((ds) => [
      ...ds,
      { id, icon: '📁', nameEn: label, nameFa: label, extensions: [] },
    ]);
    setSelectedId(id);
    setNewName('');
  };

  const removeSelected = () => {
    if (!selected) return;
    if (selected.id === 'others') {
      window.alert(inline(t(S, 'cannot_remove_others_msg')));
      return;
    }
    const msg = fmt(t(S, 'remove_category_confirm_msg'), { cat: displayName(selected, lang) });
    if (!window.confirm(inline(msg))) return;
    setDrafts((ds) => {
      const next = ds.filter((d) => d.id !== selected.id);
      setSelectedId(next[0]?.id ?? '');
      return next;
    });
    // rules pointing at the removed category become inert — drop them
    setRuleDrafts((rs) => rs.filter((r) => r.category !== selected.id));
  };

  const updateRule = (i: number, patch: Partial<RuleDraft>) => {
    setRuleDrafts((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };

  const addRule = () => {
    const firstCat = drafts.find((d) => d.id !== 'others')?.id ?? drafts[0]?.id ?? '';
    setRuleDrafts((rs) => [...rs, { keywords: '', category: firstCat }]);
  };

  const removeRule = (i: number) => {
    setRuleDrafts((rs) => rs.filter((_, j) => j !== i));
  };

  const moveRule = (i: number, dir: -1 | 1) => {
    setRuleDrafts((rs) => {
      const j = i + dir;
      if (j < 0 || j >= rs.length) return rs;
      const next = [...rs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const onSave = async () => {
    const ok = await saveSettings(drafts, ruleDrafts);
    if (ok) closeSettings();
  };

  const onRestore = async () => {
    if (!window.confirm(inline(t(S, 'restore_defaults_confirm_msg')))) return;
    await restoreDefaults();
    const fresh = settingsSnapshot();
    setDrafts(fresh);
    setSelectedId(fresh[0]?.id ?? '');
    setRuleDrafts(rulesSnapshot());
  };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={inline(t(S, 'settings_header'))}
    >
      <div className="modal modal-wide">
        <div className="modal-head">
          <div>
            <h2 className="modal-title">{inline(t(S, 'settings_header'))}</h2>
            <p className="modal-sub">
              {tab === 'categories'
                ? inline(t(S, 'settings_subheader'))
                : inline(t(S, 'smart_rules_sub'))}
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={closeSettings} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="settings-tabs" role="tablist" aria-label={inline(t(S, 'settings_header'))}>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'categories'}
            className={`settings-tab ${tab === 'categories' ? 'active' : ''}`}
            onClick={() => setTab('categories')}
          >
            {inline(t(S, 'settings_tab_categories'))}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'rules'}
            className={`settings-tab ${tab === 'rules' ? 'active' : ''}`}
            onClick={() => setTab('rules')}
          >
            {inline(t(S, 'settings_tab_rules'))}
          </button>
        </div>

        {tab === 'categories' ? (
          <div className="settings-body">
            <div className="settings-list">
              <div className="settings-list-scroll">
                {drafts.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    className={`settings-item ${d.id === selectedId ? 'selected' : ''}`}
                    onClick={() => setSelectedId(d.id)}
                  >
                    <span className="settings-item-icon" aria-hidden="true">
                      {d.icon}
                    </span>
                    <span className="settings-item-name">{displayName(d, lang)}</span>
                    <span className="settings-item-count">{d.extensions.length}</span>
                  </button>
                ))}
              </div>
              <div className="settings-new">
                <input
                  type="text"
                  className="input"
                  placeholder={inline(t(S, 'new_category_label'))}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addCategory();
                  }}
                />
                <button type="button" className="btn btn-secondary" onClick={addCategory}>
                  {inline(t(S, 'add_cat_btn'))}
                </button>
              </div>
            </div>

            {selected ? (
              <div className="settings-editor">
                <div className="settings-editor-head">
                  <span className="settings-editor-icon" aria-hidden="true">
                    {selected.icon}
                  </span>
                  <span className="settings-editor-name">
                    {displayName(selected, lang)}
                  </span>
                  <span className="settings-editor-id mono" dir="ltr">
                    {selected.id}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={removeSelected}
                    disabled={selected.id === 'others'}
                    title={selected.id === 'others' ? inline(t(S, 'cannot_remove_others_msg')) : undefined}
                  >
                    {inline(t(S, 'remove_cat_btn'))}
                  </button>
                </div>

                <label className="field">
                  <span className="field-label">{inline(t(S, 'icon_label'))}</span>
                  <input
                    type="text"
                    className="input"
                    maxLength={4}
                    value={selected.icon}
                    onChange={(e) => updateDraft(selected.id, { icon: e.target.value || '📁' })}
                  />
                </label>

                <label className="field">
                  <span className="field-label">{inline(t(S, 'name_en_label'))}</span>
                  <input
                    type="text"
                    className="input"
                    value={selected.nameEn}
                    onChange={(e) => updateDraft(selected.id, { nameEn: e.target.value })}
                  />
                </label>

                <label className="field">
                  <span className="field-label">{inline(t(S, 'name_fa_label'))}</span>
                  <input
                    type="text"
                    className="input"
                    value={selected.nameFa}
                    onChange={(e) => updateDraft(selected.id, { nameFa: e.target.value })}
                  />
                </label>

                <label className="field field-grow">
                  <span className="field-label">{inline(t(S, 'extensions_label'))}</span>
                  <textarea
                    className="input textarea"
                    dir="ltr"
                    spellCheck={false}
                    value={selected.extensions.join('\n')}
                    onChange={(e) =>
                      updateDraft(selected.id, {
                        extensions: e.target.value
                          .split('\n')
                          .map((x) => x.trim())
                          .filter((x) => x.length > 0),
                      })
                    }
                  />
                </label>
              </div>
            ) : (
              <div className="settings-empty">{inline(t(S, 'no_category_warning_msg'))}</div>
            )}
          </div>
        ) : (
          <div className="rules-body">
            <p className="rules-hint">{inline(t(S, 'smart_rules_hint'))}</p>
            {ruleDrafts.length === 0 ? (
              <p className="settings-empty">{inline(t(S, 'no_rules_hint'))}</p>
            ) : (
              <div className="rules-list">
                {ruleDrafts.map((r, i) => (
                  <div key={i} className="rule-row">
                    <span className="rule-index">{i + 1}</span>
                    <input
                      type="text"
                      className="input rule-keywords"
                      dir="auto"
                      placeholder={inline(t(S, 'rule_keywords_placeholder'))}
                      value={r.keywords}
                      onChange={(e) => updateRule(i, { keywords: e.target.value })}
                      aria-label={`${inline(t(S, 'rule_row_label'))} ${i + 1}`}
                    />
                    <span className="rule-arrow">{inline(t(S, 'rule_target_label'))}</span>
                    <select
                      className="input rule-category"
                      value={r.category}
                      onChange={(e) => updateRule(i, { category: e.target.value })}
                      aria-label={inline(t(S, 'rule_target_label'))}
                    >
                      {drafts.map((d) => (
                        <option key={d.id} value={d.id}>
                          {displayName(d, lang)}
                        </option>
                      ))}
                    </select>
                    <div className="rule-actions">
                      <button
                        type="button"
                        className="icon-btn btn-sm"
                        onClick={() => moveRule(i, -1)}
                        disabled={i === 0}
                        title={inline(t(S, 'rule_move_up'))}
                        aria-label={inline(t(S, 'rule_move_up'))}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="icon-btn btn-sm"
                        onClick={() => moveRule(i, 1)}
                        disabled={i === ruleDrafts.length - 1}
                        title={inline(t(S, 'rule_move_down'))}
                        aria-label={inline(t(S, 'rule_move_down'))}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="icon-btn btn-sm rule-remove"
                        onClick={() => removeRule(i)}
                        aria-label={inline(t(S, 'remove_rule_btn'))}
                      >
                        {inline(t(S, 'remove_rule_btn'))}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button type="button" className="btn btn-secondary" onClick={addRule}>
              {inline(t(S, 'add_rule_btn'))}
            </button>
          </div>
        )}

        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onRestore}>
            {inline(t(S, 'restore_defaults_btn'))}
          </button>
          <div className="foot-spacer" />
          <button type="button" className="btn btn-ghost" onClick={closeSettings}>
            {inline(t(S, 'cancel_btn'))}
          </button>
  
          <button type="button" className="btn btn-primary" onClick={() => void onSave()}>
            {inline(t(S, 'save_close_btn'))}
          </button>
        </div>
      </div>
    </div>
  );
}
