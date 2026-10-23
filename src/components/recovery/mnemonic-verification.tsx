"use client";

import { useState, useRef } from "react";
import { useTranslations } from "next-intl";

interface MnemonicVerificationProps {
  mnemonic: string;
  onSuccess: () => void;
  onBack: () => void;
}

export default function MnemonicVerification({
  mnemonic,
  onSuccess,
  onBack,
}: MnemonicVerificationProps) {
  const t = useTranslations('recovery.mnemonic');
  const tCommon = useTranslations('common');
  const words = mnemonic.split(" ");
  const [inputWords, setInputWords] = useState<string[]>(Array(12).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [validationState, setValidationState] = useState<boolean[]>(Array(12).fill(false));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Verify all words match
  const verifyMnemonic = () => {
    const isValid = inputWords.every((word, index) => 
      word.trim().toLowerCase() === words[index].toLowerCase()
    );
    
    // Update validation state for each word
    const newValidationState = inputWords.map((word, index) => 
      word.trim().toLowerCase() === words[index].toLowerCase()
    );
    setValidationState(newValidationState);

    if (isValid) {
      setError(null);
      onSuccess();
    } else {
      setError(t('wordsMismatch'));
    }
  };

  const handleInputChange = (index: number, value: string) => {
    const newInputWords = [...inputWords];
    newInputWords[index] = value;
    setInputWords(newInputWords);
    setError(null);

    // Auto-focus next input on space or when word length seems complete
    if (value.endsWith(" ") || (value.length > 2 && index < 11)) {
      const cleanValue = value.trim();
      const updatedWords = [...inputWords];
      updatedWords[index] = cleanValue;
      setInputWords(updatedWords);
      
      if (cleanValue && index < 11) {
        inputRefs.current[index + 1]?.focus();
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    // Handle backspace to go to previous input if current is empty
    if (e.key === "Backspace" && !inputWords[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    
    // Handle Enter key to submit
    if (e.key === "Enter" && index === 11 && inputWords[11].trim()) {
      verifyMnemonic();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData("text");
    const pastedWords = pastedText.trim().split(/\s+/);
    
    if (pastedWords.length === 12) {
      setInputWords(pastedWords);
      setError(null);
      // Focus the last input
      inputRefs.current[11]?.focus();
    } else {
      setError(t('expectedWords', { count: pastedWords.length }));
    }
  };

  const handleClear = () => {
    setInputWords(Array(12).fill(""));
    setError(null);
    setValidationState(Array(12).fill(false));
    inputRefs.current[0]?.focus();
  };

  const allWordsFilled = inputWords.every(word => word.trim().length > 0);

  return (
    <div className="flex flex-col gap-4 sm:gap-6 w-full max-w-3xl mx-auto px-4 sm:px-0">
      <div className="text-center">
        <h2 className="text-xl sm:text-2xl font-bold mb-2 text-foreground">
          {t('verifyTitle')}
        </h2>
        <p className="text-sm sm:text-base text-muted">
          {t('verifyDescription')}
        </p>
      </div>

      {/* Instructions */}
      <div className="bg-primary-soft border border-primary rounded-lg p-3 sm:p-4">
        <div className="flex items-start gap-2 sm:gap-3">
          <svg
            className="w-5 h-5 text-primary mt-0.5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-xs sm:text-sm text-foreground">{t('pasteAll')}</p>
        </div>
      </div>

      {/* Input Grid */}
      <div className="bg-card-muted rounded-lg p-3 sm:p-4 md:p-6 border border-subtle overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3">
          {Array.from({ length: 12 }).map((_, index) => (
            <div key={index} className="relative min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="text-muted text-xs sm:text-sm font-medium w-5 sm:w-6 shrink-0">
                  {index + 1}.
                </span>
                <input
                  ref={(el) => {
                    inputRefs.current[index] = el;
                  }}
                  type="text"
                    value={inputWords[index]}
                    onChange={(e) => handleInputChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    onPaste={index === 0 ? handlePaste : undefined}
                    placeholder={t('wordPlaceholder', { number: index + 1 })}
                    autoComplete="off"
                    spellCheck={false}
                    className={`flex-1 min-w-0 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg border text-xs sm:text-sm font-medium transition ${
                    inputWords[index] && !validationState[index] && error
                      ? "border-danger bg-danger-soft text-foreground"
                      : inputWords[index] && validationState[index]
                      ? "border-success bg-success-soft text-foreground"
                      : "border-default bg-card text-foreground focus:border-primary focus:ring-1 focus:ring-primary"
                  }`}
                />
              </div>
            </div>
          ))}
        </div>

        {allWordsFilled && (
          <button
            onClick={handleClear}
            className="mt-3 sm:mt-4 text-xs sm:text-sm text-muted hover:text-foreground transition"
          >
            {t('clearAll')}
          </button>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-danger-soft border border-danger-border px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg flex items-start gap-2 sm:gap-3">
          <svg
            className="w-4 h-4 sm:w-5 sm:h-5 text-danger mt-0.5 shrink-0"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
          <div className="text-xs sm:text-sm text-danger wrap-break-word">{error}</div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onBack}
          className="w-full sm:flex-1 border border-default py-2.5 sm:py-3 rounded-lg text-sm sm:text-base font-medium hover:bg-card-muted transition"
        >
          {tCommon('back')}
        </button>
        <button
          onClick={verifyMnemonic}
          disabled={!allWordsFilled}
          className="w-full sm:flex-1 bg-primary text-on-primary py-2.5 sm:py-3 rounded-lg text-sm sm:text-base font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed shadow-card transition"
        >
          {t('verifyAndComplete')}
        </button>
      </div>
    </div>
  );
}
