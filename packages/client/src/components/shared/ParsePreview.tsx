'use client';
import { useState } from 'react';
import type { Category, Location } from '../../services/inventory';
import type { ParsedQuickItem, Provenance } from '../../lib/quick-parse';
import type { OverridableField } from '../../lib/quick-add-overrides';

const CATEGORY_OPTIONS: readonly Category[] = [
  'Produce',
  'Dairy',
  'Meat',
  'Seafood',
  'Grains',
  'Pantry',
  'Condiments',
  'Frozen',
  'Other',
];
const LOCATION_OPTIONS: readonly Location[] = ['fridge', 'freezer', 'pantry'];
const UNIT_OPTIONS: readonly string[] = [
  'count',
  'g',
  'kg',
  'ml',
  'L',
  'pcs',
  'pack',
  'bag',
  'can',
  'bottle',
  'dozen',
  'bunch',
  'jar',
  'loaf',
];

interface Props {
  items: ParsedQuickItem[];
  onCorrect: (item: ParsedQuickItem, field: OverridableField, value: string | number | null) => void;
  /** One-tap expiry suggestion accept (spec 005 US3/T023 — populated later). */
  onAcceptSuggestion?: (item: ParsedQuickItem) => void;
  showLocation?: boolean;
  showExpiry?: boolean;
}

function formatExpiry(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function provenanceLabel(p: Provenance): string {
  if (p === 'guess') return ' (guessed)';
  if (p === 'learned') return ' (learned)';
  if (p === 'assisted') return ' (AI suggested)';
  return '';
}

/** Tentative values read as approximations: dashed outline + ≈ prefix (never colour alone). */
function chipClass(p: Provenance, palette: string): string {
  const base = `min-h-[32px] rounded-full px-3 py-1 text-[11px] ${palette}`;
  return p === 'explicit' ? base : `${base} border border-dashed border-ink/40`;
}

interface ChipProps {
  field: OverridableField;
  label: string;
  display: string;
  provenance: Provenance;
  palette: string;
  open: boolean;
  onToggle: () => void;
}

function Chip({ field, label, display, provenance, palette, open, onToggle }: ChipProps): React.JSX.Element {
  void field;
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={`${label}: ${display}${provenanceLabel(provenance)}`}
      onClick={onToggle}
      className={chipClass(provenance, palette)}
    >
      {provenance === 'explicit' ? '' : '≈ '}
      {display}
    </button>
  );
}

interface PickerProps {
  label: string;
  options: readonly string[];
  onPick: (value: string) => void;
}

function OptionPicker({ label, options, onPick }: PickerProps): React.JSX.Element {
  return (
    <div role="listbox" aria-label={label} className="mt-1.5 flex w-full flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          role="option"
          aria-selected={false}
          onClick={() => onPick(opt)}
          className="min-h-[32px] rounded-full bg-neutral-100 px-3 py-1 text-[11px] text-neutral-800 hover:bg-neutral-300"
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

interface ValueInputProps {
  label: string;
  type: 'number' | 'date';
  onSet: (raw: string) => void;
}

function ValueInput({ label, type, onSet }: ValueInputProps): React.JSX.Element {
  const [raw, setRaw] = useState('');
  return (
    <div className="mt-1.5 flex w-full items-center gap-1.5">
      <input
        type={type}
        aria-label={label}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        className="min-h-[32px] rounded-full bg-neutral-100 px-3 text-[12px] text-ink"
      />
      <button
        type="button"
        onClick={() => raw && onSet(raw)}
        className="min-h-[32px] rounded-full bg-accent px-3 text-[11px] font-semibold text-bg hover:bg-accent-600"
      >
        Set
      </button>
    </div>
  );
}

interface RowProps {
  item: ParsedQuickItem;
  leadIn: string;
  showLocation: boolean;
  showExpiry: boolean;
  onCorrect: Props['onCorrect'];
  onAcceptSuggestion: Props['onAcceptSuggestion'];
}

function PreviewRow({
  item,
  leadIn,
  showLocation,
  showExpiry,
  onCorrect,
  onAcceptSuggestion,
}: RowProps): React.JSX.Element {
  const [openField, setOpenField] = useState<OverridableField | null>(null);

  function toggle(field: OverridableField): void {
    setOpenField((cur) => (cur === field ? null : field));
  }

  function correct(field: OverridableField, value: string | number | null): void {
    onCorrect(item, field, value);
    setOpenField(null);
  }

  const expiryDisplay = item.expiresAt ? `expires ${formatExpiry(item.expiresAt)}` : 'no expiry';

  return (
    <div role="group" aria-label={`Parsed item ${item.name}`} className="flex flex-wrap items-center gap-1.5">
      <span className="text-muted text-xs">{leadIn}</span>
      <span className="min-h-[32px] rounded-full bg-accent-100 px-3 py-1 text-[11px] font-semibold leading-[22px] text-accent-800">
        {item.name}
      </span>
      <Chip
        field="quantity"
        label="quantity"
        display={`${item.quantity} ${item.unit}`}
        provenance={item.provenance.quantity}
        palette="bg-neutral-100 text-neutral-800"
        open={openField === 'quantity'}
        onToggle={() => toggle('quantity')}
      />
      <Chip
        field="category"
        label="category"
        display={item.category}
        provenance={item.provenance.category}
        palette="bg-accent2-100 text-accent2-800"
        open={openField === 'category'}
        onToggle={() => toggle('category')}
      />
      {showLocation && (
        <Chip
          field="location"
          label="location"
          display={item.location}
          provenance={item.provenance.location}
          palette="bg-accent2-100 text-accent2-800"
          open={openField === 'location'}
          onToggle={() => toggle('location')}
        />
      )}
      {showExpiry && (
        <Chip
          field="expiresAt"
          label="expiry"
          display={expiryDisplay}
          provenance={item.provenance.expiresAt}
          palette="bg-accent-200 text-accent-800"
          open={openField === 'expiresAt'}
          onToggle={() => toggle('expiresAt')}
        />
      )}
      {showExpiry && !item.expiresAt && item.suggestedExpiresAt && onAcceptSuggestion && (
        <button
          type="button"
          aria-label={`Suggested expiry ${formatExpiry(item.suggestedExpiresAt)} — tap to apply`}
          onClick={() => onAcceptSuggestion(item)}
          className="min-h-[32px] rounded-full border border-dashed border-accent-400 bg-transparent px-3 py-1 text-[11px] text-accent-700 hover:bg-accent-100"
        >
          ≈ expires {formatExpiry(item.suggestedExpiresAt)}?
        </button>
      )}

      <FieldEditor openField={openField} correct={correct} />
    </div>
  );
}

interface FieldEditorProps {
  openField: OverridableField | null;
  correct: (field: OverridableField, value: string | number | null) => void;
}

/** The picker/input shown under the row for the currently open chip. */
function FieldEditor({ openField, correct }: FieldEditorProps): React.JSX.Element | null {
  if (openField === 'category') {
    return (
      <OptionPicker label="Correct category" options={CATEGORY_OPTIONS} onPick={(v) => correct('category', v)} />
    );
  }
  if (openField === 'location') {
    return (
      <OptionPicker label="Correct location" options={LOCATION_OPTIONS} onPick={(v) => correct('location', v)} />
    );
  }
  if (openField === 'quantity') {
    return (
      <>
        <OptionPicker label="Correct unit" options={UNIT_OPTIONS} onPick={(v) => correct('unit', v)} />
        <ValueInput label="Correct quantity" type="number" onSet={(raw) => correct('quantity', Number(raw))} />
      </>
    );
  }
  if (openField === 'expiresAt') {
    return <ValueInput label="Correct expiry" type="date" onSet={(raw) => correct('expiresAt', raw)} />;
  }
  return null;
}

/**
 * Provenance-styled, tap-to-correct parse preview shared by the Kitchen and
 * Groceries quick-adds (spec 005 US2, FR-IQ-010..013).
 */
export function ParsePreview({
  items,
  onCorrect,
  onAcceptSuggestion,
  showLocation = true,
  showExpiry = true,
}: Props): React.JSX.Element | null {
  if (items.length === 0) return null;
  return (
    <div className="mt-3 flex flex-col gap-1.5">
      {items.map((item, idx) => (
        <PreviewRow
          key={`${item.name}-${idx}`}
          item={item}
          leadIn={idx === 0 ? "I'll add:" : 'and:'}
          showLocation={showLocation}
          showExpiry={showExpiry}
          onCorrect={onCorrect}
          onAcceptSuggestion={onAcceptSuggestion}
        />
      ))}
    </div>
  );
}
