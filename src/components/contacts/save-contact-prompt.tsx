"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { FiX, FiSave } from "react-icons/fi";

interface SaveContactPromptProps {
  walletAddress: string;
  onSave: (name: string) => void;
  onSkip: () => void;
}

export function SaveContactPrompt({ walletAddress, onSave, onSkip }: SaveContactPromptProps) {
  const t = useTranslations('contacts');
  const tCommon = useTranslations('common');
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const handleSave = () => {
    if (!name.trim()) {
      setError(t('errors.nameRequired'));
      return;
    }
    onSave(name.trim());
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg max-w-md w-full p-6 shadow-card">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">{t('saveContactPrompt.title')}</h3>
            <p className="text-sm text-muted mt-1">
              {t('saveContactPrompt.description')}
            </p>
          </div>
          <button
            onClick={onSkip}
            className="p-1 hover:bg-card-muted rounded transition-colors text-muted hover:text-foreground"
            aria-label={tCommon('close')}
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-4">
          <p className="text-xs text-muted font-mono mb-2">{walletAddress}</p>
          <label className="block text-sm font-medium mb-2 text-foreground">
            {t('name')} <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError("");
            }}
            className="w-full px-3 py-2 border border-default rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary bg-card text-foreground"
            placeholder={t('namePlaceholder')}
            autoFocus
            onKeyPress={(e) => e.key === 'Enter' && handleSave()}
          />
          {error && <p className="text-danger text-xs mt-1">{error}</p>}
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg hover:bg-primary-hover transition-colors"
          >
            <FiSave className="w-4 h-4" />
            {tCommon('save')}
          </button>
          <button
            onClick={onSkip}
            className="px-4 py-2 bg-card-muted text-foreground rounded-lg hover:bg-card border border-default transition-colors"
          >
            {t('saveContactPrompt.skip')}
          </button>
        </div>
      </div>
    </div>
  );
}
