import { logger } from '@/lib/utils';
import { join, extname } from 'path';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { execFileSync, spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';
import { getConfig } from './config';
import { WhisperVerboseResponse, SrtEntry, TranscriptSegment, TranscriptionResult } from './core/types';
import { convertSegmentsToSrtEntries, entriesToSrtString } from './core/srt';

export type TranscribeEvent =
  | { type: 'metadata'; language?: string; duration?: number }
  | { type: 'segment'; segment: TranscriptSegment; text: string }
  | { type: 'progress'; percent: number; message: string }
  | { type: 'complete'; text: string; segments: TranscriptSegment[]; srt: string }
  | { type: 'error'; message: string }

export interface TranscribeOptions {
  language?: string
  provider?: 'local' | 'openai'
  signal?: AbortSignal
  onEvent?: (event: TranscribeEvent) => void
}

function assertInTempDir(testPath: string, tempBase: string): void {
  const { resolve, relative } = require('path')
  const resolved = resolve(testPath)
  const rel = relative(tempBase, resolved)
  if (rel.startsWith('..')) {
    throw new Error(`Path traversal detected: ${testPath}`)
  }
}

function getAudioDuration(inputPath: string): number {
  try {
    const result = execFileSync('ffprobe', [
      '-i', inputPath,
      '-show_entries', 'format=duration',
      '-v', 'quiet',
      '-of', 'csv=p=0'
    ], { timeout: 10000 })
    return Number.parseFloat(result.toString().trim()) || 0
  } catch {
    return 0
  }
}

export async function transcribe(
  audioBuffer: Buffer,
  extension: string,
  options: TranscribeOptions
): Promise<TranscriptionResult> {
  const config = getConfig()
  const language = options.language || 'auto'
  const provider = options.provider || config.transcriptionProvider
  const signal = options.signal
  const onEvent = options.onEvent

  const sessionId = uuidv4()
  const baseDir = join(process.cwd(), 'temp')
  const tempDir = join(baseDir, sessionId)
  const ext = extension.startsWith('.') ? extension : `.${extension}`

  try {
    if (!existsSync(baseDir)) mkdirSync(baseDir, { recursive: true })
    if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true })

    const inputPath = join(tempDir, `input${ext}`)
    writeFileSync(inputPath, Buffer.from(audioBuffer))

    if (provider === 'local') {
      return await transcribeLocal(inputPath, tempDir, language, signal, onEvent)
    }

    return await transcribeOpenAI(inputPath, tempDir, language, signal, onEvent)
  } catch (error) {
    logger.error('[Transcription] Error:', error)
    throw error
  } finally {
    try {
      if (existsSync(tempDir)) {
        execFileSync('rm', ['-rf', tempDir], { timeout: 10000 })
      }
    } catch (e) {
      logger.warn('[Transcription] Cleanup error:', e)
    }
  }
}

async function transcribeLocal(
  inputPath: string,
  tempDir: string,
  language: string,
  signal?: AbortSignal,
  onEvent?: (event: TranscribeEvent) => void
): Promise<TranscriptionResult> {
  const config = getConfig()

  // Preprocess audio: normalize loudness + noise reduction
  const processedPath = join(tempDir, 'preprocessed.wav')
  onEvent?.({ type: 'progress', percent: 0, message: '预处理音频（降噪 + 音量归一化）...' })
  try {
    execFileSync('ffmpeg', [
      '-i', inputPath,
      '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11,afftdn=nf=-25',
      '-ar', '16000',
      '-ac', '1',
      '-y', processedPath,
    ], { timeout: 120000 })
  } catch {
    logger.warn('[Transcribe] Audio preprocessing failed, using original file')
    return runFasterWhisperDirect(inputPath, tempDir, language, signal, onEvent)
  }

  return runFasterWhisperDirect(processedPath, tempDir, language, signal, onEvent)
}

async function runFasterWhisperDirect(
  inputPath: string,
  tempDir: string,
  language: string,
  signal?: AbortSignal,
  onEvent?: (event: TranscribeEvent) => void
): Promise<TranscriptionResult> {
  const config = getConfig()
  const model = config.fasterWhisperModel
  const device = config.fasterWhisperDevice
  const computeType = config.fasterWhisperComputeType
  const pythonPath = config.fasterWhisperPython
    || join(process.env.HOME || process.cwd(), '.cache/audio-notes-player/whisper-venv/bin/python')
  const scriptPath = join(process.cwd(), 'scripts', 'faster_whisper_transcribe.py')

  if (!existsSync(pythonPath) && !config.fasterWhisperPython) {
    const fallback = 'python3'
    logger.info('[Transcribe] Using fallback python3 for faster-whisper')
    return runFasterWhisper(fallback, scriptPath, inputPath, model, device, computeType, language, 0, signal, onEvent)
  }

  return runFasterWhisper(pythonPath, scriptPath, inputPath, model, device, computeType, language, 0, signal, onEvent)
}

async function runFasterWhisper(
  pythonPath: string,
  scriptPath: string,
  inputPath: string,
  model: string,
  device: string,
  computeType: string,
  language: string,
  timeOffset: number,
  signal?: AbortSignal,
  onEvent?: (event: TranscribeEvent) => void
): Promise<TranscriptionResult> {
  const args = [scriptPath, inputPath, '--model', model, '--device', device, '--compute-type', computeType, '--language', language]
  if (timeOffset > 0) args.push('--time-offset', String(timeOffset))

  return new Promise((resolve, reject) => {
    const child = spawn(pythonPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const segments: TranscriptSegment[] = []
    const transcriptParts: string[] = []
    let stdoutBuffer = ''
    let stderrBuffer = ''
    let completed = false
    let aborted = false

    const abort = () => {
      if (aborted) return
      aborted = true
      if (child && !child.killed) child.kill('SIGTERM')
      reject(new Error('Transcription paused'))
    }

    if (signal?.aborted) { abort(); return }
    signal?.addEventListener('abort', abort, { once: true })

    const processLine = (line: string) => {
      if (!line.trim()) return
      try {
        const event = JSON.parse(line) as any
        if (event.type === 'metadata') {
          onEvent?.({ type: 'metadata', language: event.language, duration: event.duration })
        } else if (event.type === 'segment') {
          segments.push(event.segment)
          transcriptParts.push(event.segment.text)
          onEvent?.({ type: 'segment', segment: event.segment, text: event.text || event.segment.text })
        } else if (event.type === 'complete') {
          completed = true
          const allSegments = event.segments || segments
          const srtEntries: SrtEntry[] = allSegments.map((s: TranscriptSegment, i: number) => ({
            index: i + 1, startTime: s.startTime, endTime: s.endTime, text: s.text
          }))
          resolve({ text: event.text, srt: entriesToSrtString(srtEntries), segments: allSegments })
        }
      } catch (e) {
        reject(new Error(`Failed to parse faster-whisper output: ${line}`))
      }
    }

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdoutBuffer += chunk
      const lines = stdoutBuffer.split('\n')
      stdoutBuffer = lines.pop() || ''
      lines.forEach(processLine)
    })

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => { stderrBuffer += chunk })

    child.on('error', reject)
    child.on('close', (code) => {
      signal?.removeEventListener('abort', abort)
      if (aborted) return
      if (stdoutBuffer.trim()) processLine(stdoutBuffer)
      if (code !== 0) {
        reject(new Error(stderrBuffer || `faster-whisper exited with code ${code}`))
        return
      }
      if (!completed) {
        const srtEntries: SrtEntry[] = segments.map((s, i) => ({
          index: i + 1, startTime: s.startTime, endTime: s.endTime, text: s.text
        }))
        resolve({ text: transcriptParts.join(' '), srt: entriesToSrtString(srtEntries), segments })
      }
    })
  })
}

async function transcribeOpenAI(
  inputPath: string,
  tempDir: string,
  language: string,
  signal?: AbortSignal,
  onEvent?: (event: TranscribeEvent) => void
): Promise<TranscriptionResult> {
  const config = getConfig()
  const client = new OpenAI({
    apiKey: config.openaiApiKey,
    baseURL: config.openaiBaseUrl
  })

  assertInTempDir(inputPath, tempDir)
  const originalDuration = getAudioDuration(inputPath)
  logger.info('[Transcribe] OpenAI path, duration:', originalDuration)

  const allSrtEntries: SrtEntry[] = []
  const allSegments: TranscriptSegment[] = []
  let globalSrtIndex = 1

  const duration = originalDuration || 300
  const chunkDuration = 300
  const totalChunks = Math.max(1, Math.ceil(duration / chunkDuration))

  for (let i = 0; i < totalChunks; i++) {
    if (signal?.aborted) throw new Error('Transcription paused')
    const start = i * chunkDuration
    const outputPath = join(tempDir, `chunk-${i + 1}${extname(inputPath)}`)

    execFileSync('ffmpeg', [
      '-i', inputPath,
      '-ss', String(start),
      '-t', String(chunkDuration),
      '-c', 'copy',
      '-y', outputPath
    ], { timeout: 120000 })

    const chunkBuffer = readFileSync(outputPath)
    const chunkFile = new File([chunkBuffer], `chunk-${i}${extname(inputPath)}`)

    const response = await client.audio.transcriptions.create({
      model: 'whisper-1',
      file: chunkFile,
      response_format: 'verbose_json',
      language: language !== 'auto' ? language : undefined,
    }) as unknown as WhisperVerboseResponse

    const chunkEntries = convertSegmentsToSrtEntries(response.segments, i, chunkDuration, globalSrtIndex)
    globalSrtIndex += chunkEntries.length
    allSrtEntries.push(...chunkEntries)

    const chunkSegments = chunkEntries.map(e => ({
      id: `segment-${e.index}`, startTime: e.startTime, endTime: e.endTime, text: e.text
    }))
    allSegments.push(...chunkSegments)

    onEvent?.({
      type: 'progress',
      percent: Math.round(((i + 1) / totalChunks) * 100),
      message: `Transcribing chunk ${i + 1}/${totalChunks}`
    })
  }

  return {
    text: allSegments.map(s => s.text).join(' '),
    srt: entriesToSrtString(allSrtEntries),
    segments: allSegments
  }
}
