'use client';

import React from 'react';
import { useStore } from '@/client/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Download } from 'lucide-react';

export function TranscriptPanel() {
  const session = useStore((s) => s.session);
  const state = useStore((s) => s.state);
  const downloadFormat = useStore((s) => s.downloadFormat);
  const setDownloadFormat = useStore((s) => s.setDownloadFormat);

  if (!session || !session.transcription) return null;

  const isPaused = state === 'paused';
  const content = downloadFormat === 'srt' ? session.srtContent : session.transcription;
  const mimeType = downloadFormat === 'srt' ? 'application/x-subrip' : 'text/plain';

  return (
    <Card className="h-full border-white/10 bg-white/[0.08] text-white shadow-2xl shadow-black/20 backdrop-blur-xl">
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-cyan-200" />
            <span>转写稿</span>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={downloadFormat}
              onChange={(e) => setDownloadFormat(e.target.value as 'txt' | 'srt')}
              className="h-8 rounded-md border border-white/10 bg-slate-950/60 px-2 py-1 text-sm text-white"
            >
              <option value="txt">TXT</option>
              <option value="srt">SRT</option>
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const blob = new Blob([content], { type: mimeType });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `transcription.${downloadFormat}`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="border-white/10 bg-white/10 text-white hover:bg-white/20"
              disabled={downloadFormat === 'srt' && !session.srtContent}
            >
              <Download className="mr-2 h-4 w-4" /> 下载
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="max-h-[620px] overflow-y-auto rounded-lg border border-white/5 bg-slate-950/35 p-5 scrollbar-thin">
          <div className="whitespace-pre-wrap text-base leading-8 text-slate-200">{content}</div>
        </div>
        {isPaused && (
          <p className="mt-3 text-xs text-slate-400">
            暂停检查点: {formatTime(session.segments.at(-1)?.endTime ?? 0)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function formatTime(seconds: number): string {
  return `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.floor(Math.max(0, seconds)) % 60).padStart(2, '0')}`;
}
