import { NextResponse } from 'next/server';
import { logger } from '@/lib/utils';
import { extname } from 'path';
import { transcribe, TranscribeEvent } from '@/lib/transcribe';
import type { TranscriptSegment } from '@/lib/core/types';

export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    const language = (formData.get('language') as string) || 'auto';
    const resumeFromValue = formData.get('resumeFrom');
    const resumeFrom = typeof resumeFromValue === 'string'
      ? Math.max(0, Number.parseFloat(resumeFromValue) || 0)
      : 0;
    const fileName = file instanceof File ? file.name : 'audio.mp3';
    const extension = extname(fileName) || '.mp3';

    (async () => {
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        let streamedSegments: TranscriptSegment[] = [];
        let capturedSrt = '';

        const result = await transcribe(buffer, extension, {
          language,
          signal: request.signal,
          onEvent: (event: TranscribeEvent) => {
            if (event.type === 'segment') {
              streamedSegments.push(event.segment);
              const srtEntries = streamedSegments.map((s, i) =>
                `${i + 1}\n${formatSrtTime(s.startTime)} --> ${formatSrtTime(s.endTime)}\n${s.text}\n`
              ).join('\n');
              capturedSrt = srtEntries;

              writer.write(encoder.encode(JSON.stringify({
                type: 'partial',
                transcript: streamedSegments.map(s => s.text).join(' '),
                srt: capturedSrt,
                segments: [event.segment],
                progress: {
                  current: streamedSegments.length,
                  currentTime: event.segment.endTime
                }
              }) + '\n'));
            } else if (event.type === 'progress') {
              writer.write(encoder.encode(JSON.stringify({
                type: 'progress',
                message: event.message
              }) + '\n'));
            }
          }
        });

        writer.write(encoder.encode(JSON.stringify({
          type: 'complete',
          transcript: result.text,
          srt: result.srt,
          segments: result.segments
        }) + '\n'));

        if (streamedSegments.length === 0 && result.segments) {
          streamedSegments = result.segments;
        }
      } catch (error) {
        logger.error('[Transcription] Error:', error);
        if (!request.signal.aborted) {
          writer.write(encoder.encode(JSON.stringify({
            type: 'error',
            error: error instanceof Error ? error.message : 'Failed to transcribe audio'
          }) + '\n'));
        }
      } finally {
        try { await writer.close(); } catch { /* ignore */ }
      }
    })();

    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    await writer.close();
    logger.error('[Transcription] Error:', error);
    return NextResponse.json({ error: 'Failed to start transcription' }, { status: 500 });
  }
}

function formatSrtTime(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = Math.floor(safeSeconds % 60);
  const millis = Math.round((safeSeconds % 1) * 1000);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${millis.toString().padStart(3, '0')}`;
}
