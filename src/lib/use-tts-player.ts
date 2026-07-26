"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** How many upcoming clips to warm while the current one plays. */
const PREFETCH = 3;

export interface TtsPlayer {
  playing: boolean;
  /** Waiting on the server to synthesize the current sentence. */
  loading: boolean;
  index: number;
  total: number;
  sentence: string;
  toggle: () => void;
  stop: () => void;
  skip: (delta: number) => void;
}

/**
 * Play a list of sentences one after another through /api/tts. Clips are
 * fetched per sentence (the server serves them from its disk cache when the
 * pre-generation worker has already made them) and the next few are warmed
 * while the current one plays.
 */
export function useTtsPlayer(sentences: string[]): TtsPlayer {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [index, setIndex] = useState(0);

  const audio = useRef<HTMLAudioElement | null>(null);
  const clips = useRef<Map<number, Promise<string>>>(new Map());
  const run = useRef(0); // invalidates in-flight loads after stop/skip
  const list = useRef<string[]>(sentences);
  list.current = sentences;

  const getClip = useCallback((i: number): Promise<string> => {
    const cached = clips.current.get(i);
    if (cached) return cached;
    const text = list.current[i];
    const p = fetch(`/api/tts?text=${encodeURIComponent(text)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`tts ${r.status}`);
        return r.blob();
      })
      .then((b) => URL.createObjectURL(b))
      .catch((err) => {
        clips.current.delete(i);
        throw err;
      });
    clips.current.set(i, p);
    return p;
  }, []);

  const playAt = useCallback(
    async (i: number) => {
      if (i < 0 || i >= list.current.length) return;
      const myRun = ++run.current;
      setIndex(i);
      setPlaying(true);
      const el = audio.current ?? (audio.current = new Audio());
      el.pause();
      const known = clips.current.has(i);
      if (!known) setLoading(true);
      try {
        const url = await getClip(i);
        if (run.current !== myRun) return;
        setLoading(false);
        el.src = url;
        el.onended = () => {
          if (run.current !== myRun) return;
          if (i + 1 < list.current.length) playAt(i + 1);
          else {
            setPlaying(false);
            setIndex(0);
          }
        };
        await el.play();
        for (let k = 1; k <= PREFETCH; k++) {
          if (i + k < list.current.length) getClip(i + k).catch(() => {});
        }
      } catch {
        if (run.current !== myRun) return;
        setLoading(false);
        setPlaying(false);
      }
    },
    [getClip]
  );

  const toggle = useCallback(() => {
    const el = audio.current;
    if (playing) {
      run.current++; // cancel any pending load
      el?.pause();
      setPlaying(false);
      setLoading(false);
      return;
    }
    if (el && el.src && !el.ended && el.currentTime > 0) {
      setPlaying(true);
      el.play().catch(() => setPlaying(false));
      return;
    }
    playAt(index);
  }, [playing, index, playAt]);

  const stop = useCallback(() => {
    run.current++;
    audio.current?.pause();
    setPlaying(false);
    setLoading(false);
    setIndex(0);
  }, []);

  const skip = useCallback(
    (delta: number) => {
      const next = Math.min(Math.max(index + delta, 0), Math.max(list.current.length - 1, 0));
      playAt(next);
    },
    [index, playAt]
  );

  // New content -> start over, and never leak object URLs.
  useEffect(() => {
    run.current++;
    audio.current?.pause();
    setPlaying(false);
    setLoading(false);
    setIndex(0);
    const old = clips.current;
    clips.current = new Map();
    old.forEach((p) => p.then(URL.revokeObjectURL).catch(() => {}));
  }, [sentences]);

  useEffect(
    () => () => {
      run.current++;
      audio.current?.pause();
      clips.current.forEach((p) => p.then(URL.revokeObjectURL).catch(() => {}));
    },
    []
  );

  return {
    playing,
    loading,
    index,
    total: sentences.length,
    sentence: sentences[index] ?? "",
    toggle,
    stop,
    skip,
  };
}
