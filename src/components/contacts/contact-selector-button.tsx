"use client";

import { useTranslations } from "next-intl";
import { FiUsers } from "react-icons/fi";

interface ContactSelectorButtonProps {
  onClick: () => void;
  hasContacts: boolean;
}

export function ContactSelectorButton({ onClick, hasContacts }: ContactSelectorButtonProps) {
  const t = useTranslations('contacts');

  if (!hasContacts) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 text-sm bg-default-100 hover:bg-default-200 rounded-lg transition-colors border border-default"
    >
      <FiUsers className="w-4 h-4" />
      {t('selectContact')}
    </button>
  );
}
