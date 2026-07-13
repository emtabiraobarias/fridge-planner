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
        className="min-h-[46px] flex-1 resize-none rounded-[23px] bg-neutral-100 px-4 py-3 text-[15px] text-ink placeholder:text-muted"
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
        className="min-h-[46px] rounded-full bg-accent px-5 font-semibold text-bg transition-colors hover:bg-accent-600 disabled:opacity-45"
      >
        Send
      </button>
    </form>
  );
}
