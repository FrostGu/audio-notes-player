import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import type { Chapter, Highlight, Shownotes, TranscriptSegment } from '@/lib/core/types';
import { logger } from '@/lib/utils';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY || 'missing-api-key',
  baseURL: process.env.OPENAI_BASE_URL || process.env.BASE_URL || process.env.NEXT_PUBLIC_BASE_URL
});

type RequestBody = {
  transcript: string;
  segments: TranscriptSegment[];
  language?: string;
};

function clampTime(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }
  return Math.min(Math.max(value, min), max);
}

function normalizeShownotes(input: Partial<Shownotes>, segments: TranscriptSegment[]): Shownotes {
  const firstStart = segments[0]?.startTime ?? 0;
  const lastEnd = segments[segments.length - 1]?.endTime ?? firstStart;

  const chapters: Chapter[] = (input.chapters ?? []).slice(0, 12).map((chapter, index) => {
    const fallbackStart = segments[Math.floor((segments.length * index) / Math.max(input.chapters?.length ?? 1, 1))]?.startTime ?? firstStart;
    const startTime = clampTime(chapter.startTime, fallbackStart, firstStart, lastEnd);
    const endTime = clampTime(chapter.endTime, Math.min(startTime + 300, lastEnd), startTime, lastEnd);

    return {
      id: chapter.id || `chapter-${index + 1}`,
      title: chapter.title || `Chapter ${index + 1}`,
      startTime,
      endTime,
      summary: chapter.summary || '',
      keyPoints: Array.isArray(chapter.keyPoints) ? chapter.keyPoints.slice(0, 5) : []
    };
  });

  const highlights: Highlight[] = (input.highlights ?? []).slice(0, 10).map((highlight, index) => {
    const fallbackSegment = segments[Math.floor((segments.length * (index + 1)) / Math.max((input.highlights?.length ?? 1) + 1, 1))];
    const startTime = clampTime(highlight.startTime, fallbackSegment?.startTime ?? firstStart, firstStart, lastEnd);
    const endTime = highlight.endTime === undefined
      ? undefined
      : clampTime(highlight.endTime, Math.min(startTime + 60, lastEnd), startTime, lastEnd);

    return {
      id: highlight.id || `highlight-${index + 1}`,
      title: highlight.title || `Highlight ${index + 1}`,
      startTime,
      endTime,
      reason: highlight.reason || '',
      quote: highlight.quote
    };
  });

  return {
    title: input.title || 'Audio Notes',
    overview: input.overview || 'Shownotes generated from the transcript.',
    chapters,
    highlights
  };
}

function buildFallbackShownotes(segments: TranscriptSegment[]): Shownotes {
  const chapterSize = 12;
  const chapters: Chapter[] = [];

  for (let i = 0; i < segments.length; i += chapterSize) {
    const group = segments.slice(i, i + chapterSize);
    const first = group[0];
    const last = group[group.length - 1];

    if (!first || !last) {
      continue;
    }

    chapters.push({
      id: `chapter-${chapters.length + 1}`,
      title: first.text.slice(0, 72) || `Chapter ${chapters.length + 1}`,
      startTime: first.startTime,
      endTime: last.endTime,
      summary: group.map((segment) => segment.text).join(' ').slice(0, 280),
      keyPoints: group.slice(0, 3).map((segment) => segment.text)
    });
  }

  return {
    title: 'Audio Notes',
    overview: segments.slice(0, 5).map((segment) => segment.text).join(' ').slice(0, 500),
    chapters,
    highlights: chapters.slice(0, 5).map((chapter, index) => ({
      id: `highlight-${index + 1}`,
      title: chapter.title,
      startTime: chapter.startTime,
      endTime: chapter.endTime,
      reason: chapter.summary
    }))
  };
}

function parseJsonObject(content: string): Partial<Shownotes> {
  const cleaned = content
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  return JSON.parse(cleaned) as Partial<Shownotes>;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as RequestBody;
    const segments = body.segments ?? [];

    if (!Array.isArray(segments) || segments.length === 0) {
      return NextResponse.json(
        { error: 'Transcript segments are required' },
        { status: 400 }
      );
    }

    const transcriptForModel = segments
      .map((segment) => `[${Math.round(segment.startTime)}-${Math.round(segment.endTime)}] ${segment.text}`)
      .join('\n')
      .slice(0, 60000);

    try {
      const response = await client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        temperature: 0.2,
        max_tokens: 1800,
        messages: [
          {
            role: 'system',
            content: `You generate structured shownotes for an audio player. Return JSON only. Use seconds for all times. Do not invent facts. Keep all startTime and endTime values within the provided timestamp ranges.`
          },
          {
            role: 'user',
            content: `Create concise shownotes from this timestamped transcript. Return this shape exactly:
{
  "title": "short title",
  "overview": "2-4 sentence overview",
  "chapters": [
    {
      "id": "chapter-1",
      "title": "chapter title",
      "startTime": 0,
      "endTime": 120,
      "summary": "brief summary",
      "keyPoints": ["point"]
    }
  ],
  "highlights": [
    {
      "id": "highlight-1",
      "title": "highlight title",
      "startTime": 0,
      "endTime": 30,
      "reason": "why this matters",
      "quote": "optional exact short quote"
    }
  ]
}

Transcript:
${transcriptForModel}`
          }
        ]
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty shownotes response');
      }

      return NextResponse.json({
        shownotes: normalizeShownotes(parseJsonObject(content), segments)
      });
    } catch (error) {
      logger.warn('[Shownotes] Falling back to local chaptering:', error);
      return NextResponse.json({
        shownotes: buildFallbackShownotes(segments),
        warning: 'AI shownotes failed. Generated fallback shownotes from transcript segments.'
      });
    }
  } catch (error) {
    logger.error('[Shownotes] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate shownotes' },
      { status: 500 }
    );
  }
}
