"use client";

import { useTranslations } from "next-intl";
import { FiEdit2, FiTrash2, FiCopy, FiSend } from "react-icons/fi";
import toast from "react-hot-toast";
import { Contact } from "@/hooks/useContacts";

interface ContactListItemProps {
  contact: Contact;
  onEdit?: (contact: Contact) => void;
  onDelete?: (id: string) => void;
  onClick?: (contact: Contact) => void;
  onSendMoney?: (contact: Contact) => void;
  showActions?: boolean;
}

export function ContactListItem({ 
  contact, 
  onEdit, 
  onDelete, 
  onClick, 
  onSendMoney,
  showActions = true 
}: ContactListItemProps) {
  const tCommon = useTranslations('common');
  const tWallet = useTranslations('wallet');

  const copyAddress = (e: React.MouseEvent, address: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(address);
    toast.success(tCommon('copiedToClipboard'));
  };

  const handleSendMoney = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSendMoney?.(contact);
  };

  return (
    <div
      className={`border border-default rounded-lg p-3 hover:bg-card-muted transition-colors bg-card ${
        onClick ? 'cursor-pointer' : ''
      }`}
      onClick={() => onClick?.(contact)}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium truncate text-foreground">{contact.name}</h4>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-xs text-muted font-mono truncate">
              {contact.walletAddress}
            </p>
            <button
              onClick={(e) => copyAddress(e, contact.walletAddress)}
              className="text-muted hover:text-primary transition-colors"
              aria-label={tCommon('copyAddress')}
              title={tCommon('copyAddress')}
            >
              <FiCopy className="w-3 h-3" />
            </button>
          </div>
          {contact.notes && (
            <p className="text-xs text-muted mt-1 line-clamp-2">{contact.notes}</p>
          )}
        </div>
        {showActions && (
          <div className="flex gap-2 ml-2">
            {onSendMoney && (
              <button
                onClick={handleSendMoney}
                className="p-2 text-foreground bg-primary hover:bg-primary-hover rounded transition-colors"
                aria-label={tWallet('send')}
                title={tWallet('send')}
              >
                <FiSend className="w-4 h-4 text-on-primary" />
              </button>
            )}
            {onEdit && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(contact);
                }}
                className="p-2 text-muted hover:text-primary transition-colors"
                aria-label={tCommon('edit')}
                title={tCommon('edit')}
              >
                <FiEdit2 className="w-4 h-4" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(contact.id);
                }}
                className="p-2 text-muted hover:text-danger transition-colors"
                aria-label={tCommon('delete')}
                title={tCommon('delete')}
              >
                <FiTrash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
