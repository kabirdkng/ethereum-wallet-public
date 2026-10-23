"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { isAddress } from "viem";
import { FiSave, FiX } from "react-icons/fi";

interface ContactFormData {
  name: string;
  walletAddress: string;
  notes: string;
}

interface ContactFormProps {
  initialData?: ContactFormData;
  onSubmit: (data: ContactFormData) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
}

export function ContactForm({ 
  initialData, 
  onSubmit, 
  onCancel, 
  submitLabel 
}: ContactFormProps) {
  const t = useTranslations('contacts');
  const tCommon = useTranslations('common');
  
  const [formData, setFormData] = useState<ContactFormData>(
    initialData || { name: "", walletAddress: "", notes: "" }
  );
  const [formErrors, setFormErrors] = useState<{
    name?: string;
    walletAddress?: string;
    notes?: string;
  }>({});
  const [submitting, setSubmitting] = useState(false);

  const validateForm = () => {
    const errors: typeof formErrors = {};

    if (!formData.name.trim()) {
      errors.name = t('errors.nameRequired');
    }

    if (!formData.walletAddress.trim()) {
      errors.walletAddress = t('errors.addressRequired');
    } else if (!isAddress(formData.walletAddress)) {
      errors.walletAddress = t('errors.invalidAddress');
    }

    if (formData.notes && formData.notes.length > 500) {
      errors.notes = t('errors.notesTooLong');
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      await onSubmit(formData);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium mb-1 text-foreground">
          {t('name')} <span className="text-danger">*</span>
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full px-3 py-2 border border-default rounded-lg bg-card text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary"
          placeholder={t('namePlaceholder')}
          disabled={submitting}
        />
        {formErrors.name && (
          <p className="text-danger text-xs mt-1">{formErrors.name}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1 text-foreground">
          {t('walletAddress')} <span className="text-danger">*</span>
        </label>
        <input
          type="text"
          value={formData.walletAddress}
          onChange={(e) => setFormData({ ...formData, walletAddress: e.target.value })}
          className="w-full px-3 py-2 border border-default rounded-lg bg-card text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono text-sm"
          placeholder="0x..."
          disabled={submitting}
        />
        {formErrors.walletAddress && (
          <p className="text-danger text-xs mt-1">{formErrors.walletAddress}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1 text-foreground">
          {t('notes')} <span className="text-muted text-xs">({t('optional')})</span>
        </label>
        <textarea
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          className="w-full px-3 py-2 border border-default rounded-lg bg-card text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
          placeholder={t('notesPlaceholder')}
          rows={2}
          disabled={submitting}
        />
        {formErrors.notes && (
          <p className="text-danger text-xs mt-1">{formErrors.notes}</p>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50"
        >
          <FiSave className="w-4 h-4" />
          {submitLabel || tCommon('save')}
        </button>
        <button
          onClick={onCancel}
          disabled={submitting}
          className="flex items-center gap-2 px-4 py-2 bg-card-muted rounded-lg hover:bg-card-hover transition-colors disabled:opacity-50 text-foreground"
        >
          <FiX className="w-4 h-4" />
          {tCommon('cancel')}
        </button>
      </div>
    </div>
  );
}
