import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { cors } from 'hono/cors'
import { readFileSync, existsSync } from 'fs'
import { join, extname } from 'path'

const app = new Hono()

app.use('/*', cors())

// CORS for Vite dev server on 5173
app.use('*', async (c, next) => {
  c.res.headers.set('Access-Control-Allow-Origin', 'http://localhost:5173')
  c.res.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  c.res.headers.set('Access-Control-Allow-Headers', 'Content-Type')
  if (c.req.method === 'OPTIONS') return c.body(null, 204)
  await next()
})

// API routes
app.post('/api/audio', async (c) => {
  const { url } = await c.req.json()
  let audioUrl = url

  if (audioUrl.includes('xiaoyuzhoufm.com')) {
    const scrapeRes = await fetch(`${c.req.url.replace('/api/audio', '/api/scrape')}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: audioUrl }),
    })
    const scrapeData: any = await scrapeRes.json()
    audioUrl = scrapeData.audioUrl || audioUrl
  }

  const response = await fetch(audioUrl)
  if (!response.ok) {
    return c.json({ error: 'Failed to download audio' }, 500)
  }

  const blob = await response.blob()
  return c.newResponse(blob, {
    headers: { 'Content-Type': blob.type || 'audio/mpeg' },
  })
})

app.post('/api/scrape', async (c) => {
  try {
    const { url } = await c.req.json()
    if (!url || !url.includes('xiaoyuzhoufm.com')) {
      return c.json({ error: 'Invalid podcast URL' }, 400)
    }

    const puppeteer = await import('puppeteer')
    const browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })

    const page = await browser.newPage()
    await page.goto(url, { waitUntil: 'networkidle0' })

    const audioUrl = await page.evaluate(() => {
      const audioEl = document.querySelector('audio')
      return audioEl?.querySelector('source')?.getAttribute('src')
        || audioEl?.getAttribute('src')
        || (window as any).__NEXT_DATA__?.props?.pageProps?.episode?.audio?.url
        || null
    })

    await browser.close()

    if (!audioUrl) {
      return c.json({ error: 'Could not find audio source' }, 404)
    }

    return c.json({ audioUrl })
  } catch (error) {
    console.error('[Scrape] Error:', error)
    return c.json({ error: 'Failed to parse podcast URL' }, 500)
  }
})

app.post('/api/transcribe', async (c) => {
  const formData = await c.req.formData()
  const file = formData.get('file')

  if (!file || !(file instanceof File)) {
    return c.json({ error: 'No audio file provided' }, 400)
  }

  const language = (formData.get('language') as string) || 'auto'
  const extension = file.name.split('.').pop() || 'mp3'
  const buffer = Buffer.from(await file.arrayBuffer())

  const { transcribe } = await import('../lib/transcribe')

  const stream = new TransformStream()
  const writer = stream.writable.getWriter()
  const encoder = new TextEncoder()

  ;(async () => {
    try {
      const result = await transcribe(buffer, extension, {
        language,
        signal: c.req.raw.signal,
        onEvent: (event) => {
          if (event.type === 'segment') {
            writer.write(encoder.encode(JSON.stringify({
              type: 'partial',
              segments: [event.segment],
              transcript: event.text,
            }) + '\n'))
          } else if (event.type === 'progress') {
            writer.write(encoder.encode(JSON.stringify({
              type: 'progress',
              message: event.message,
            }) + '\n'))
          }
        },
      })

      writer.write(encoder.encode(JSON.stringify({
        type: 'complete',
        transcript: result.text,
        srt: result.srt,
        segments: result.segments,
      }) + '\n'))
    } catch (error: any) {
      if (!c.req.raw.signal.aborted) {
        writer.write(encoder.encode(JSON.stringify({
          type: 'error',
          error: error.message || 'Transcription failed',
        }) + '\n'))
      }
    } finally {
      await writer.close().catch(() => {})
    }
  })()

  return c.newResponse(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
})

app.post('/api/generate-shownotes', async (c) => {
  const { getConfig } = await import('../lib/config')
  const config = getConfig()
  const OpenAI = (await import('openai')).default
  const client = new OpenAI({
    apiKey: config.openaiApiKey,
    baseURL: config.openaiBaseUrl,
  })

  const { transcript, segments } = await c.req.json() as any

  if (!segments?.length) {
    return c.json({ error: 'Transcript segments are required' }, 400)
  }

  const transcriptForModel = segments
    .map((s: any) => `[${Math.round(s.startTime)}-${Math.round(s.endTime)}] ${s.text}`)
    .join('\n')
    .slice(0, 60000)

  try {
    const response = await client.chat.completions.create({
      model: config.notesModel,
      temperature: 0.2,
      max_tokens: 1800,
      messages: [
        {
          role: 'system',
          content: 'You generate structured shownotes for an audio player. Return JSON only. Use seconds for all times.',
        },
        {
          role: 'user',
          content: `Create concise shownotes from this timestamped transcript. Return this shape:
{
  "title": "...",
  "overview": "...",
  "chapters": [{ "id": "chapter-1", "title": "...", "startTime": 0, "endTime": 120, "summary": "...", "keyPoints": ["..."] }],
  "highlights": [{ "id": "highlight-1", "title": "...", "startTime": 0, "endTime": 30, "reason": "...", "quote": "..." }]
}

Transcript:
${transcriptForModel}`
        }
      ]
    })

    const content = response.choices[0]?.message?.content
    if (!content) throw new Error('Empty response')

    const cleaned = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()
    const shownotes = JSON.parse(cleaned)

    // Normalize
    shownotes.chapters = (shownotes.chapters ?? []).slice(0, 12).map((c: any, i: number) => ({
      id: c.id || `chapter-${i + 1}`,
      title: c.title || `Chapter ${i + 1}`,
      startTime: clampTime(c.startTime, segments[0]?.startTime || 0, segments[0]?.startTime || 0, segments.at(-1)?.endTime || 0),
      endTime: clampTime(c.endTime, (c.startTime || 0) + 300, c.startTime || 0, segments.at(-1)?.endTime || 0),
      summary: c.summary || '',
      keyPoints: (c.keyPoints ?? []).slice(0, 5),
    }))

    shownotes.highlights = (shownotes.highlights ?? []).slice(0, 10).map((h: any, i: number) => ({
      id: h.id || `highlight-${i + 1}`,
      title: h.title || `Highlight ${i + 1}`,
      startTime: clampTime(h.startTime, segments[Math.floor((segments.length * (i + 1)) / 11)]?.startTime || 0, segments[0]?.startTime || 0, segments.at(-1)?.endTime || 0),
      endTime: h.endTime !== undefined ? clampTime(h.endTime, (h.startTime || 0) + 60, h.startTime || 0, segments.at(-1)?.endTime || 0) : undefined,
      reason: h.reason || '',
      quote: h.quote,
    }))

    return c.json({ shownotes })
  } catch (error) {
    console.warn('[Shownotes] Fallback to local chaptering:', error)
    return c.json({ shownotes: buildFallbackShownotes(segments), warning: 'AI shownotes failed' })
  }
})

const port = Number(process.env.PORT) || 3001
serve({ fetch: app.fetch, port })
console.log(`Server running on http://localhost:${port}`)
console.log(`Frontend: http://localhost:5173 (Vite dev server))`)

function clampTime(value: any, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback
  return Math.min(Math.max(value, min), max)
}

function buildFallbackShownotes(segments: any[]): any {
  const chapters = []
  const size = 12
  for (let i = 0; i < segments.length; i += size) {
    const group = segments.slice(i, i + size)
    chapters.push({
      id: `chapter-${chapters.length + 1}`,
      title: group[0]?.text?.slice(0, 72) || `Chapter ${chapters.length + 1}`,
      startTime: group[0]?.startTime || 0,
      endTime: group.at(-1)?.endTime || 0,
      summary: group.map((s: any) => s.text).join(' ').slice(0, 280),
      keyPoints: group.slice(0, 3).map((s: any) => s.text),
    })
  }
  return {
    title: 'Audio Notes',
    overview: segments.slice(0, 5).map((s: any) => s.text).join(' ').slice(0, 500),
    chapters,
    highlights: chapters.slice(0, 5).map((c: any, i: number) => ({
      id: `highlight-${i + 1}`, title: c.title, startTime: c.startTime, endTime: c.endTime, reason: c.summary,
    })),
  }
}
