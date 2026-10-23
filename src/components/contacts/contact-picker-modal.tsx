"use client";

import { useTranslations } from "next-intl";
import { FiX, FiUserPlus } from "react-icons/fi";
import { Contact } from "@/hooks/useContacts";
import { ContactListItem } from "./contact-list-item";

interface ContactPickerModalProps {
  contacts: Contact[];
  onSelect: (contact: Contact) => void;
  onClose: () => void;
}

export function ContactPickerModal({ contacts, onSelect, onClose }: ContactPickerModalProps) {
  const t = useTranslations('contacts');
  const tCommon = useTranslations('common');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg max-w-md w-full max-h-[80vh] flex flex-col shadow-card">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-subtle">
          <h3 className="text-lg font-semibold text-foreground">{t('selectContact')}</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-card-muted rounded transition-colors text-muted hover:text-foreground"
            aria-label={tCommon('close')}
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {contacts.length === 0 ? (
            <div className="text-center py-8 text-muted">
              <FiUserPlus className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>{t('noContacts')}</p>
              <p className="text-sm mt-2">{t('addContactsFirst')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {contacts.map((contact) => (
                <ContactListItem
                  key={contact.id}
                  contact={contact}
                  onClick={onSelect}
                  showActions={false}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-subtle">
          <button
            onClick={onClose}
            className="w-full py-2 bg-card-muted text-foreground rounded-lg hover:bg-card border border-default transition-colors"
          >
            {tCommon('cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
