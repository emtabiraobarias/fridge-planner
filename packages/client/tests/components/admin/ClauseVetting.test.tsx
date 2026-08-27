import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClauseVetting } from '../../../src/components/admin/ClauseVetting';

vi.mock('../../../src/services/lifecycle', () => ({
  fetchClauses: vi.fn(),
  draftClauses: vi.fn(),
  vetClause: vi.fn(),
}));

import { fetchClauses, draftClauses, vetClause } from '../../../src/services/lifecycle';

const mockFetch = vi.mocked(fetchClauses);
const mockDraft = vi.mocked(draftClauses);
const mockVet = vi.mocked(vetClause);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function clause(over: Record<string, unknown> = {}): any {
  return {
    provisionalId: 'C-01',
    text: 'When a grocery row is checked off, the system shall not duplicate it.',
    derivedFrom: 'rows duplicate after checkout',
    inferred: false,
    vetted: 'pending',
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue([clause()]);
  mockVet.mockResolvedValue([clause({ vetted: 'accepted' })]);
  mockDraft.mockResolvedValue([clause()]);
});

describe('ClauseVetting — the comparison IS the step (FR-FL-025)', () => {
  it('shows each clause beside the record text it came from', async () => {
    render(<ClauseVetting itemId="i1" />);
    expect(await screen.findByText(/shall not duplicate it/)).toBeInTheDocument();
    // A clause with nothing to compare against degrades into a proofread, and well-formed
    // EARS is easy to accept uncritically.
    expect(screen.getByText(/rows duplicate after checkout/)).toBeInTheDocument();
  });

  it('marks anything the agent inferred (FR-FL-026)', async () => {
    mockFetch.mockResolvedValue([clause({ inferred: true })]);
    render(<ClauseVetting itemId="i1" />);
    expect(await screen.findByText(/inferred/i)).toBeInTheDocument();
  });

  it('says how many are still to vet, and when it can go to spec (FR-FL-028)', async () => {
    render(<ClauseVetting itemId="i1" />);
    expect(await screen.findByText(/1 still to vet/i)).toBeInTheDocument();

    mockFetch.mockResolvedValue([clause({ vetted: 'accepted' })]);
    render(<ClauseVetting itemId="i2" />);
    expect(await screen.findByText(/can go to spec/i)).toBeInTheDocument();
  });
});

/**
 * FR-FL-029 is accept / EDIT / reject. The edit was the missing third: `vetClause` has always
 * taken `editedText` and the list has always rendered it, but nothing could set it — so a
 * clause that was nearly right could only be accepted as-is or thrown away.
 */
describe('ClauseVetting — editing a clause (FR-FL-029)', () => {
  it('offers Edit beside Accept and Reject', async () => {
    render(<ClauseVetting itemId="i1" />);
    await screen.findByText(/shall not duplicate it/);
    for (const name of [/^accept$/i, /^edit$/i, /^reject$/i]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('seeds the editor with the clause as it stands', async () => {
    render(<ClauseVetting itemId="i1" />);
    await screen.findByText(/shall not duplicate it/);
    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }));

    expect(screen.getByLabelText(/edit clause C-01/i)).toHaveValue(
      'When a grocery row is checked off, the system shall not duplicate it.',
    );
  });

  it('saves the edited wording as an acceptance', async () => {
    render(<ClauseVetting itemId="i1" />);
    await screen.findByText(/shall not duplicate it/);
    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }));

    const box = screen.getByLabelText(/edit clause C-01/i);
    await userEvent.clear(box);
    await userEvent.type(box, 'When a grocery row is checked off, the system shall collapse duplicates.');
    await userEvent.click(screen.getByRole('button', { name: /save and accept/i }));

    await waitFor(() =>
      expect(mockVet).toHaveBeenCalledWith(
        'i1',
        'C-01',
        'accepted',
        'When a grocery row is checked off, the system shall collapse duplicates.',
      ),
    );
  });

  it('keeps the source text visible while editing', async () => {
    render(<ClauseVetting itemId="i1" />);
    await screen.findByText(/shall not duplicate it/);
    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    // The source is what the wording is being corrected AGAINST — hiding it would turn
    // vetting back into a proofread.
    expect(screen.getByText(/rows duplicate after checkout/)).toBeInTheDocument();
  });

  it('cancels without vetting anything', async () => {
    render(<ClauseVetting itemId="i1" />);
    await screen.findByText(/shall not duplicate it/);
    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(mockVet).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/edit clause C-01/i)).not.toBeInTheDocument();
  });

  it('will not save an empty clause', async () => {
    render(<ClauseVetting itemId="i1" />);
    await screen.findByText(/shall not duplicate it/);
    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    await userEvent.clear(screen.getByLabelText(/edit clause C-01/i));

    expect(screen.getByRole('button', { name: /save and accept/i })).toBeDisabled();
  });

  it('offers no controls on a clause already vetted', async () => {
    mockFetch.mockResolvedValue([clause({ vetted: 'rejected' })]);
    render(<ClauseVetting itemId="i1" />);
    await screen.findByText(/shall not duplicate it/);
    const row = within(screen.getByLabelText('Clause vetting'));
    expect(row.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
    expect(row.getByTestId('clause-C-01')).toHaveTextContent('rejected');
  });
});

describe('ClauseVetting — drafting is an assist, never a precondition (FR-FL-031)', () => {
  it('says so plainly when the agent returns nothing', async () => {
    mockDraft.mockResolvedValue([]);
    render(<ClauseVetting itemId="i1" />);
    await screen.findByText(/shall not duplicate it/);
    await userEvent.click(screen.getByRole('button', { name: /draft from the report/i }));
    // An empty list that just looks like a failure is what this avoids.
    expect(await screen.findByRole('alert')).toHaveTextContent(/write them by hand/i);
  });

  it('never presents a failed load as "no clauses"', async () => {
    mockFetch.mockRejectedValue(new Error('offline'));
    render(<ClauseVetting itemId="i1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load/i);
  });
});
