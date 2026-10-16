"use client";

/**
 * Browser-local persistence (IndexedDB). Saved history stays here; submitted context is sent to the AI provider.
 * Schema is deliberately simple: one object store, messages embedded in the
 * conversation record (chats are small; one put saves everything atomically).
 */

export interface Attachment {
  kind: "image" | "pdf";
  url: string; // data URL
  name: string;
}

export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  model?: string;
  attachments?: Attachment[];
  tokens?: number; // completion tokens reported by OpenRouter
  createdAt: number;
}

export interface Conversation {
  id: string;
  title: string;
  modelId: string;
  messages: StoredMessage[];
  createdAt: number;
  updatedAt: number;
}

const DB_NAME = "maildesk-ai-studio";
const DB_VERSION = 2;
const STORE = "conversations";
const GEN_STORE = "generations";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(GEN_STORE)) {
        db.createObjectStore(GEN_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
  name = STORE,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    let tx: IDBTransaction;
    let req: IDBRequest<T>;
    try {
      tx = db.transaction(name, mode);
      req = fn(tx.objectStore(name));
      tx.oncomplete = () => { db.close(); resolve(req.result); };
      tx.onabort = () => { db.close(); reject(tx.error ?? new Error("Browser storage transaction was aborted.")); };
      tx.onerror = () => { db.close(); reject(tx.error ?? new Error("Browser storage transaction failed.")); };
      // A request succeeding is not a committed save: quota/abort errors can
      // still follow. Only transaction completion resolves this operation.
      req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
    } catch (error) {
      db.close();
      reject(error);
    }
  });
}

export async function getAllConversations(): Promise<Conversation[]> {
  const all = await withStore<Conversation[]>("readonly", (s) => s.getAll() as IDBRequest<Conversation[]>);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveConversation(conversation: Conversation): Promise<void> {
  await withStore("readwrite", (s) => s.put(conversation) as IDBRequest<IDBValidKey>);
}

export async function deleteConversation(id: string): Promise<void> {
  await withStore("readwrite", (s) => s.delete(id) as IDBRequest<undefined>);
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function titleFromText(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 48 ? `${clean.slice(0, 48)}…` : clean || "New chat";
}

/* ── Image-generation gallery ────────────────────────────────── */

export interface Generation {
  id: string;
  prompt: string;
  model: string;
  dataUrl: string;
  createdAt: number;
}

export async function saveGeneration(gen: Generation): Promise<void> {
  await withStore("readwrite", s => s.put(gen), GEN_STORE);
}

export async function getAllGenerations(): Promise<Generation[]> {
  const all = await withStore<Generation[]>("readonly", s => s.getAll(), GEN_STORE);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}
