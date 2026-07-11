'use client';
import { useState } from 'react';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled: boolean;
}

/** Message composer. Enter sends (Shift+Enter for a newline); disabled while a turn is in flight. */
export function ChatInput({ onSend, disabled }: ChatInputProps): React.JSX.Element {
  const [value, setValue] = useState('');

  function submit(): void {
    const trimmed = value.trim();
    if (trimmed === '' || disabled) return;
    onSend(trimmed);
    setValue('');
  }

  return (
    <form
      className="mt-3 flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        aria-label="Your message"
        className="min-h-[2.75rem] flex-1 resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        rows={1}
        value={value}
        disabled={disabled}
        placeholder="Type your feedback…"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <button
        type="submit"
        disabled={disabled || value.trim() === ''}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-300"
      >
        Send
      </button>
    </form>
  );
}
