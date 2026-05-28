'use client';

import React from 'react';
import { useStore } from '@/client/store';
import { ImportStudio } from '@/client/components/ImportStudio';
import { PlayerPanel } from '@/client/components/PlayerPanel';
import { TranscriptPanel } from '@/client/components/TranscriptPanel';
import { ShownotesPanel } from '@/client/components/ShownotesPanel';
import { ErrorBanner } from '@/client/components/ErrorBanner';
import { Headphones, Radio, Sparkles, Clock, ListMusic, Subtitles, Zap } from 'lucide-react';

export function App() {
  const session = useStore((s) => s.session);

  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-[#090b12] text-white">
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(135deg,#090b12_0%,#111827_45%,#0f172a_100%)]" />
      <div className="absolute inset-x-0 top-0 -z-10 h-[520px] bg-[linear-gradient(120deg,rgba(34,211,238,0.16),rgba(168,85,247,0.12),rgba(251,146,60,0.10))]" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:64px_64px]" />

      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between py-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-slate-950 shadow-lg shadow-cyan-500/20">
              <Radio className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase text-cyan-200">音频笔记</p>
              <p className="text-xs text-slate-400">转写 · 笔记 · 发布</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 shadow-2xl shadow-black/20 backdrop-blur md:flex">
            <Sparkles className="h-4 w-4 text-amber-300" />
            AI 驱动的 Shownotes
          </div>
        </header>

        <main className="flex-1 py-8 sm:py-12">
          <section className="grid items-end gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
            <div className="space-y-7">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-sm text-cyan-100">
                <Zap className="h-4 w-4" />
                本地 faster-whisper + DeepSeek 笔记生成
              </div>
              <div className="max-w-4xl space-y-5">
                <h1 className="text-5xl font-black leading-[0.98] text-white sm:text-6xl lg:text-7xl">
                  长音频 → 可发布笔记
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-slate-300">
                  导入音频，实时获取转写稿，一键生成结构化章节、高亮和 Markdown 笔记
                </p>
              </div>
              <div className="grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-white/[0.06] p-4 backdrop-blur">
                  <Clock className="mb-3 h-5 w-5 text-cyan-300" />
                  <p className="text-2xl font-semibold">{getDurationLabel(session?.segments ?? [])}</p>
                  <p className="mt-1 text-sm text-slate-400">已处理音频</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.06] p-4 backdrop-blur">
                  <ListMusic className="mb-3 h-5 w-5 text-rose-300" />
                  <p className="text-2xl font-semibold">{session?.shownotes?.chapters.length ?? 0}</p>
                  <p className="mt-1 text-sm text-slate-400">章节数</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.06] p-4 backdrop-blur">
                  <Subtitles className="mb-3 h-5 w-5 text-amber-300" />
                  <p className="text-2xl font-semibold">{session?.segments.length ?? 0}</p>
                  <p className="mt-1 text-sm text-slate-400">转写段落</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.08] p-4 shadow-2xl shadow-black/30 backdrop-blur-xl">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">导入</h2>
                  <p className="text-sm text-slate-400">选择音频来源开始转写</p>
                </div>
                <Headphones className="h-5 w-5 text-cyan-200" />
              </div>
              <ImportStudio />
            </div>
          </section>

          <PlayerPanel />

          {(session?.transcription || session?.shownotes) && (
            <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
              <ShownotesPanel />
              <TranscriptPanel />
            </section>
          )}

          <ErrorBanner />
        </main>
      </div>
    </div>
  );
}

function getDurationLabel(segments: { endTime?: number }[]): string {
  const duration = segments.at(-1)?.endTime;
  if (!duration) return '--:--';
  return `${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, '0')}`;
}
