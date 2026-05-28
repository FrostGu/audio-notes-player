#!/usr/bin/env node
import { Command } from 'commander';
import { resolve } from 'path';
import { homedir } from 'os';
import { readFileSync, existsSync } from 'fs';
import { transcribeCommand, TranscribeOptions } from './commands/transcribe';

function loadEnv(path: string): void {
  if (!existsSync(path)) return;
  const content = readFileSync(path, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnv(resolve(process.cwd(), '.env.local'));
loadEnv(resolve(process.cwd(), '.env'));
loadEnv(resolve(homedir(), '.pt', '.env'));
loadEnv(resolve(homedir(), '.config', 'pt', '.env'));

const program = new Command();

program
  .name('pt')
  .description('CLI tool for podcast transcription with AI summary')
  .version('1.0.0');

program
  .argument('[input]', 'Local file path or direct audio URL')
  .option('-s, --summary', 'Generate AI summary after transcription', false)
  .option('--no-summary', 'Disable AI summary generation')
  .option('-l, --language <lang>', 'Language code (auto, en, zh, etc.)', 'auto')
  .option('-p, --provider <provider>', 'Transcription provider: local, openai', 'openai')
  .option('-o, --output <file>', 'Output file path (stdout if not specified)')
  .option('--output-format <format>', 'Output format: text, json, markdown, srt', 'text')
  .option('-q, --quiet', 'Suppress progress output', false)
  .action((input: string | undefined, options: TranscribeOptions) => {
    if (!input) {
      program.help();
    } else {
      transcribeCommand(input, options);
    }
  });

program.parse();
