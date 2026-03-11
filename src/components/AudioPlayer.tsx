"use client";

import { useReducer, useRef, useEffect, useState, useCallback } from "react";
import { ToolCard } from "./ToolCard";
import { downloadFileFromUrl } from "../lib/download-browser";

interface AudioPlayerProps {
  title: string;
  text: string;
}

/* ── helpers ─────────────────────────────────────────────────────── */

function formatTime(seconds: number): string {
  if (isNaN(seconds) || !isFinite(seconds)) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function estimateAudioDuration(text: string) {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(2, Math.ceil(words / 2.5)); // ~2.5 words/sec for tts-1
}

function estimateGenTime(text: string) {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(3, Math.ceil(words / 30));
}

/* ── loading-stage hook ──────────────────────────────────────────── */

const LOADING_STAGES = [
  { label: "Connecting to speech engine…", delay: 0 },
  { label: "Generating speech…", delay: 2000 },
  { label: "Streaming audio…", delay: 6000 },
  { label: "Almost ready…", delay: 12000 },
];

function useLoadingStage(isLoading: boolean) {
  const [stage, setStage] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isLoading) {
      setStage(0);
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const tick = setInterval(() => {
      const ms = Date.now() - start;
      setElapsed(Math.floor(ms / 1000));
      const next = LOADING_STAGES.findLastIndex((s) => ms >= s.delay);
      if (next >= 0) setStage(next);
    }, 200);
    return () => clearInterval(tick);
  }, [isLoading]);

  return { label: LOADING_STAGES[stage].label, elapsed };
}

/* ── state ───────────────────────────────────────────────────────── */

type AudioState = {
  isPlaying: boolean;
  isLoading: boolean;
  audioUrl: string | null;
  error: string | null;
  currentTime: number;
  duration: number;
  progress: number; // 0-1 streaming fetch progress
};

type AudioAction =
  | { type: "START_LOAD" }
  | { type: "LOAD_SUCCESS"; url: string }
  | { type: "LOAD_ERROR"; error: string }
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | { type: "TIME_UPDATE"; currentTime: number }
  | { type: "DURATION_UPDATE"; duration: number }
  | { type: "PROGRESS"; progress: number };

function audioReducer(state: AudioState, action: AudioAction): AudioState {
  switch (action.type) {
    case "START_LOAD":
      return { ...state, isLoading: true, error: null, progress: 0 };
    case "LOAD_SUCCESS":
      return { ...state, isLoading: false, audioUrl: action.url, progress: 1 };
    case "LOAD_ERROR":
      return { ...state, isLoading: false, error: action.error };
    case "PLAY":
      return { ...state, isPlaying: true };
    case "PAUSE":
      return { ...state, isPlaying: false };
    case "TIME_UPDATE":
      return { ...state, currentTime: action.currentTime };
    case "DURATION_UPDATE":
      return { ...state, duration: action.duration };
    case "PROGRESS":
      return { ...state, progress: action.progress };
    default:
      return state;
  }
}

/* ── component ───────────────────────────────────────────────────── */

export function AudioPlayer({ title, text }: AudioPlayerProps) {
  const [state, dispatch] = useReducer(audioReducer, {
    isPlaying: false,
    isLoading: false,
    audioUrl: null,
    error: null,
    currentTime: 0,
    duration: 0,
    progress: 0,
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasStarted = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showFullText, setShowFullText] = useState(false);
  const [offScreenReady, setOffScreenReady] = useState(false);

  const loadingStage = useLoadingStage(state.isLoading);

  const estDuration = estimateAudioDuration(text);
  const estGenTime = estimateGenTime(text);

  // Clean up object URL when unmounted
  useEffect(() => {
    return () => {
      if (state.audioUrl) {
        URL.revokeObjectURL(state.audioUrl);
      }
    };
  }, [state.audioUrl]);

  /* ── core fetch with streaming progress ───────────────────────── */

  const fetchAndPlay = useCallback(async () => {
    dispatch({ type: "START_LOAD" });
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const msg = body?.error || `TTS failed (${response.status})`;
        throw new Error(msg);
      }

      // Stream chunks for progress tracking
      const contentLength = response.headers.get("Content-Length");
      const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
      const reader = response.body?.getReader();

      if (!reader) {
        // Fallback: no streaming support
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        dispatch({ type: "LOAD_SUCCESS", url });
        await createAndPlay(url);
        return;
      }

      const chunks: BlobPart[] = [];
      let receivedBytes = 0;
      const genStart = Date.now();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        receivedBytes += value.length;

        // Progress: use Content-Length if available, otherwise estimate from time
        if (totalBytes > 0) {
          dispatch({ type: "PROGRESS", progress: receivedBytes / totalBytes });
        } else {
          const elapsed = (Date.now() - genStart) / 1000;
          const estimated = Math.min(0.95, elapsed / (estGenTime * 1.2));
          dispatch({ type: "PROGRESS", progress: estimated });
        }
      }

      const blob = new Blob(chunks, { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);

      // Try MediaSource streaming if supported, else use blob URL
      dispatch({ type: "LOAD_SUCCESS", url });
      await createAndPlay(url);
    } catch (err) {
      console.error(err);
      dispatch({
        type: "LOAD_ERROR",
        error: err instanceof Error ? err.message : "Failed to generate audio.",
      });
    }
  }, [text, estGenTime]);

  async function createAndPlay(url: string) {
    const audio = new Audio(url);
    audioRef.current = audio;

    audio.addEventListener("timeupdate", () =>
      dispatch({ type: "TIME_UPDATE", currentTime: audio.currentTime }),
    );
    audio.addEventListener("loadedmetadata", () =>
      dispatch({ type: "DURATION_UPDATE", duration: audio.duration }),
    );
    audio.addEventListener("play", () => dispatch({ type: "PLAY" }));
    audio.addEventListener("pause", () => dispatch({ type: "PAUSE" }));
    audio.addEventListener("ended", () => dispatch({ type: "PAUSE" }));

    await audio.play();
  }

  /* ── #1: Auto-generate on mount ────────────────────────────────── */

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    fetchAndPlay();
  }, [fetchAndPlay]);

  /* ── #5: Off-screen toast via IntersectionObserver ─────────────── */

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        // Audio just finished loading while off-screen
        if (!entry.isIntersecting && state.audioUrl && !state.isLoading) {
          setOffScreenReady(true);
        }
        if (entry.isIntersecting) {
          setOffScreenReady(false);
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [state.audioUrl, state.isLoading]);

  const scrollToPlayer = () => {
    containerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setOffScreenReady(false);
  };

  /* ── playback controls ─────────────────────────────────────────── */

  function handlePlayToggle() {
    if (state.error || state.isLoading) return;
    if (audioRef.current) {
      if (state.isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    dispatch({ type: "TIME_UPDATE", currentTime: time });
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const handleDownload = () => {
    if (!state.audioUrl) return;
    downloadFileFromUrl(
      state.audioUrl,
      `${title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.mp3`,
    );
  };

  /* ── derived values ────────────────────────────────────────────── */

  const status = state.isLoading
    ? "loading"
    : state.error
      ? "error"
      : "success";

  const progressPercent = Math.round(state.progress * 100);

  const subtitleContent = state.error ? (
    <span className="text-red-500">{state.error}</span>
  ) : state.isLoading ? (
    <span className="text-[var(--accent-color)] animate-pulse">
      {loadingStage.label} ({loadingStage.elapsed}s)
      {" · "}
      <span className="opacity-70">
        ~{estDuration}s audio · est. {estGenTime}s to generate
      </span>
    </span>
  ) : (
    <span>
      OpenAI Speech · {formatTime(state.duration)}
    </span>
  );

  /* ── text preview ──────────────────────────────────────────────── */

  const previewText = text.length > 150 ? text.slice(0, 150) + "…" : text;
  const showTextPreview = state.isLoading || (!state.isPlaying && !state.audioUrl);

  /* ── render ────────────────────────────────────────────────────── */

  return (
    <>
      <div ref={containerRef}>
        <ToolCard
          title={title || "Generated Audio"}
          subtitle={subtitleContent}
          status={status}
          onDownload={state.audioUrl ? handleDownload : undefined}
          downloadTooltip="Download MP3"
          icon={
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
          }
        >
          <div className="flex flex-col gap-3 p-4 w-full">
            {/* ── Progress bar (during loading) ──────────────────────── */}
            {state.isLoading && (
              <div className="w-full h-1 rounded-full bg-[var(--border-color)] overflow-hidden">
                <div
                  className="h-full bg-[var(--accent-color)] rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            )}

            {/* ── Control Row ────────────────────────────────────────── */}
            <div className="flex items-center gap-4">
              <button
                onClick={handlePlayToggle}
                disabled={state.isLoading || !!state.error}
                className="w-12 h-12 shrink-0 flex items-center justify-center rounded-full bg-accent text-accent-foreground hover:bg-accent-theme/90 transition-all disabled:opacity-50 active:scale-95 shadow-md"
              >
                {state.isLoading ? (
                  <svg
                    className="w-5 h-5 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                  </svg>
                ) : state.isPlaying ? (
                  <svg className="w-5 h-5 fill-current ml-[1px]" viewBox="0 0 24 24">
                    <rect x="6" y="4" width="4" height="16" />
                    <rect x="14" y="4" width="4" height="16" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 fill-current ml-1" viewBox="0 0 24 24">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                )}
              </button>

              {/* Shuttle & Timestamps */}
              <div className="flex flex-col flex-1 gap-1.5 min-w-0">
                <input
                  type="range"
                  min={0}
                  max={state.duration || 100}
                  value={state.currentTime}
                  onChange={handleSeek}
                  disabled={!state.audioUrl}
                  className="w-full h-1.5 bg-border rounded-lg appearance-none cursor-pointer accent-accent"
                  style={{
                    background: state.audioUrl
                      ? `linear-gradient(to right, var(--accent) ${(state.currentTime / state.duration) * 100}%, var(--border) ${(state.currentTime / state.duration) * 100}%)`
                      : undefined,
                  }}
                />
                <div className="flex justify-between text-[10px] font-mono text-text/50">
                  <span>{formatTime(state.currentTime)}</span>
                  <span>
                    {state.audioUrl
                      ? formatTime(state.duration)
                      : `~${formatTime(estDuration)}`}
                  </span>
                </div>
              </div>
            </div>

            {/* ── #6: Text preview while loading ─────────────────────── */}
            {(showTextPreview || showFullText) && (
              <div className="relative">
                <div
                  className={`text-xs opacity-60 leading-relaxed ${showFullText ? "max-h-[120px] overflow-y-auto" : "max-h-[3lh] overflow-hidden"}`}
                >
                  {showFullText ? text : previewText}
                </div>
                {!showFullText && text.length > 150 && (
                  <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-[var(--surface)] to-transparent" />
                )}
                <button
                  type="button"
                  onClick={() => setShowFullText(!showFullText)}
                  className="text-[10px] font-semibold text-[var(--accent-color)] hover:underline mt-1"
                >
                  {showFullText ? "Hide text" : "Show full text"}
                </button>
              </div>
            )}

            {/* Waveform Visualizer */}
            <div
              className="flex items-center justify-center gap-[3px] h-6 mt-1 transition-opacity duration-300"
              style={{
                opacity: state.isPlaying ? 0.4 : state.isLoading ? 0.25 : 0.1,
              }}
            >
              {[...Array(32)].map((_, i) => (
                <div
                  key={i}
                  className="w-1 bg-current rounded-full transition-all duration-150 origin-bottom"
                  style={{
                    height: state.isPlaying || state.isLoading ? "100%" : "20%",
                    animation: state.isPlaying
                      ? `wave 1.2s ease-in-out infinite alternate ${i * 0.05}s`
                      : state.isLoading
                        ? `wave 2s ease-in-out infinite alternate ${i * 0.08}s`
                        : "none",
                  }}
                />
              ))}
            </div>
          </div>

          <style
            dangerouslySetInnerHTML={{
              __html: `
                @keyframes wave {
                    0% { height: 10%; }
                    50% { height: 100%; }
                    100% { height: 20%; }
                }
              `,
            }}
          />
        </ToolCard>
      </div>

      {/* ── #5: Off-screen toast ──────────────────────────────────── */}
      {offScreenReady && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] animate-in slide-in-from-bottom-4 fade-in duration-300">
          <button
            type="button"
            onClick={scrollToPlayer}
            className="flex items-center gap-2 rounded-full bg-[var(--accent-color)] text-[var(--accent-foreground)] px-4 py-2 text-xs font-semibold shadow-lg hover:shadow-xl transition-all hover:scale-[1.02] active:scale-95"
          >
            <span>🎧</span>
            <span>Audio ready — {title}</span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v14M5 12l7 7 7-7" />
            </svg>
          </button>
        </div>
      )}
    </>
  );
}
