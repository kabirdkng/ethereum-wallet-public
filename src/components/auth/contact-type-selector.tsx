import { useTranslations } from 'next-intl';

type ContactType = "email" | "phone";

interface ContactTypeSelectorProps {
  contactType: ContactType;
  onChangeType: (type: ContactType) => void;
}

export function ContactTypeSelector({ contactType, onChangeType }: ContactTypeSelectorProps) {
  const t = useTranslations('auth');
  
  return (
    <div className="flex gap-2 mb-4">
      <button
        onClick={() => onChangeType("email")}
        className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${
          contactType === "email"
            ? "bg-primary text-on-primary"
            : "bg-card-muted text-muted hover:bg-card"
        }`}
      >
        {t('email')}
      </button>
      <button
        onClick={() => onChangeType("phone")}
        className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${
          contactType === "phone"
            ? "bg-primary text-on-primary"
            : "bg-card-muted text-muted hover:bg-card"
        }`}
      >
        {t('phone')}
      </button>
    </div>
  );
}
