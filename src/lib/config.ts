export function getConfig() {
  return {
    openaiApiKey: process.env.OPENAI_API_KEY || process.env.API_KEY || '',
    openaiBaseUrl: process.env.OPENAI_BASE_URL || process.env.BASE_URL || 'https://api.openai.com/v1',
    notesModel: process.env.NOTES_MODEL || 'gpt-3.5-turbo',
    transcriptionProvider: (process.env.TRANSCRIPTION_PROVIDER || 'local') as 'local' | 'openai',
    fasterWhisperModel: process.env.FASTER_WHISPER_MODEL || 'medium',
    fasterWhisperDevice: process.env.FASTER_WHISPER_DEVICE || 'cpu',
    fasterWhisperComputeType: process.env.FASTER_WHISPER_COMPUTE_TYPE || 'int8',
    fasterWhisperPython: process.env.FASTER_WHISPER_PYTHON || '',
    fasterWhisperInitialPrompt: process.env.FASTER_WHISPER_INITIAL_PROMPT || '',
  }
}
