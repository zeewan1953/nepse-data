"use client";
import { useCallback, useState } from "react";

export type Lot = {
  id: string;
  symbol: string;
  qty: number;
  buyPrice: number;
  date: string; // yyyy-mm-dd
  note?: string;
};

// A "buy setup" / watchlist entry — what to buy next and at what target.
export type Setup = {
  id: string;
  symbol: string;
  targetPrice: number;
  qty: number;
  note?: string;
};

const LOTS_KEY = "darisir.lots";
const SETUPS_KEY = "darisir.setups";

function read<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

function makeId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function useStore<T extends { id: string }>(key: string) {
  const [items, setItems] = useState<T[]>(() => read<T>(key));

  const persist = useCallback(
    (next: T[]) => {
      setItems(next);
      localStorage.setItem(key, JSON.stringify(next));
    },
    [key],
  );

  const add = useCallback((item: Omit<T, "id">) => {
    persist([...read<T>(key), { ...item, id: makeId() } as T]);
  }, [key, persist]);

  const remove = useCallback((id: string) => {
    persist(read<T>(key).filter((x) => x.id !== id));
  }, [key, persist]);

  return { items, add, remove };
}

export function useLots() {
  return useStore<Lot>(LOTS_KEY);
}

export function useSetups() {
  return useStore<Setup>(SETUPS_KEY);
}
