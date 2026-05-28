'use client';

import { useRef, useCallback } from 'react';
import { useStore } from '@/client/store';
import type { TranscriptSegment } from '@/lib/core/types';

interface MergeSegmentsFn {
  (existing: TranscriptSegment[], incoming: TranscriptSegment[]): TranscriptSegment[];
}

export function useTranscription() {
  const abortRef = useRef<AbortController | null>(null);
  const streamedRef = useRef<TranscriptSegment[]>([]);

  const session = useStore((s) => s.session);
  const language = useStore((s) => s.language);
  const appendSegments = useStore((s) => s.appendSegments);
  const updateTranscription = useStore((s) => s.updateTranscription);
  const setShownotes = useStore((s) => s.setShownotes);
  const setState = useStore((s) => s.setState);
  const setError = useStore((s) => s.setError);
  const setProgress = useStore((s) => s.setProgress);

  const startTranscription = useCallback(async () => {
    if (!session) return;

    const isResume = streamedRef.current.length > 0;
    const resumeFrom = streamedRef.current.at(-1)?.endTime ?? 0;
    const abortController = new AbortController();
    abortRef.current = abortController;

    setState('transcribing');
    setError(null);

    if (!isResume) {
      streamedRef.current = [];
    }

    setProgress(isResume ? `Resuming from ${formatTime(resumeFrom)}...` : 'Preparing transcription...');

    const formData = new FormData();
    formData.append('file', new File([], session.audioFileName));

    const blobResponse = await fetch(session.audioUrl);
    const blob = await blobResponse.blob();
    formData.set('file', blob, session.audioFileName);
    formData.append('language', language);
    formData.append('outputFormat', 'srt');

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
        messageBuffer = lines.pop() || '';

        for (const line of lines.filter(Boolean)) {
          let data: any;
          try {
            data = JSON.parse(line);
          } catch {
            continue;
          }

          switch (data.type) {
            case 'progress':
              setProgress(data.message);
              break;
            case 'partial':
              if (data.segments) {
                const mergeSegments: MergeSegmentsFn = (existing, incoming) => {
                  const lastEnd = existing.at(-1)?.endTime ?? -Infinity;
                  const next = incoming.filter((s) => s.endTime > lastEnd + 0.05);
                  return [...existing, ...next].map((s, i) => ({ ...s, id: `segment-${i + 1}` }));
                };
                streamedRef.current = mergeSegments(streamedRef.current, data.segments as TranscriptSegment[]);
                appendSegments(data.segments as TranscriptSegment[]);
              }
              break;
            case 'complete':
              await generateShownotes(data.transcript, data.segments || []);
              setState('completed');
              setProgress('Completed');
              break;
            case 'error':
              setError(data.error);
              setState('error');
              break;
          }
        }
      }
    } catch (error: any) {
      if (abortController.signal.aborted) {
        setState('paused');
        setProgress(streamedRef.current.length > 0
          ? `Paused at ${formatTime(streamedRef.current.at(-1)?.endTime ?? 0)}`
          : 'Paused before transcript segments were received'
        );
      } else {
        setError('Failed to transcribe audio');
        setState('error');
      }
    } finally {
      if (abortRef.current === abortController) {
        abortRef.current = null;
      }
    }
  }, [session, language, appendSegments, setShownotes, setState, setError, setProgress]);

  const pauseTranscription = useCallback(() => {
    abortRef.current?.abort();
    setProgress('Pausing transcription...');
  }, [setProgress]);

  const resetTranscription = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    streamedRef.current = [];
    updateTranscription('', '', []);
    setState('idle');
  }, [updateTranscription, setState]);

  return { startTranscription, pauseTranscription, resetTranscription, isPaused: () => useStore.getState().state === 'paused' };
}

async function generateShownotes(transcript: string, segments: TranscriptSegment[]) {
  const setState = useStore.getState().setState;
  const setProgress = useStore.getState().setProgress;
  const setShownotes = useStore.getState().setShownotes;
  const setError = useStore.getState().setError;
  const language = useStore.getState().language;

  if (segments.length === 0) return;

  setState('generating_notes');
  setProgress('Generating shownotes...');

  try {
    const response = await fetch('/api/generate-shownotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript, segments, language }),
    });

    if (!response.ok) throw new Error('Failed to generate shownotes');
    const data = await response.json();
    setShownotes(data.shownotes);
  } catch (error) {
    setError('Failed to generate shownotes');
  }
}

function formatTime(seconds: number): string {
  return `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.floor(Math.max(0, seconds)) % 60).padStart(2, '0')}`;
}
