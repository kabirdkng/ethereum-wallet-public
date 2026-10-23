import { useTranslations } from "next-intl";

type ContactType = "email" | "phone";
type AuthMode = "signup" | "signin";

interface ContactFormProps {
  mode: AuthMode;
  contactType: ContactType;
  contact: string;
  onContactChange: (value: string) => void;
  pin: string;
  onPinChange: (value: string) => void;
  loading: boolean;
  onSubmit: () => void;
  onToggleMode: () => void;
}

export function ContactForm({
  mode,
  contactType,
  contact,
  onContactChange,
  pin,
  onPinChange,
  loading,
  onSubmit,
  onToggleMode,
}: ContactFormProps) {
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');
  const isSignIn = mode === "signin";

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          {contactType === "email" ? t('email') : t('phone')}
        </label>
        <input
          type={contactType === "email" ? "email" : "tel"}
          value={contact}
          onChange={(e) => onContactChange(e.target.value)}
          placeholder={contactType === "email" ? t('enterEmail') : t('enterPhone')}
          className="w-full px-4 py-3 border border-default rounded-lg bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {isSignIn && (
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">{t('pin')}</label>
          <input
            type="password"
            value={pin}
            onChange={(e) => onPinChange(e.target.value)}
            placeholder={t('enterPIN')}
            maxLength={6}
            className="w-full px-4 py-3 border border-default rounded-lg bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      )}

      <button
        onClick={onSubmit}
        disabled={loading || !contact || (isSignIn && pin.length !== 6)}
        className="w-full bg-primary text-on-primary py-3 rounded-lg font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {loading
          ? tCommon('loading')
          : isSignIn
          ? t('login')
          : t('sendCode')}
      </button>

      <div className="text-center mt-4">
        <button
          onClick={onToggleMode}
          className="text-primary hover:underline text-sm"
        >
          {isSignIn
            ? "Don't have an account? Sign up"
            : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
