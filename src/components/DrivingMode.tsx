"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Card, KnowledgeDetail } from "@/lib/types";
import type { FeedMode, FeedPage } from "@/lib/feed";
import { markdownToSpeech, splitSentences } from "@/lib/speech-text";

type Phase = "intro" | "playing" | "paused" | "done" | "error";

interface Ctrl {
  paused: boolean;
  skip: boolean;
  dir: string; // "next" | "prev"
  exit: boolean;
  repeat: boolean;
  audio: HTMLAudioElement | null;
  stopClip: (() => void) | null;
  pauseClip: (() => void) | null;
  resumeClip: (() => void) | null;
}

function cardKey(c: Card) {
  return `${c.type}-${c.id}`;
}

export function DrivingMode({ mode, onClose }: { mode: FeedMode; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [error, setError] = useState<string | null>(null);
  const [cardTitle, setCardTitle] = useState("");
  const [cardCat, setCardCat] = useState("");
  const [curWords, setCurWords] = useState<string[]>([]);
  const [curVi, setCurVi] = useState("");
  const [activeWord, setActiveWord] = useState(0);
  const viCache = useRef<Map<string, string>>(new Map());
  const [speaking, setSpeaking] = useState(false);
  const [clipPct, setClipPct] = useState(0);
  const [repeat, setRepeat] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordUrl, setRecordUrl] = useState<string | null>(null);
  const [recError, setRecError] = useState<string | null>(null);

  const sentenceRef = useRef("");
  const wordPrefixRef = useRef<number[]>([]);
  const wordTotalRef = useRef(1);
  const mediaRec = useRef<MediaRecorder | null>(null);
  const recChunks = useRef<Blob[]>([]);

  const ctrl = useRef<Ctrl>({
    paused: false, skip: false, dir: "next", exit: false, repeat: false,
    audio: null, stopClip: null, pauseClip: null, resumeClip: null,
  });

  const setCurrentSentence = useCallback((sentence: string) => {
    sentenceRef.current = sentence;
    const words = sentence.split(/\s+/).filter(Boolean);
    setCurWords(words);
    setActiveWord(0);
    const prefix: number[] = [];
    let acc = 0;
    for (const w of words) {
      prefix.push(acc);
      acc += w.length + 1; // weight by word length (+1) for rough timing
    }
    wordPrefixRef.current = prefix;
    wordTotalRef.current = acc || 1;

    // Fetch the Vietnamese translation for the subtitle (cached).
    const hasLetters = /[A-Za-z]/.test(sentence);
    if (!hasLetters) {
      setCurVi("");
      return;
    }
    const cached = viCache.current.get(sentence);
    if (cached !== undefined) {
      setCurVi(cached);
      return;
    }
    setCurVi("");
    fetch(`/api/translate?text=${encodeURIComponent(sentence)}`)
      .then((r) => r.json())
      .then((d: { vi: string | null }) => {
        const vi = d.vi ?? "";
        viCache.current.set(sentence, vi);
        if (sentenceRef.current === sentence) setCurVi(vi);
      })
      .catch(() => {});
  }, []);

  // ---- feed queue ----
  const cards = useRef<Card[]>([]);
  const cursor = useRef<string | null>(null);
  const played = useRef<Set<string>>(new Set());
  const idx = useRef(0);
  // ---- audio prefetch cache (sentence text -> object URL promise) ----
  const audioCache = useRef<Map<string, Promise<string>>>(new Map());

  const fetchPage = useCallback(
    (cur: string | null): Promise<FeedPage> => {
      const q = cur ? `&cursor=${encodeURIComponent(cur)}` : "";
      return fetch(`/api/feed?mode=${mode}${q}`).then((r) => r.json());
    },
    [mode]
  );

  const addNew = useCallback((page: FeedPage) => {
    let added = 0;
    for (const c of page.cards) {
      if (!played.current.has(cardKey(c)) && !cards.current.some((x) => cardKey(x) === cardKey(c))) {
        cards.current.push(c);
        added++;
      }
    }
    return added;
  }, []);

  const getMore = useCallback(async (): Promise<boolean> => {
    if (cursor.current) {
      const page = await fetchPage(cursor.current);
      cursor.current = page.nextCursor;
      if (addNew(page) > 0) return true;
    }
    if (mode === "knowledge") {
      try {
        await fetch("/api/knowledge/topup", { method: "POST" });
      } catch {
        /* ignore */
      }
      const page = await fetchPage(null);
      cursor.current = page.nextCursor;
      if (addNew(page) > 0) return true;
    }
    return false;
  }, [fetchPage, addNew, mode]);

  async function buildSentences(card: Card): Promise<string[]> {
    let text = `${card.title_en}. ${card.summary_en}`;
    if (card.type === "knowledge") {
      try {
        const d: KnowledgeDetail = await fetch(`/api/knowledge/${card.id}`).then((r) => r.json());
        if (d?.detail_md) text += ". " + markdownToSpeech(d.detail_md);
      } catch {
        /* summary only */
      }
    }
    return splitSentences(text);
  }

  // Fetch (and cache) the audio URL for one sentence from the backend.
  function getAudio(sentence: string): Promise<string> {
    const cache = audioCache.current;
    let p = cache.get(sentence);
    if (!p) {
      p = fetch(`/api/tts?text=${encodeURIComponent(sentence)}`)
        .then((r) => {
          if (!r.ok) throw new Error("tts fetch failed");
          return r.blob();
        })
        .then((b) => URL.createObjectURL(b));
      cache.set(sentence, p);
    }
    return p;
  }

  function playUrl(url: string): Promise<void> {
    return new Promise((resolve) => {
      const c = ctrl.current;
      const audio = new Audio(url);
      c.audio = audio;
      const done = () => {
        c.audio = null;
        c.stopClip = c.pauseClip = c.resumeClip = null;
        setSpeaking(false);
        resolve();
      };
      audio.onended = done;
      audio.onerror = done;
      audio.onplay = () => {
        setSpeaking(true);
        setClipPct(0);
        setPlaybackState("playing");
      };
      audio.ontimeupdate = () => {
        if (!audio.duration) return;
        const p = audio.currentTime / audio.duration;
        setClipPct(Math.round(p * 100));
        const prefix = wordPrefixRef.current;
        const total = wordTotalRef.current;
        let i = 0;
        while (i + 1 < prefix.length && prefix[i + 1] / total <= p) i++;
        setActiveWord(i);
      };
      c.stopClip = () => {
        audio.pause();
        done();
      };
      c.pauseClip = () => audio.pause();
      c.resumeClip = () => audio.play().catch(() => {});
      if (!c.paused) audio.play().catch(done);
    });
  }

  async function waitWhilePaused() {
    const c = ctrl.current;
    while (c.paused && !c.exit && !c.skip) {
      await new Promise((r) => setTimeout(r, 120));
    }
  }

  async function playCard(card: Card) {
    const c = ctrl.current;
    setCardTitle(card.title_en);
    setCardCat(card.type === "knowledge" ? `🧠 ${card.category}` : `📰 ${card.category}`);
    updateMediaSession(card);
    setCurrentSentence("…");
    const sentences = await buildSentences(card);
    if (c.exit || c.skip) return;

    let s = 0;
    while (s < sentences.length) {
      if (c.exit || c.skip) break;
      setCurrentSentence(sentences[s]);
      const urlP = getAudio(sentences[s]);
      if (sentences[s + 1]) getAudio(sentences[s + 1]); // prefetch next
      let url: string;
      try {
        url = await urlP;
      } catch {
        s++;
        continue; // skip sentences that fail to synthesize
      }
      await waitWhilePaused();
      if (c.exit || c.skip) break;
      await playUrl(url);
      if (c.exit) break;
      await waitWhilePaused();
      if (c.exit || c.skip) break;
      // Repeat mode replays the same sentence instead of advancing.
      if (!c.repeat) s++;
    }
  }

  async function run() {
    const c = ctrl.current;
    while (!c.exit) {
      if (idx.current >= cards.current.length) {
        const ok = await getMore();
        if (c.exit) break;
        if (!ok) {
          setPhase("done");
          break;
        }
      }
      const card = cards.current[idx.current];
      if (!card) break;
      played.current.add(cardKey(card));
      c.skip = false;
      c.dir = "next";
      await playCard(card);
      if (c.exit) break;
      const dir: string = ctrl.current.dir;
      idx.current = dir === "prev" ? Math.max(0, idx.current - 1) : idx.current + 1;
    }
  }

  const start = useCallback(async () => {
    setError(null);
    try {
      const page = await fetchPage(null);
      cursor.current = page.nextCursor;
      addNew(page);
      if (cards.current.length === 0) {
        setError(mode === "knowledge" ? "Chưa có thẻ kiến thức nào." : "Chưa có tin nào.");
        setPhase("error");
        return;
      }
      setupMediaSession();
      setPlaybackState("playing");
      setPhase("playing");
      run();
    } catch (err) {
      console.error("driving start failed", err);
      setError("Không tải được nội dung. Kiểm tra mạng và thử lại.");
      setPhase("error");
    }
  }, [fetchPage, addNew, mode]);

  useEffect(() => {
    return () => {
      ctrl.current.exit = true;
      ctrl.current.stopClip?.();
    };
  }, []);

  function setPlaybackState(s: MediaSessionPlaybackState) {
    try {
      if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
        navigator.mediaSession.playbackState = s;
      }
    } catch {
      /* noop */
    }
  }
  function doPause() {
    const c = ctrl.current;
    c.paused = true;
    c.pauseClip?.();
    setPhase("paused");
    setPlaybackState("paused");
  }
  function doResume() {
    const c = ctrl.current;
    c.paused = false;
    c.resumeClip?.();
    setPhase("playing");
    setPlaybackState("playing");
  }
  function togglePause() {
    if (ctrl.current.paused) doResume();
    else doPause();
  }
  function skip(dir: "next" | "prev") {
    const c = ctrl.current;
    c.dir = dir;
    c.skip = true;
    c.paused = false;
    c.stopClip?.();
    setPhase("playing");
    setPlaybackState("playing");
  }
  function setupMediaSession() {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    try {
      ms.setActionHandler("play", () => doResume());
      ms.setActionHandler("pause", () => doPause());
      ms.setActionHandler("nexttrack", () => skip("next"));
      ms.setActionHandler("previoustrack", () => skip("prev"));
    } catch {
      /* some handlers unsupported */
    }
  }
  function updateMediaSession(card: Card) {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    if (typeof MediaMetadata === "undefined") return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: card.title_en,
        artist: `DailyTok · ${card.type === "knowledge" ? "🧠 " : "📰 "}${card.category}`,
        album: "DailyTok",
        artwork: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      });
    } catch {
      /* noop */
    }
  }
  function toggleRepeat() {
    ctrl.current.repeat = !ctrl.current.repeat;
    setRepeat(ctrl.current.repeat);
  }

  async function toggleRecord() {
    if (recording) {
      mediaRec.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      recChunks.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size) recChunks.current.push(e.data);
      };
      mr.onstop = () => {
        const blob = new Blob(recChunks.current, { type: mr.mimeType || "audio/webm" });
        setRecordUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
      };
      mediaRec.current = mr;
      mr.start();
      setRecording(true);
      setRecError(null);
      doPause(); // pause TTS so it doesn't bleed into the recording
    } catch {
      setRecError("Không truy cập được micro. Cần chạy qua HTTPS để ghi âm.");
    }
  }

  function playRecording() {
    if (recordUrl) new Audio(recordUrl).play().catch(() => {});
  }

  // Keyboard shortcuts (desktop): r repeat, space play/pause, arrows skip.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      const k = e.key.toLowerCase();
      if (k === "r") {
        e.preventDefault();
        toggleRepeat();
      } else if (k === " ") {
        e.preventDefault();
        togglePause();
      } else if (k === "arrowright") {
        skip("next");
      } else if (k === "arrowleft") {
        skip("prev");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function exit() {
    ctrl.current.exit = true;
    ctrl.current.stopClip?.();
    try {
      if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
        const ms = navigator.mediaSession;
        ms.playbackState = "none";
        for (const a of ["play", "pause", "nexttrack", "previoustrack"] as const) {
          ms.setActionHandler(a, null);
        }
      }
    } catch {
      /* noop */
    }
    onClose();
  }

  return (
    <div className="driving" role="dialog" aria-label="Driving mode">
      <div className="driving-top">
        <span className="driving-cat">{cardCat || "🚗 Driving"}</span>
        <button type="button" className="driving-x" onClick={exit} aria-label="Thoát">
          ✕
        </button>
      </div>

      {phase === "intro" && (
        <div className="driving-center">
          <div className="driving-hero">🚗</div>
          <h2 className="driving-h">Chế độ Lái xe</h2>
          <p className="driving-sub">
            Nghe cả feed {mode === "knowledge" ? "kiến thức" : "tin tức"} như podcast, rảnh tay.
            Giọng đọc sinh sẵn ở máy chủ nên máy bạn chỉ việc phát.
          </p>
          <button type="button" className="driving-start" onClick={start}>
            ▶ Bắt đầu
          </button>
        </div>
      )}

      {phase === "error" && (
        <div className="driving-center">
          <p className="driving-sub">{error}</p>
          <button type="button" className="driving-start" onClick={start}>
            ↻ Thử lại
          </button>
        </div>
      )}

      {(phase === "playing" || phase === "paused" || phase === "done") && (
        <>
          {cardTitle && <div className="driving-title">{cardTitle}</div>}
          <div className="driving-stage">
            {phase === "done" ? (
              <p className="cur">— Hết —</p>
            ) : (
              <div className="cur-block" key={sentenceRef.current}>
                <p className="cur">
                  {curWords.map((w, i) => (
                    <span key={i} className={i === activeWord ? "wcur" : "wdim"}>
                      {w}{" "}
                    </span>
                  ))}
                </p>
                {curVi && <p className="cur-vi">{curVi}</p>}
              </div>
            )}
          </div>
          {phase !== "done" && (
            <div className="driving-run">
              <div className="driving-progress">
                {speaking || phase === "paused" ? (
                  <div className="pfill" style={{ width: `${clipPct}%` }} />
                ) : (
                  <div className="pindet" />
                )}
              </div>
              <div className="driving-status">
                {phase === "paused"
                  ? "⏸ Tạm dừng"
                  : speaking
                    ? "🔊 Đang đọc…"
                    : "🎙️ Đang tạo giọng…"}
              </div>
            </div>
          )}
          <div className="driving-controls">
            <button type="button" onClick={() => skip("prev")} aria-label="Thẻ trước">
              ⏮
            </button>
            <button type="button" className="big" onClick={togglePause} aria-label="Play/Pause">
              {phase === "paused" ? "▶" : "⏸"}
            </button>
            <button type="button" onClick={() => skip("next")} aria-label="Thẻ sau">
              ⏭
            </button>
          </div>
          <div className="driving-controls2">
            <button
              type="button"
              className={`dbtn2${repeat ? " on" : ""}`}
              onClick={toggleRepeat}
              title="Lặp lại câu (phím R)"
            >
              🔁 Lặp{repeat ? " ✓" : ""}
            </button>
            <button
              type="button"
              className={`dbtn2${recording ? " rec" : ""}`}
              onClick={toggleRecord}
              title="Thu âm giọng của bạn để luyện shadowing"
            >
              {recording ? "⏹ Dừng thu" : "🎤 Thu"}
            </button>
            <button
              type="button"
              className="dbtn2"
              onClick={playRecording}
              disabled={!recordUrl}
              title="Nghe lại giọng bạn vừa thu"
            >
              🔈 Nghe lại
            </button>
          </div>
          {recError && <div className="driving-recerr">{recError}</div>}
        </>
      )}
    </div>
  );
}
