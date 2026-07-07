"use client";
import { createContext, useContext, useState, useCallback } from "react";

interface MyWordsCtx {
  savedTodayCount: number;
  save: (word: string) => Promise<void>;
}
const Ctx = createContext<MyWordsCtx | null>(null);

export function MyWordsProvider({
  children,
  initialCount = 0,
}: {
  children: React.ReactNode;
  initialCount?: number;
}) {
  const [count, setCount] = useState(initialCount);
  const save = useCallback(async (word: string) => {
    await fetch("/api/my-words", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ word }),
    });
    setCount((c) => c + 1);
  }, []);
  return <Ctx.Provider value={{ savedTodayCount: count, save }}>{children}</Ctx.Provider>;
}

export function useMyWords(): MyWordsCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMyWords must be used within MyWordsProvider");
  return ctx;
}
