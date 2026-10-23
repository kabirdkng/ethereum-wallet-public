"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { FiPlus, FiX } from "react-icons/fi";
import { ContactListItem } from "./contacts/contact-list-item";
import { ContactForm } from "./contacts/contact-form";
import { useContacts, Contact } from "@/hooks/useContacts";

interface ContactsManagerProps {
  onSendMoney?: (contact: Contact) => void;
}

export function ContactsManager({ onSendMoney }: ContactsManagerProps) {
  const tContacts = useTranslations('contacts');
  const { contacts, loading, addContact, updateContact, deleteContact } = useContacts();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  const handleAddContact = async (data: { name: string; walletAddress: string; notes?: string }) => {
    await addContact(data);
    setShowAddForm(false);
  };

  const handleUpdateContact = async (data: { name: string; walletAddress: string; notes?: string }) => {
    if (editingContact) {
      await updateContact(editingContact.id, data);
      setEditingContact(null);
    }
  };

  const handleDeleteContact = async (id: string) => {
    if (confirm(tContacts('deleteConfirm'))) {
      await deleteContact(id);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">{tContacts('title')}</h2>
        {!showAddForm && !editingContact && (
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg hover:bg-primary-hover transition-colors"
          >
            <FiPlus className="w-4 h-4" />
            {tContacts('addContact')}
          </button>
        )}
      </div>

      {showAddForm && (
        <div className="border border-default rounded-lg p-4 bg-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">{tContacts('addContact')}</h3>
            <button
              onClick={() => setShowAddForm(false)}
              className="p-2 text-muted hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <FiX className="w-5 h-5" />
            </button>
          </div>
          <ContactForm
            onSubmit={handleAddContact}
            onCancel={() => setShowAddForm(false)}
          />
        </div>
      )}

      {editingContact && (
        <div className="border border-default rounded-lg p-4 bg-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">{tContacts('editContact')}</h3>
            <button
              onClick={() => setEditingContact(null)}
              className="p-2 text-muted hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <FiX className="w-5 h-5" />
            </button>
          </div>
          <ContactForm
            initialData={{
              name: editingContact.name,
              walletAddress: editingContact.walletAddress,
              notes: editingContact.notes || "",
            }}
            onSubmit={handleUpdateContact}
            onCancel={() => setEditingContact(null)}
          />
        </div>
      )}

      {contacts.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted mb-4">{tContacts('noContacts')}</p>
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="px-4 py-2 bg-primary text-on-primary rounded-lg hover:bg-primary-hover transition-colors"
            >
              {tContacts('addFirstContact')}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {contacts.map((contact) => (
            <ContactListItem
              key={contact.id}
              contact={contact}
              onEdit={setEditingContact}
              onDelete={handleDeleteContact}
              onSendMoney={onSendMoney}
            />
          ))}
        </div>
      )}
    </div>
  );
}
