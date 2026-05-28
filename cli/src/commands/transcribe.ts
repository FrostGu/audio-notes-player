import { existsSync } from 'fs';
import { stat, writeFile } from 'fs/promises';
import { resolve } from 'path';
import chalk from 'chalk';
import { ProgressReporter } from '../utils/progress';

import { transcribe, TranscribeEvent } from '../../../src/lib/transcribe';
import { downloadAudio } from '../../../src/lib/core/audio-downloader';

export interface TranscribeOptions {
  summary: boolean;
  language: string;
  provider?: 'local' | 'openai';
  output?: string;
  outputFormat: 'text' | 'json' | 'markdown' | 'srt';
  quiet: boolean;
}

function isUrl(input: string): boolean {
  return input.startsWith('http://') || input.startsWith('https://');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatOutput(transcript: string, summary: string | null, format: string, srt?: string): string {
  switch (format) {
    case 'srt':
      return srt || '';
    case 'json':
      return JSON.stringify(
        { transcript, summary: summary || undefined, srt: srt || undefined },
        null,
        2
      );
    case 'markdown':
      let md = `# Transcription\n\n${transcript}`;
      if (summary) {
        md += `\n\n---\n\n# Summary\n\n${summary}`;
      }
      return md;
    default:
      let text = transcript;
      if (summary) {
        text += `\n\n========== SUMMARY ==========\n\n${summary}`;
      }
      return text;
  }
}

export async function transcribeCommand(
  input: string,
  options: TranscribeOptions
): Promise<void> {
  const progress = new ProgressReporter(options.quiet);
  const needSrt = options.outputFormat === 'srt';

  try {
    let transcript: string;
    let segments: any[] = [];
    let srt: string | undefined;
    let capturedSrt: string | undefined;

    const needSrt = options.outputFormat === 'srt';

    // Determine input type and get buffer
    let buffer: Buffer;
    let extension: string;

    if (isUrl(input)) {
      progress.start('Downloading audio...');
      const downloadResult = await downloadAudio(input);
      progress.succeed(`Audio downloaded (${formatBytes(downloadResult.buffer.length)})`);
      buffer = downloadResult.buffer;
      extension = downloadResult.extension;
    } else {
      const filePath = resolve(input);
      if (!existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      const fileStats = await stat(filePath);
      progress.info(`File: ${filePath} (${formatBytes(fileStats.size)})`);
      const { readFile } = await import('fs/promises');
      buffer = await readFile(filePath);
      extension = filePath.split('.').pop() || 'mp3';
    }

    progress.start('Transcribing audio...');

    const transcribeResult = await transcribe(buffer, extension, {
      language: options.language,
      provider: options.provider,
      onEvent: (event: TranscribeEvent) => {
        if (event.type === 'segment') {
          segments.push(event.segment);
          progress.update(`Transcribed ${segments.length} segments...`);
        } else if (event.type === 'progress') {
          progress.update(event.message);
        }
      }
    });

    transcript = transcribeResult.text;
    srt = transcribeResult.srt;
    segments = transcribeResult.segments || [];

    progress.succeed('Transcription complete');

    // Format output
    const output = formatOutput(transcript, null, options.outputFormat, srt);

    // Write output
    if (options.output) {
      await writeFile(options.output, output, 'utf-8');
      console.log(chalk.green(`\nOutput saved to: ${options.output}`));
    } else {
      console.log('\n' + output);
    }

  } catch (error) {
    progress.fail('Operation failed');
    console.error(
      chalk.red(`\nError: ${error instanceof Error ? error.message : 'Unknown error'}`)
    );
    process.exit(1);
  }
}
