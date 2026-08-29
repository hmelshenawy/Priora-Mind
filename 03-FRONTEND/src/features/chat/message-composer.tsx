'use client';

import { useState } from 'react';

export function MessageComposer({
  disabled,
  labels,
  onSend,
}: {
  disabled: boolean;
  labels: { placeholder: string; send: string; sending: string; emptyMessage: string };
  onSend: (content: string) => void;
}) {
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const trimmed = content.trim();
    if (!trimmed) {
      setError(labels.emptyMessage);
      return;
    }
    setError(null);
    onSend(trimmed);
    setContent('');
  };

  return (
    <form
      className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled) submit();
      }}
    >
      <label className="sr-only" htmlFor="chat-message-input">{labels.placeholder}</label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <textarea
          id="chat-message-input"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          disabled={disabled}
          placeholder={labels.placeholder}
          rows={2}
          className="min-h-16 flex-1 resize-none rounded-2xl border border-slate-200 px-4 py-3 outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-slate-950 disabled:bg-slate-100"
        />
        <button type="submit" disabled={disabled} className="rounded-2xl bg-slate-950 px-5 py-3 font-semibold text-white disabled:opacity-60">
          {disabled ? labels.sending : labels.send}
        </button>
      </div>
      {error ? <p role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}
    </form>
  );
}
