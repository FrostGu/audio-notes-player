'use client';

import React from 'react';
import { useStore } from '@/client/store';
import { useAudioPlayer } from '@/client/hooks/useAudioPlayer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileStack, ListMusic, Sparkles, Loader2, Download } from 'lucide-react';
import type { Shownotes, TranscriptSegment } from '@/lib/core/types';

export function ShownotesPanel() {
  const session = useStore((s) => s.session);
  const state = useStore((s) => s.state);
  const { seekTo } = useAudioPlayer();

  if (!session?.shownotes) return null;

  const shownotes = session.shownotes;
  const isGenerating = state === 'generating_notes';

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-white/10 bg-white/[0.08] text-white shadow-2xl shadow-black/20 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <FileStack className="h-5 w-5 text-cyan-200" />
              <span>Shownotes</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const md = buildMarkdown(shownotes, session.segments);
                const blob = new Blob([md], { type: 'text/markdown' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'shownotes.md';
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="border-white/10 bg-white/10 text-white hover:bg-white/20"
            >
              <Download className="mr-2 h-4 w-4" /> MD
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-white">{shownotes.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">{shownotes.overview}</p>
          </div>
          {isGenerating && (
            <div className="flex items-center gap-2 text-sm text-cyan-100">
              <Loader2 className="h-4 w-4 animate-spin" /> 生成笔记中...
            </div>
          )}
        </CardContent>
      </Card>

      {shownotes.chapters.length > 0 && (
        <Card className="border-white/10 bg-white/[0.08] text-white shadow-2xl shadow-black/20 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListMusic className="h-5 w-5 text-rose-200" /> 章节
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {shownotes.chapters.map((chapter) => (
                <button
                  key={chapter.id}
                  onClick={() => seekTo(chapter.startTime)}
                  className="w-full rounded-lg border border-white/10 bg-slate-950/45 p-3 text-left transition hover:border-cyan-300/40 hover:bg-cyan-300/10"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-white">{chapter.title}</span>
                    <span className="shrink-0 rounded-full bg-cyan-300/15 px-2 py-1 text-xs text-cyan-100">
                      {formatTime(chapter.startTime)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-5 text-slate-300">{chapter.summary}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {shownotes.highlights.length > 0 && (
        <Card className="border-white/10 bg-white/[0.08] text-white shadow-2xl shadow-black/20 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-200" /> 高亮
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {shownotes.highlights.map((highlight) => (
                <button
                  key={highlight.id}
                  onClick={() => seekTo(highlight.startTime)}
                  className="w-full rounded-lg border border-amber-200/10 bg-amber-300/10 p-3 text-left transition hover:border-amber-200/40 hover:bg-amber-300/15"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-white">{highlight.title}</span>
                    <span className="shrink-0 rounded-full bg-amber-200/15 px-2 py-1 text-xs text-amber-100">
                      {formatTime(highlight.startTime)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-5 text-slate-300">{highlight.reason}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function formatTime(seconds: number): string {
  return `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.floor(Math.max(0, seconds)) % 60).padStart(2, '0')}`;
}

function buildMarkdown(shownotes: Shownotes, segments: TranscriptSegment[]): string {
  const chapters = shownotes.chapters.map((chapter) => {
    const points = chapter.keyPoints.map((p) => `  - ${p}`).join('\n');
    return `- [${formatTime(chapter.startTime)}] ${chapter.title}\n  ${chapter.summary}${points ? `\n${points}` : ''}`;
  }).join('\n');
  const highlights = shownotes.highlights.map((h) =>
    `- [${formatTime(h.startTime)}] ${h.title}: ${h.reason}`
  ).join('\n');
  const transcript = segments.map((s) => `[${formatTime(s.startTime)}] ${s.text}`).join('\n');
  return `# ${shownotes.title}\n\n${shownotes.overview}\n\n## Chapters\n\n${chapters}\n\n## Highlights\n\n${highlights}\n\n## Transcript\n\n${transcript}\n`;
}
