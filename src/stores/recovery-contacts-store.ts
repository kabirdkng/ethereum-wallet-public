import { create } from "zustand";

interface RecoveryContact {
  id: string;
  contactType: "email" | "phone";
  identifier: string;
  hashedIdentifier: string;
  shareData: string;
  createdAt: string;
}

interface RecoveryContactsStore {
  contacts: RecoveryContact[];
  loading: boolean;
  error: string | null;
  fetched: boolean;
  setContacts: (contacts: RecoveryContact[]) => void;
  addContact: (contact: RecoveryContact) => void;
  removeContact: (id: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearContacts: () => void;
}

export const useRecoveryContactsStore = create<RecoveryContactsStore>((set) => ({
  contacts: [],
  loading: false,
  error: null,
  fetched: false,
  setContacts: (contacts) => set({ contacts, fetched: true, loading: false, error: null }),
  addContact: (contact) =>
    set((state) => ({ contacts: [...state.contacts, contact] })),
  removeContact: (id) =>
    set((state) => ({
      contacts: state.contacts.filter((c) => c.id !== id),
    })),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
  clearContacts: () => set({ contacts: [], fetched: false, loading: false, error: null }),
}));
