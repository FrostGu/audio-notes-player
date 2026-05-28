'use client';

import { useRef, useCallback } from 'react';
import { useStore } from '@/client/store';

export function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const setError = useStore((s) => s.setError);

  const seekTo = useCallback((time: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = time;
    audioRef.current.play().catch(() => {
      setError('请先与页面交互以启用音频播放');
    });
  }, [setError]);

  return { audioRef, seekTo };
}
