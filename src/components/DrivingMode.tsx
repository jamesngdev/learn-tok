"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Card, KnowledgeDetail } from "@/lib/types";
import type { FeedMode, FeedPage } from "@/lib/feed";
import { markdownToSpeech } from "@/lib/speech-text";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const VOICE = "af_heart";

type Phase = "intro" | "loading" | "playing" | "paused" | "done" | "error";

interface Ctrl {
  paused: boolean;
  skip: boolean;
  dir: string; // "next" | "prev" — loose to avoid literal narrowing across awaits
  exit: boolean;
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
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [cardTitle, setCardTitle] = useState("");
  const [cardCat, setCardCat] = useState("");
  const [lines, setLines] = useState<string[]>([]); // recent sentences, last = current
  const [speaking, setSpeaking] = useState(false); // audio actively playing (vs generating)
  const [clipPct, setClipPct] = useState(0); // current clip playback %

  const ctrl = useRef<Ctrl>({
    paused: false, skip: false, dir: "next", exit: false,
    audio: null, stopClip: null, pauseClip: null, resumeClip: null,
  });
  const ttsRef = useRef<any>(null);
  const kokoroRef = useRef<any>(null);

  const showSentence = useCallback((s: string) => {
    setLines((prev) => [...prev, s].slice(-4));
  }, []);

  // ---- feed queue ----
  const cards = useRef<Card[]>([]);
  const cursor = useRef<string | null>(null);
  const played = useRef<Set<string>>(new Set());
  const idx = useRef(0);

  const fetchPage = useCallback(
    async (cur: string | null): Promise<FeedPage> => {
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
    // Next page via cursor.
    if (cursor.current) {
      const page = await fetchPage(cursor.current);
      cursor.current = page.nextCursor;
      if (addNew(page) > 0) return true;
    }
    // Knowledge: generate more, then pull fresh unseen cards.
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

  async function buildCardText(card: Card): Promise<string> {
    let text = `${card.title_en}. ${card.summary_en}`;
    if (card.type === "knowledge") {
      try {
        const d: KnowledgeDetail = await fetch(`/api/knowledge/${card.id}`).then((r) => r.json());
        if (d?.detail_md) text += ". " + markdownToSpeech(d.detail_md);
      } catch {
        /* summary only */
      }
    }
    return text;
  }

  function playClip(rawAudio: any): Promise<void> {
    return new Promise((resolve) => {
      const c = ctrl.current;
      let url: string;
      try {
        url = URL.createObjectURL(rawAudio.toBlob());
      } catch {
        resolve();
        return;
      }
      const audio = new Audio(url);
      c.audio = audio;
      const done = () => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* noop */
        }
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
      };
      audio.ontimeupdate = () => {
        if (audio.duration) setClipPct(Math.round((audio.currentTime / audio.duration) * 100));
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
    setLines(["…"]);
    const text = await buildCardText(card);
    if (c.exit || c.skip) return;

    const { TextSplitterStream } = kokoroRef.current;
    const splitter = new TextSplitterStream();
    const stream = ttsRef.current.stream(splitter, { voice: VOICE });
    splitter.push(text);
    splitter.close();

    for await (const chunk of stream) {
      if (c.exit || c.skip) break;
      const sentence = (chunk.text || "").trim();
      if (sentence) showSentence(sentence);
      await waitWhilePaused();
      if (c.exit || c.skip) break;
      await playClip(chunk.audio);
      if (c.exit) break;
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
      idx.current = c.dir === "prev" ? Math.max(0, idx.current - 1) : idx.current + 1;
    }
  }

  const start = useCallback(async () => {
    setPhase("loading");
    setError(null);
    try {
      const mod = await import("kokoro-js");
      kokoroRef.current = mod;
      const load = (device: "webgpu" | "wasm") =>
        mod.KokoroTTS.from_pretrained(MODEL_ID, {
          dtype: "q8",
          device,
          progress_callback: (e: any) => {
            if (typeof e?.progress === "number") setProgress(Math.round(e.progress));
          },
        });
      let tts;
      if (typeof navigator !== "undefined" && "gpu" in navigator) {
        try {
          tts = await load("webgpu");
        } catch {
          tts = await load("wasm");
        }
      } else {
        tts = await load("wasm");
      }
      ttsRef.current = tts;
      // Seed the queue.
      const page = await fetchPage(null);
      cursor.current = page.nextCursor;
      addNew(page);
      setPhase("playing");
      run();
    } catch (err) {
      console.error("driving start failed", err);
      setError("Không tải được giọng đọc. Thử lại hoặc kiểm tra mạng.");
      setPhase("error");
    }
  }, [fetchPage, addNew]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      ctrl.current.exit = true;
      ctrl.current.stopClip?.();
    };
  }, []);

  function togglePause() {
    const c = ctrl.current;
    c.paused = !c.paused;
    if (c.paused) {
      c.pauseClip?.();
      setPhase("paused");
    } else {
      c.resumeClip?.();
      setPhase("playing");
    }
  }
  function skip(dir: "next" | "prev") {
    const c = ctrl.current;
    c.dir = dir;
    c.skip = true;
    c.paused = false;
    c.stopClip?.();
    if (phase === "paused") setPhase("playing");
  }
  function exit() {
    const c = ctrl.current;
    c.exit = true;
    c.stopClip?.();
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
            Lần đầu cần tải giọng đọc (~80MB), sau đó lưu lại cho lần sau.
          </p>
          <button type="button" className="driving-start" onClick={start}>
            ▶ Bắt đầu
          </button>
        </div>
      )}

      {phase === "loading" && (
        <div className="driving-center">
          <div className="driving-hero">🎧</div>
          <p className="driving-sub">Đang tải giọng đọc… {progress}%</p>
          <div className="driving-bar">
            <span style={{ width: `${progress}%` }} />
          </div>
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
          <div className="driving-stage">
            <div className="driving-title">{cardTitle}</div>
            <div className="driving-lines">
              {lines.map((l, i) => (
                <p key={i} className={i === lines.length - 1 ? "cur" : "past"}>
                  {l}
                </p>
              ))}
              {phase === "done" && <p className="cur">— Hết —</p>}
            </div>
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
        </>
      )}
    </div>
  );
}
