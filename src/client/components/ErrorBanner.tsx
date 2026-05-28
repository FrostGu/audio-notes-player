'use client';

import React from 'react';
import { useStore } from '@/client/store';

export function ErrorBanner() {
  const error = useStore((s) => s.error);
  const setError = useStore((s) => s.setError);

  if (!error) return null;

  return (
    <div className="relative mt-6 rounded-lg border border-red-300/30 bg-red-500/15 px-4 py-3 text-red-100" role="alert">
      <strong className="font-bold">错误: </strong>
      <span className="block sm:inline">{error}</span>
      <button className="absolute top-0 bottom-0 right-0 px-4 py-3" onClick={() => setError(null)}>
        <span className="sr-only">Dismiss</span>
        <svg className="fill-current h-6 w-6 text-red-500" role="button" viewBox="0 0 20 20">
          <path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z"/>
        </svg>
      </button>
    </div>
  );
}
