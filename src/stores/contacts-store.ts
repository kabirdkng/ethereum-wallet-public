"use client";

import { create } from "zustand";

export interface Contact {
  id: string;
  name: string;
  walletAddress: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ContactsState {
  contacts: Contact[];
  loading: boolean;
  error: string | null;
  fetched: boolean; // Track if contacts have been fetched
  
  setContacts: (contacts: Contact[]) => void;
  addContact: (contact: Contact) => void;
  updateContact: (id: string, contact: Contact) => void;
  removeContact: (id: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setFetched: (fetched: boolean) => void;
  clearContacts: () => void;
}

export const useContactsStore = create<ContactsState>((set) => ({
  contacts: [],
  loading: false,
  error: null,
  fetched: false,
  
  setContacts: (contacts) => set({ contacts, fetched: true, loading: false, error: null }),
  
  addContact: (contact) =>
    set((state) => ({ contacts: [...state.contacts, contact] })),
  
  updateContact: (id, contact) =>
    set((state) => ({
      contacts: state.contacts.map((c) => (c.id === id ? contact : c)),
    })),
  
  removeContact: (id) =>
    set((state) => ({
      contacts: state.contacts.filter((c) => c.id !== id),
    })),
  
  setLoading: (loading) => set({ loading }),
  
  setError: (error) => set({ error, loading: false }),
  
  setFetched: (fetched) => set({ fetched }),
  
  clearContacts: () => set({ contacts: [], loading: false, error: null, fetched: false }),
}));
