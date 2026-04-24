'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Loader2, Download, FileAudio, FileText, FileStack, Link, Podcast, Star } from 'lucide-react';
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
  const [audioUrl, setAudioUrl] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [transcription, setTranscription] = useState('');
  const [summary, setSummary] = useState('');
  const [srtContent, setSrtContent] = useState('');
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [shownotes, setShownotes] = useState<Shownotes | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
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
    setCurrentTime(0);
    setError(null);
    setProgress('');
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
      // File对象不需要指定type，Whisper API通过文件内容识别格式
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

  const handleTranscribe = async () => {
    if (!audioFile) return;
    setIsTranscribing(true);
    setError(null);
    setSrtContent('');
    setSegments([]);
    setShownotes(null);
    const formData = new FormData();
    formData.append('file', audioFile);
    formData.append('language', selectedLanguage);
    formData.append('outputFormat', 'srt'); // Always request SRT for download option

    try {
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let streamedSegments: TranscriptSegment[] = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const messages = chunk.split('\n').filter(Boolean);

        for (const message of messages) {
          const data = JSON.parse(message);

          switch (data.type) {
            case 'progress':
              setProgress(data.message);
              break;
            case 'partial':
              setTranscription(data.transcript);
              if (data.srt) {
                setSrtContent(data.srt);
              }
              if (data.segments) {
                streamedSegments = [...streamedSegments, ...data.segments];
                setSegments(streamedSegments);
              }
              if (data.progress?.percent !== undefined) {
                setProgress(`Transcribing... ${data.progress.percent}%`);
              }
              break;
            case 'complete':
              if (data.srt) {
                setSrtContent(data.srt);
              }
              if (data.segments) {
                setSegments(data.segments);
                await generateShownotes(data.transcript, data.segments);
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
                          content: data.transcript
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
      setError('Failed to transcribe audio');
      logger.error('Transcription error:', error);
    } finally {
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 p-4 sm:p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header Section */}
        <div className="text-center space-y-2 mb-8">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-5xl">
            Audio Transcription
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            Transform your <span className="text-indigo-600 dark:text-indigo-400">podcasts</span> and <span className="text-indigo-600 dark:text-indigo-400">audio files or urls</span> into text with <span className="text-indigo-600 dark:text-indigo-400">AI-powered</span> transcription and get intelligent summaries.
          </p>
        </div>

        {/* Upload Section */}
        <div className="flex flex-col justify-center items-center rounded-lg bg-white shadow-xl shadow-black/5 ring-1 ring-slate-700/10 p-2 max-w-fit mx-auto">
          <div className="flex flex-row justify-center space-x-2">
            <button
              onClick={() => {
                resetAudioState();
                setDialogType('podcast');
                setDialogOpen(true);
              }}
              className="flex items-center justify-center rounded-lg p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-all duration-200"
            >
              <Podcast className="w-5 h-5" />
              <span className="ml-2">From Podcast</span>
              <Star className="w-4 h-4 ml-1 fill-yellow-400 text-yellow-400" />
            </button>
            <div className="w-[1px] bg-slate-200"></div>
            <button
              onClick={() => {
                resetAudioState();
                document.getElementById('file-upload')?.click();
              }}
              className="flex items-center justify-center rounded-lg p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-all duration-200"
            >
              <FileAudio className="w-5 h-5" />
              <span className="ml-2">From File</span>
            </button>
            <div className="w-[1px] bg-slate-200"></div>
            <button
              onClick={() => {
                resetAudioState();
                setDialogType('url');
                setDialogOpen(true);
              }}
              className="flex items-center justify-center rounded-lg p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-all duration-200"
            >
              <Link className="w-5 h-5" />
              <span className="ml-2">From URL</span>
            </button>
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

        {audioUrl && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-card p-4 flex flex-col gap-4 md:flex-row md:items-center">
              <audio
                ref={audioRef}
                controls
                className="flex-1 w-full"
                onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
              >
                <source src={audioUrl} type={audioFile?.type} />
                Your browser does not support the audio element.
              </audio>
              <select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {languages.map((lang) => (
                  <option key={lang.value} value={lang.value}>
                    {lang.label}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <Switch
                  id="enable-summary"
                  checked={enableSummary}
                  onCheckedChange={setEnableSummary}
                />
                <label htmlFor="enable-summary" className="text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
                  AI Summary
                </label>
              </div>
              <Button
                onClick={handleTranscribe}
                disabled={isTranscribing}
                className="flex items-center gap-2"
              >
                {isTranscribing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Transcribing...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4" />
                    Transcribe
                  </>
                )}
              </Button>
            </div>
            {progress && (
              <div className="text-sm text-gray-500 mt-2">
                {progress}
              </div>
            )}
          </div>
        )}

        {(transcription || summary || shownotes) && (
          <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
            {shownotes && (
              <div className="space-y-6">
                <Card className="bg-white/70 backdrop-blur-sm dark:bg-gray-800/60">
                  <CardHeader>
                    <CardTitle className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <FileStack className="h-5 w-5" />
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
                      >
                        <Download className="mr-2 h-4 w-4" />
                        MD
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{shownotes.title}</h2>
                      <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">{shownotes.overview}</p>
                    </div>
                    {isGeneratingNotes && (
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generating notes...
                      </div>
                    )}
                  </CardContent>
                </Card>

                {shownotes.chapters.length > 0 && (
                  <Card className="bg-white/70 backdrop-blur-sm dark:bg-gray-800/60">
                    <CardHeader>
                      <CardTitle>Chapters</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {shownotes.chapters.map((chapter) => (
                          <button
                            key={chapter.id}
                            onClick={() => seekTo(chapter.startTime)}
                            className="w-full rounded-lg border bg-white p-3 text-left transition hover:border-indigo-300 hover:bg-indigo-50 dark:bg-gray-900 dark:hover:bg-gray-800"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-medium text-gray-900 dark:text-white">{chapter.title}</span>
                              <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-1 text-xs text-indigo-700">
                                {formatTime(chapter.startTime)}
                              </span>
                            </div>
                            <p className="mt-2 text-sm leading-5 text-gray-600 dark:text-gray-300">{chapter.summary}</p>
                          </button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {shownotes.highlights.length > 0 && (
                  <Card className="bg-white/70 backdrop-blur-sm dark:bg-gray-800/60">
                    <CardHeader>
                      <CardTitle>Highlights</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {shownotes.highlights.map((highlight) => (
                          <button
                            key={highlight.id}
                            onClick={() => seekTo(highlight.startTime)}
                            className="w-full rounded-lg border bg-amber-50 p-3 text-left transition hover:border-amber-300 hover:bg-amber-100 dark:bg-amber-950/30"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-medium text-gray-900 dark:text-white">{highlight.title}</span>
                              <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-800">
                                {formatTime(highlight.startTime)}
                              </span>
                            </div>
                            <p className="mt-2 text-sm leading-5 text-gray-700 dark:text-gray-300">{highlight.reason}</p>
                          </button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {transcription && (
              <Card className="h-full bg-white/50 backdrop-blur-sm dark:bg-gray-800/50 hover:shadow-lg transition-shadow duration-200">
                <CardHeader>
                  <CardTitle className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      <span>Transcription</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={downloadFormat}
                        onChange={(e) => setDownloadFormat(e.target.value as 'txt' | 'srt')}
                        className="h-8 rounded-md border border-input bg-background px-2 py-1 text-sm"
                      >
                        <option value="txt">TXT</option>
                        <option value="srt">SRT</option>
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
                        className="hover:bg-primary hover:text-primary-foreground"
                        disabled={downloadFormat === 'srt' && !srtContent}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    {segments.length > 0 ? (
                      <div className="space-y-2 overflow-y-auto max-h-[600px] pr-2 scrollbar-thin">
                        {segments.map((segment) => {
                          const isActive = currentTime >= segment.startTime && currentTime <= segment.endTime;

                          return (
                            <button
                              key={segment.id}
                              onClick={() => seekTo(segment.startTime)}
                              className={`block w-full rounded-md px-3 py-2 text-left text-base leading-7 tracking-wide transition ${
                                isActive
                                  ? 'bg-indigo-100 text-indigo-950 dark:bg-indigo-900/70 dark:text-indigo-50'
                                  : 'hover:bg-slate-100 dark:hover:bg-gray-700'
                              }`}
                            >
                              <span className="mr-3 inline-flex rounded-full bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700 dark:bg-gray-700 dark:text-gray-200">
                                {formatTime(segment.startTime)}
                              </span>
                              {segment.text}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div
                        className="whitespace-pre-wrap text-base leading-7 tracking-wide overflow-y-auto max-h-[600px] scrollbar-thin"
                        style={{
                          fontSize: '1rem',
                          lineHeight: '1.75',
                        }}
                      >
                        {transcription}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {summary && (
              <Card className="h-full bg-white/50 backdrop-blur-sm dark:bg-gray-800/50 hover:shadow-lg transition-shadow duration-200">
                <CardHeader>
                  <CardTitle className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <FileStack className="h-5 w-5" />
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
                      className="hover:bg-primary hover:text-primary-foreground"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <div
                      className="whitespace-pre-wrap text-base leading-7 tracking-wide overflow-y-auto max-h-[600px] scrollbar-thin"
                      style={{
                        fontSize: '1rem',
                        lineHeight: '1.75',
                      }}
                    >
                      {summary}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mt-4" role="alert">
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
      </div>
    </div>
  );
}
