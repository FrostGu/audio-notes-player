'use client';

import { create } from 'zustand';
import type { Shownotes, TranscriptSegment } from '@/lib/core/types';

export interface Session {
  id: string;
  name: string;
  createdAt: number;
  audioUrl: string;
  audioFileName: string;
  transcription: string;
  srtContent: string;
  segments: TranscriptSegment[];
  shownotes: Shownotes | null;
}

export type AppState = 'idle' | 'importing' | 'transcribing' | 'paused' | 'generating_notes' | 'completed' | 'error';

export interface AppStore {
  state: AppState;
  session: Session | null;

  error: string | null;
  progress: string;

  language: string;
  downloadFormat: 'txt' | 'srt';

  setState: (state: AppState) => void;
  setError: (error: string | null) => void;
  setProgress: (progress: string) => void;
  setLanguage: (lang: string) => void;
  setDownloadFormat: (format: 'txt' | 'srt') => void;

  createSession: (audioUrl: string, audioFileName: string) => void;
  updateTranscription: (text: string, srt: string, segments: TranscriptSegment[]) => void;
  appendSegments: (segments: TranscriptSegment[]) => void;
  setShownotes: (shownotes: Shownotes) => void;
  clearSession: () => void;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export const useStore = create<AppStore>((set, get) => ({
  state: 'idle',
  session: null,
  error: null,
  progress: '',
  language: 'auto',
  downloadFormat: 'txt',

  setState: (state) => set({ state }),
  setError: (error) => set({ error }),
  setProgress: (progress) => set({ progress }),
  setLanguage: (language) => set({ language }),
  setDownloadFormat: (downloadFormat) => set({ downloadFormat }),

  createSession: (audioUrl, audioFileName) => {
    // Revoke old blob URL if exists
    const oldSession = get().session;
    if (oldSession?.audioUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(oldSession.audioUrl);
    }

    set({
      session: {
        id: generateId(),
        name: audioFileName,
        createdAt: Date.now(),
        audioUrl,
        audioFileName,
        transcription: '',
        srtContent: '',
        segments: [],
        shownotes: null,
      },
      state: 'idle',
      error: null,
      progress: '',
    });
  },

  updateTranscription: (text, srt, segments) => {
    const session = get().session;
    if (!session) return;
    set({
      session: { ...session, transcription: text, srtContent: srt, segments },
    });
  },

  appendSegments: (incoming) => {
    const session = get().session;
    if (!session) return;

    const lastEndTime = session.segments.at(-1)?.endTime ?? -Infinity;
    const filtered = incoming.filter((s) => s.endTime > lastEndTime + 0.05);
    const merged = [...session.segments, ...filtered].map((segment, index) => ({
      ...segment,
      id: `segment-${index + 1}`,
    }));

    set({
      session: {
        ...session,
        segments: merged,
        transcription: merged.map((s) => s.text).join(' '),
        srtContent: merged
          .map(
            (s, i) =>
              `${i + 1}\n${formatSrtTime(s.startTime)} --> ${formatSrtTime(s.endTime)}\n${s.text}\n`
          )
          .join('\n'),
      },
    });
  },

  setShownotes: (shownotes) => {
    const session = get().session;
    if (!session) return;
    set({ session: { ...session, shownotes } });
  },

  clearSession: () => {
    const session = get().session;
    if (session?.audioUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(session.audioUrl);
    }
    set({ session: null, state: 'idle', error: null, progress: '' });
  },
}));

function formatSrtTime(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = Math.floor(safeSeconds % 60);
  const millis = Math.round((safeSeconds % 1) * 1000);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${millis.toString().padStart(3, '0')}`;
}
