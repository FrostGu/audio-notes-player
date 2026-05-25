'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import {
  Brain,
  Clock,
  Download,
  FileStack,
  FileText,
  Headphones,
  Languages,
  Link,
  ListMusic,
  Loader2,
  Pause,
  Play,
  Podcast,
  Radio,
  Sparkles,
  Star,
  Subtitles,
  UploadCloud,
  Wand2,
  Zap,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { getFileExtension } from '@/lib/audio';
import { logger } from '@/lib/utils';
import { Switch } from './ui/switch';
import type { Shownotes, TranscriptSegment } from '@/lib/core/types';

function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function formatSrtTime(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = Math.floor(safeSeconds % 60);
  const millis = Math.round((safeSeconds % 1) * 1000);

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${millis.toString().padStart(3, '0')}`;
}

function buildSrt(segments: TranscriptSegment[]): string {
  return segments.map((segment, index) => (
    `${index + 1}\n${formatSrtTime(segment.startTime)} --> ${formatSrtTime(segment.endTime)}\n${segment.text}\n`
  )).join('\n');
}

function normalizeSegments(segments: TranscriptSegment[]): TranscriptSegment[] {
  return segments.map((segment, index) => ({
    ...segment,
    id: `segment-${index + 1}`,
  }));
}

function mergeSegments(existing: TranscriptSegment[], incoming: TranscriptSegment[]): TranscriptSegment[] {
  const lastEndTime = existing.at(-1)?.endTime ?? -Infinity;
  const nextSegments = incoming.filter((segment) => segment.endTime > lastEndTime + 0.05);

  return normalizeSegments([...existing, ...nextSegments]);
}

function getAudioDurationLabel(segments: TranscriptSegment[]): string {
  const duration = segments.at(-1)?.endTime;

  return duration ? formatTime(duration) : '--:--';
}

function buildMarkdown(shownotes: Shownotes, segments: TranscriptSegment[]): string {
  const chapters = shownotes.chapters.map((chapter) => {
    const points = chapter.keyPoints.map((point) => `  - ${point}`).join('\n');
    return `- [${formatTime(chapter.startTime)}] ${chapter.title}\n  ${chapter.summary}${points ? `\n${points}` : ''}`;
  }).join('\n');

  const highlights = shownotes.highlights.map((highlight) => (
    `- [${formatTime(highlight.startTime)}] ${highlight.title}: ${highlight.reason}`
  )).join('\n');

  const transcript = segments.map((segment) => (
    `[${formatTime(segment.startTime)}] ${segment.text}`
  )).join('\n');

  return `# ${shownotes.title}\n\n${shownotes.overview}\n\n## Chapters\n\n${chapters}\n\n## Highlights\n\n${highlights}\n\n## Transcript\n\n${transcript}\n`;
}

export default function AudioTranscription() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const transcriptionAbortRef = useRef<AbortController | null>(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [transcription, setTranscription] = useState('');
  const [summary, setSummary] = useState('');
  const [srtContent, setSrtContent] = useState('');
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [shownotes, setShownotes] = useState<Shownotes | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isGeneratingNotes, setIsGeneratingNotes] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<'url' | 'podcast'>('url');
  const [selectedPlatform, setSelectedPlatform] = useState('xiaoyuzhou');
  const [selectedLanguage, setSelectedLanguage] = useState('auto');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>('');
  const [enableSummary, setEnableSummary] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<'txt' | 'srt'>('txt');

  const languages = [
    { value: 'auto', label: 'Auto Detect' },
    { value: 'zh', label: '中文' },
    { value: 'en', label: 'English' },
  ];

  const importActions = [
    {
      title: 'Podcast',
      description: 'Xiaoyuzhou episode link',
      icon: Podcast,
      accent: 'from-fuchsia-500 to-rose-500',
      onClick: () => {
        resetAudioState();
        setDialogType('podcast');
        setDialogOpen(true);
      },
    },
    {
      title: 'Audio File',
      description: 'Upload mp3, m4a, wav',
      icon: UploadCloud,
      accent: 'from-cyan-500 to-blue-500',
      onClick: () => {
        resetAudioState();
        document.getElementById('file-upload')?.click();
      },
    },
    {
      title: 'Direct URL',
      description: 'Paste a playable audio URL',
      icon: Link,
      accent: 'from-amber-400 to-orange-500',
      onClick: () => {
        resetAudioState();
        setDialogType('url');
        setDialogOpen(true);
      },
    },
  ];

  const resetAudioState = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioUrl('');
    setAudioFile(null);
    setTranscription('');
    setSummary('');
    setSrtContent('');
    setSegments([]);
    setShownotes(null);
    setIsPaused(false);
    setError(null);
    setProgress('');
    transcriptionAbortRef.current?.abort();
    transcriptionAbortRef.current = null;
  };

  const seekTo = (time: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = time;
    audioRef.current.play().catch((error) => {
      logger.warn('Audio playback failed:', error);
    });
  };

  const generateShownotes = async (finalTranscript: string, finalSegments: TranscriptSegment[]) => {
    if (finalSegments.length === 0) return;

    setIsGeneratingNotes(true);
    setProgress('Generating shownotes...');

    try {
      const response = await fetch('/api/generate-shownotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transcript: finalTranscript,
          segments: finalSegments,
          language: selectedLanguage
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate shownotes');
      }

      const data = await response.json();
      setShownotes(data.shownotes);
    } catch (error) {
      logger.error('Shownotes generation error:', error);
      setError('Failed to generate shownotes');
    } finally {
      setIsGeneratingNotes(false);
      setProgress('Completed');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    resetAudioState();
    const file = e.target.files?.[0];
    if (file) {
      setUrlInput('');
      setAudioFile(file);
      setAudioUrl(URL.createObjectURL(file));
    }
  };

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput) return;

    setIsLoading(true);
    setError(null); // Reset error state
    try {
      // Validate URL format
      try {
        new URL(urlInput);
      } catch {
        throw new Error('Invalid URL format. Please enter a valid URL.');
      }

      // Only validate audio file extension for direct URL input
      if (dialogType === 'url') {
        const fileExtension = getFileExtension(urlInput).toLowerCase();
        const validExtensions = ['mp3', 'wav', 'm4a', 'ogg', 'aac', 'mp4'];
        if (!validExtensions.includes(fileExtension)) {
          throw new Error(`Invalid audio file format. Supported formats are: ${validExtensions.join(', ')}`);
        }
      }

      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      setAudioUrl('');
      setAudioFile(null);
      // Reset transcription and summary
      setTranscription('');
      setSummary('');
      setSrtContent('');
      setSegments([]);
      setShownotes(null);

      const response = await fetch('/api/audio', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: urlInput }),
      });

      if (!response.ok) {
        throw new Error('Failed to download audio');
      }

      const blob = await response.blob();
      

      const blobUrl = URL.createObjectURL(blob);
      setAudioUrl(blobUrl);

      const extension = getFileExtension(urlInput);
      // Whisper identifies the audio format from the file content.
      const audioFile = new File([blob], `podcast.${extension}`);
      setAudioFile(audioFile);
    } catch (err) {
      logger.error('Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to process audio. Please try again.');
    } finally {
      setIsLoading(false);
      setDialogOpen(false);
    }
  };

  const pauseTranscription = () => {
    if (!isTranscribing) return;
    setProgress('Pausing transcription...');
    transcriptionAbortRef.current?.abort();
  };

  const handleTranscribe = async () => {
    if (!audioFile) return;
    const isResume = isPaused && segments.length > 0;
    const initialSegments = isResume ? segments : [];
    const resumeFrom = initialSegments.at(-1)?.endTime ?? 0;
    const abortController = new AbortController();
    let streamedSegments: TranscriptSegment[] = initialSegments;

    transcriptionAbortRef.current = abortController;
    setIsTranscribing(true);
    setIsPaused(false);
    setError(null);
    if (!isResume) {
      setTranscription('');
      setSummary('');
      setSrtContent('');
      setSegments([]);
      streamedSegments = [];
    }
    setShownotes(null);
    setProgress(isResume ? `Resuming from ${formatTime(resumeFrom)}...` : 'Preparing transcription...');

    const formData = new FormData();
    formData.append('file', audioFile);
    formData.append('language', selectedLanguage);
    formData.append('outputFormat', 'srt'); // Always request SRT for download option
    if (isResume) {
      formData.append('resumeFrom', String(resumeFrom));
    }

    try {
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
        signal: abortController.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error('Failed to start transcription');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let messageBuffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = `${messageBuffer}${chunk}`.split('\n');
        messageBuffer = lines.pop() ?? '';
        const messages = lines.filter(Boolean);

        for (const message of messages) {
          const data = JSON.parse(message);

          switch (data.type) {
            case 'progress':
              setProgress(data.message);
              break;
            case 'partial':
              if (data.segments) {
                streamedSegments = mergeSegments(streamedSegments, data.segments);
                setSegments(streamedSegments);
                setTranscription(streamedSegments.map((segment) => segment.text).join(' '));
                setSrtContent(buildSrt(streamedSegments));
              } else if (!isResume) {
                setTranscription(data.transcript);
                if (data.srt) {
                  setSrtContent(data.srt);
                }
              }
              if (data.progress?.percent !== undefined) {
                setProgress(`Transcribing... ${data.progress.percent}%`);
              }
              break;
            case 'complete':
              let completedTranscript = data.transcript;
              if (data.segments) {
                const completedSegments = isResume
                  ? mergeSegments(initialSegments, data.segments)
                  : normalizeSegments(data.segments);
                completedTranscript = completedSegments.map((segment: TranscriptSegment) => segment.text).join(' ');

                streamedSegments = completedSegments;
                setSegments(completedSegments);
                setTranscription(completedTranscript);
                setSrtContent(buildSrt(completedSegments));
                await generateShownotes(completedTranscript, completedSegments);
              } else if (!isResume && data.srt) {
                setSrtContent(data.srt);
              }
              if (enableSummary) {
                setProgress('Generating summary...');
                try {
                  const summaryResponse = await fetch('/api/summarize', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      messages: [
                        {
                          role: "user",
                          content: completedTranscript
                        }
                      ],
                      language: selectedLanguage
                    }),
                  });

                  if (!summaryResponse.ok) {
                    throw new Error('Failed to generate summary');
                  }

                  const summaryData = await summaryResponse.json();
                  setSummary(summaryData.summary);
                } catch (error) {
                  logger.error('Summary generation error:', error);
                  setError('Failed to generate summary');
                }
              }
              setProgress('Completed');
              break;
            case 'error':
              setError(data.error);
              break;
          }
        }
      }
    } catch (error) {
      if (abortController.signal.aborted) {
        const lastEndTime = streamedSegments.at(-1)?.endTime ?? 0;
        setSegments(streamedSegments);
        setTranscription(streamedSegments.map((segment) => segment.text).join(' '));
        setSrtContent(buildSrt(streamedSegments));
        setIsPaused(streamedSegments.length > 0);
        setProgress(streamedSegments.length > 0
          ? `Paused at ${formatTime(lastEndTime)}`
          : 'Paused before transcript segments were received'
        );
      } else {
        setError('Failed to transcribe audio');
        logger.error('Transcription error:', error);
      }
    } finally {
      if (transcriptionAbortRef.current === abortController) {
        transcriptionAbortRef.current = null;
      }
      setIsTranscribing(false);
    }
  };

  useEffect(() => {
    return () => {
      if (audioUrl && audioUrl.startsWith('blob:')) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  useEffect(() => {
    return () => {
      transcriptionAbortRef.current?.abort();
    };
  }, []);

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
              <p className="text-sm font-semibold uppercase text-cyan-200">Audio Notes Player</p>
              <p className="text-xs text-slate-400">Transcribe, summarize, publish</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 shadow-2xl shadow-black/20 backdrop-blur md:flex">
            <Sparkles className="h-4 w-4 text-amber-300" />
            Shownotes powered by AI
          </div>
        </header>

        <main className="flex-1 py-8 sm:py-12">
          <section className="grid items-end gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
            <div className="space-y-7">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-sm text-cyan-100">
                <Zap className="h-4 w-4" />
                Local faster-whisper + DeepSeek notes workflow
              </div>
              <div className="max-w-4xl space-y-5">
                <h1 className="text-5xl font-black leading-[0.98] text-white sm:text-6xl lg:text-7xl">
                  Turn long audio into publish-ready notes.
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-slate-300">
                  Import an episode, stream a continuous transcript, then generate structured chapters, highlights, summary, and downloadable markdown from one workspace.
                </p>
              </div>
              <div className="grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-white/[0.06] p-4 backdrop-blur">
                  <Clock className="mb-3 h-5 w-5 text-cyan-300" />
                  <p className="text-2xl font-semibold">{getAudioDurationLabel(segments)}</p>
                  <p className="mt-1 text-sm text-slate-400">Processed audio</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.06] p-4 backdrop-blur">
                  <ListMusic className="mb-3 h-5 w-5 text-rose-300" />
                  <p className="text-2xl font-semibold">{shownotes?.chapters.length ?? 0}</p>
                  <p className="mt-1 text-sm text-slate-400">Detected chapters</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.06] p-4 backdrop-blur">
                  <Subtitles className="mb-3 h-5 w-5 text-amber-300" />
                  <p className="text-2xl font-semibold">{segments.length}</p>
                  <p className="mt-1 text-sm text-slate-400">Transcript segments</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.08] p-4 shadow-2xl shadow-black/30 backdrop-blur-xl">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Import Studio</h2>
                  <p className="text-sm text-slate-400">Choose a source and prepare transcription.</p>
                </div>
                <Headphones className="h-5 w-5 text-cyan-200" />
              </div>

              <div className="grid gap-3">
                {importActions.map((action) => {
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

              <input
                id="file-upload"
                type="file"
                accept="audio/*"
                onChange={handleFileChange}
                className="hidden"
              />

              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {dialogType === 'podcast' ? 'Enter Podcast URL' : 'Enter Audio URL'}
                    </DialogTitle>
                    <DialogDescription>
                      {dialogType === 'podcast'
                        ? 'Paste the URL of the podcast episode you want to transcribe'
                        : 'Paste the direct audio URL you want to transcribe'}
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleUrlSubmit}>
                    <div className="space-y-4">
                      {dialogType === 'podcast' && (
                        <select
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          value={selectedPlatform}
                          onChange={(e) => setSelectedPlatform(e.target.value)}
                        >
                          <option value="xiaoyuzhou">xiaoyuzhou</option>
                        </select>
                      )}

                      <Input
                        type="url"
                        placeholder={
                          dialogType === 'podcast'
                            ? 'Enter podcast URL...'
                            : 'Enter audio URL...'
                        }
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        className="w-full"
                        required
                      />

                      <Button
                        type="submit"
                        disabled={isLoading || !urlInput}
                        className="w-full"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          'Submit'
                        )}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </section>

        {audioUrl && (
          <section className="mt-8 rounded-xl border border-white/10 bg-white/[0.07] p-4 shadow-2xl shadow-black/25 backdrop-blur-xl">
            <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
              <audio
                ref={audioRef}
                controls
                className="w-full min-w-0 rounded-lg bg-slate-950"
              >
                <source src={audioUrl} type={audioFile?.type} />
                Your browser does not support the audio element.
              </audio>
              <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
                <label className="flex h-11 items-center gap-2 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-sm text-slate-200">
                  <Languages className="h-4 w-4 text-cyan-200" />
                  <select
                    value={selectedLanguage}
                    onChange={(e) => setSelectedLanguage(e.target.value)}
                    className="bg-transparent text-sm text-white outline-none"
                  >
                    {languages.map((lang) => (
                      <option key={lang.value} value={lang.value} className="bg-slate-950">
                        {lang.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex h-11 items-center gap-2 rounded-lg border border-white/10 bg-slate-950/60 px-3">
                  <Switch
                    id="enable-summary"
                    checked={enableSummary}
                    onCheckedChange={setEnableSummary}
                  />
                  <label htmlFor="enable-summary" className="whitespace-nowrap text-sm text-slate-200">
                    AI Summary
                  </label>
                </div>
                {isTranscribing ? (
                  <Button
                    onClick={pauseTranscription}
                    className="h-11 gap-2 bg-amber-300 px-5 text-slate-950 shadow-lg shadow-amber-500/20 hover:bg-amber-200"
                  >
                    <Pause className="h-4 w-4" />
                    Pause
                  </Button>
                ) : (
                  <Button
                    onClick={handleTranscribe}
                    className="h-11 gap-2 bg-cyan-300 px-5 text-slate-950 shadow-lg shadow-cyan-500/20 hover:bg-cyan-200"
                  >
                    {isPaused ? (
                      <>
                        <Play className="h-4 w-4" />
                        Resume
                      </>
                    ) : (
                      <>
                        <Wand2 className="h-4 w-4" />
                        Transcribe
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
            {progress && (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-cyan-300/15 bg-cyan-300/10 px-3 py-2 text-sm text-cyan-100">
                {(isTranscribing || isGeneratingNotes) && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>{progress}</span>
              </div>
            )}
          </section>
        )}

        {(transcription || summary || shownotes) && (
          <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
            {shownotes && (
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
                          const blob = new Blob([buildMarkdown(shownotes, segments)], { type: 'text/markdown' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = 'shownotes.md';
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        className="border-white/10 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                      >
                        <Download className="mr-2 h-4 w-4" />
                        MD
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h2 className="text-xl font-semibold text-white">{shownotes.title}</h2>
                      <p className="mt-2 text-sm leading-6 text-slate-300">{shownotes.overview}</p>
                    </div>
                    {isGeneratingNotes && (
                      <div className="flex items-center gap-2 text-sm text-cyan-100">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generating notes...
                      </div>
                    )}
                  </CardContent>
                </Card>

                {shownotes.chapters.length > 0 && (
                  <Card className="border-white/10 bg-white/[0.08] text-white shadow-2xl shadow-black/20 backdrop-blur-xl">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <ListMusic className="h-5 w-5 text-rose-200" />
                        Chapters
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
                        <Sparkles className="h-5 w-5 text-amber-200" />
                        Highlights
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
            )}

            {transcription && (
              <Card className="h-full border-white/10 bg-white/[0.08] text-white shadow-2xl shadow-black/20 backdrop-blur-xl">
                <CardHeader>
                  <CardTitle className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-cyan-200" />
                      <span>Transcription</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={downloadFormat}
                        onChange={(e) => setDownloadFormat(e.target.value as 'txt' | 'srt')}
                        className="h-8 rounded-md border border-white/10 bg-slate-950/60 px-2 py-1 text-sm text-white"
                      >
                        <option value="txt" className="bg-slate-950">TXT</option>
                        <option value="srt" className="bg-slate-950">SRT</option>
                      </select>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const content = downloadFormat === 'srt' ? srtContent : transcription;
                          const mimeType = downloadFormat === 'srt' ? 'application/x-subrip' : 'text/plain';
                          const blob = new Blob([content], { type: mimeType });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `transcription.${downloadFormat}`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        className="border-white/10 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                        disabled={downloadFormat === 'srt' && !srtContent}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[620px] overflow-y-auto rounded-lg border border-white/5 bg-slate-950/35 p-5 scrollbar-thin">
                    <div className="whitespace-pre-wrap text-base leading-8 text-slate-200">
                      {transcription}
                    </div>
                  </div>
                  {segments.length > 0 && (
                    <p className="mt-3 text-xs text-slate-400">
                      Timestamps are retained for SRT export and AI-generated chapters. Use the Shownotes panel for precise chapter jumps.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {summary && (
              <Card className="h-full border-white/10 bg-white/[0.08] text-white shadow-2xl shadow-black/20 backdrop-blur-xl lg:col-start-2">
                <CardHeader>
                  <CardTitle className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Brain className="h-5 w-5 text-amber-200" />
                      <span>Summary</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const blob = new Blob([summary], { type: 'text/plain' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'summary.txt';
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="border-white/10 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div>
                    <div
                      className="whitespace-pre-wrap text-base leading-7 text-slate-200 overflow-y-auto max-h-[600px] scrollbar-thin"
                    >
                      {summary}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </section>
        )}

        {error && (
          <div className="relative mt-6 rounded-lg border border-red-300/30 bg-red-500/15 px-4 py-3 text-red-100" role="alert">
            <strong className="font-bold">Error: </strong>
            <span className="block sm:inline">{error}</span>
            <button
              className="absolute top-0 bottom-0 right-0 px-4 py-3"
              onClick={() => setError(null)}
            >
              <span className="sr-only">Dismiss</span>
              <svg className="fill-current h-6 w-6 text-red-500" role="button" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                <title>Close</title>
                <path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z"/>
              </svg>
            </button>
          </div>
        )}
        </main>
      </div>
    </div>
  );
}
