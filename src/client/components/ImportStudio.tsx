'use client';

import React, { useState, useCallback } from 'react';
import { useStore } from '@/client/store';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getFileExtension } from '@/lib/audio';
import { logger } from '@/lib/utils';
import { UploadCloud, Link, Podcast, Star, Loader2 } from 'lucide-react';

export function ImportStudio() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<'url' | 'podcast'>('url');
  const [urlInput, setUrlInput] = useState('');
  const [selectedPlatform] = useState('xiaoyuzhou');
  const [isLoading, setIsLoading] = useState(false);
  const createSession = useStore((s) => s.createSession);
  const setError = useStore((s) => s.setError);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    createSession(URL.createObjectURL(file), file.name);
  }, [createSession]);

  const handleUrlSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput) return;

    setIsLoading(true);
    try {
      new URL(urlInput);

      if (dialogType === 'url') {
        const ext = getFileExtension(urlInput).toLowerCase();
        if (!['mp3', 'wav', 'm4a', 'ogg', 'aac', 'mp4'].includes(ext)) {
          throw new Error(`Unsupported format: ${ext}`);
        }
      }

      const response = await fetch('/api/audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput }),
      });

      if (!response.ok) throw new Error('Failed to download audio');

      const blob = await response.blob();
      const ext = getFileExtension(urlInput);
      createSession(URL.createObjectURL(blob), `audio.${ext}`);
    } catch (err) {
      logger.error('Import error:', err);
      setError(err instanceof Error ? err.message : 'Failed to import audio');
    } finally {
      setIsLoading(false);
      setDialogOpen(false);
    }
  }, [urlInput, dialogType, createSession, setError]);

  const actions = [
    {
      title: '播客链接',
      description: '小宇宙播客 URL',
      icon: Podcast,
      accent: 'from-fuchsia-500 to-rose-500',
      onClick: () => { setDialogType('podcast'); setDialogOpen(true); },
    },
    {
      title: '音频文件',
      description: '上传 mp3, m4a, wav',
      icon: UploadCloud,
      accent: 'from-cyan-500 to-blue-500',
      onClick: () => document.getElementById('file-upload')?.click(),
    },
    {
      title: '音频链接',
      description: '粘贴音频 URL',
      icon: Link,
      accent: 'from-amber-400 to-orange-500',
      onClick: () => { setDialogType('url'); setDialogOpen(true); },
    },
  ];

  return (
    <>
      <div className="grid gap-3">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.title}
              onClick={action.onClick}
              className="group flex items-center gap-3 rounded-lg border border-white/10 bg-slate-950/50 p-3 text-left transition duration-200 hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/10"
            >
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${action.accent} shadow-lg shadow-black/20`}>
                <Icon className="h-5 w-5 text-white" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 font-medium text-white">
                  {action.title}
                  {action.title === 'Podcast' && <Star className="h-3.5 w-3.5 fill-yellow-300 text-yellow-300" />}
                </span>
                <span className="mt-0.5 block text-sm text-slate-400">{action.description}</span>
              </span>
            </button>
          );
        })}
      </div>

      <input id="file-upload" type="file" accept="audio/*" onChange={handleFileChange} className="hidden" />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogType === 'podcast' ? '输入播客链接' : '输入音频链接'}</DialogTitle>
            <DialogDescription>
              {dialogType === 'podcast' ? '粘贴小宇宙播客链接，自动解析音频' : '粘贴音频文件的直接播放链接'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUrlSubmit}>
            <div className="space-y-4">
              {dialogType === 'podcast' && (
                <select
                  value={selectedPlatform}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="xiaoyuzhou">xiaoyuzhou</option>
                </select>
              )}
              <Input
                type="url"
                placeholder={dialogType === 'podcast' ? '输入播客链接...' : '输入音频链接...'}
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                required
              />
              <Button type="submit" disabled={isLoading || !urlInput} className="w-full">
                {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 处理中...</> : '确认'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
