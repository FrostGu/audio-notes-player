'use client';

import React from 'react';
import { useStore } from '@/client/store';
import { useAudioPlayer } from '@/client/hooks/useAudioPlayer';
import { useTranscription } from '@/client/hooks/useTranscription';
import { Button } from '@/components/ui/button';
import { Wand2, Pause, Play, Languages, Loader2 } from 'lucide-react';

export function PlayerPanel() {
  const session = useStore((s) => s.session);
  const state = useStore((s) => s.state);
  const language = useStore((s) => s.language);
  const setLanguage = useStore((s) => s.setLanguage);
  const progress = useStore((s) => s.progress);
  const { audioRef, seekTo } = useAudioPlayer();
  const { startTranscription, pauseTranscription, resetTranscription } = useTranscription();

  if (!session) return null;

  const languages = [
    { value: 'auto', label: '自动检测' },
    { value: 'zh', label: '中文' },
    { value: 'en', label: 'English' },
  ];

  const isTranscribing = state === 'transcribing';
  const isPaused = state === 'paused';
  const isGenerating = state === 'generating_notes';

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.07] p-4 shadow-2xl shadow-black/25 backdrop-blur-xl">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
        <audio ref={audioRef} controls className="w-full min-w-0 rounded-lg bg-slate-950">
          <source src={session.audioUrl} />
        </audio>

        <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
          <label className="flex h-11 items-center gap-2 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-sm text-slate-200">
            <Languages className="h-4 w-4 text-cyan-200" />
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={isTranscribing || isPaused}
              className="bg-transparent text-sm text-white outline-none"
            >
              {languages.map((l) => (
                <option key={l.value} value={l.value} className="bg-slate-950">{l.label}</option>
              ))}
            </select>
          </label>

          {isTranscribing ? (
            <Button onClick={pauseTranscription} className="h-11 gap-2 bg-amber-300 px-5 text-slate-950 shadow-lg shadow-amber-500/20 hover:bg-amber-200">
              <Pause className="h-4 w-4" /> 暂停
            </Button>
          ) : (
            <>
              {isPaused && (
                <Button onClick={resetTranscription} variant="outline" className="h-11 border-white/10 bg-white/10 px-5 text-white hover:bg-white/20">
                  重新开始
                </Button>
              )}
              <Button onClick={startTranscription} className="h-11 gap-2 bg-cyan-300 px-5 text-slate-950 shadow-lg shadow-cyan-500/20 hover:bg-cyan-200">
                {isPaused ? <><Play className="h-4 w-4" /> 继续</> : <><Wand2 className="h-4 w-4" /> 开始转写</>}
              </Button>
            </>
          )}
        </div>
      </div>

      {(progress || isTranscribing || isGenerating) && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-cyan-300/15 bg-cyan-300/10 px-3 py-2 text-sm text-cyan-100">
          {(isTranscribing || isGenerating) && <Loader2 className="h-4 w-4 animate-spin" />}
          <span>{progress}</span>
        </div>
      )}
    </section>
  );
}
