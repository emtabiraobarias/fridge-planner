import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AccountsPanel } from '../../../src/components/admin/AccountsPanel';
import * as adminService from '../../../src/services/admin';

vi.mock('../../../src/services/admin');

const mockExport = vi.mocked(adminService.exportUser);
const mockErase = vi.mocked(adminService.eraseUser);
const mockRestore = vi.mocked(adminService.restoreUser);
const mockPurge = vi.mocked(adminService.purgeExpired);

beforeEach(() => {
  vi.clearAllMocks();
  mockExport.mockResolvedValue({
    userId: 'user-a',
    exportedAt: '2026-08-07T00:00:00.000Z',
    collections: ['InventoryItem', 'MealPlan'],
    data: { InventoryItem: [{ name: 'Leek' }] },
  });
  mockErase.mockResolvedValue({
    userId: 'user-a',
    erasedAt: '2026-08-07T00:00:00.000Z',
    purgeAfter: '2026-09-06T00:00:00.000Z',
    recoverableForDays: 30,
  });
  mockRestore.mockResolvedValue({ userId: 'user-a', restoredAt: '2026-08-08T00:00:00.000Z' });
  mockPurge.mockResolvedValue({ purged: [], count: 0 });
});

describe('AccountsPanel — erasure is confirmed, never accidental (FR-AD-018)', () => {
  it('opening the confirmation does NOT erase', async () => {
    // The whole point of the two-step: the first click must be inert. If it ever
    // erases, the account is gone before the maintainer reads what erasure means.
    render(<AccountsPanel initialUserId="user-a" />);
    await userEvent.click(screen.getByRole('button', { name: 'Erase…' }));

    expect(screen.getByRole('alertdialog', { name: 'Confirm erase' })).toBeInTheDocument();
    expect(mockErase).not.toHaveBeenCalled();
  });

  it('cancelling leaves the account alone', async () => {
    render(<AccountsPanel initialUserId="user-a" />);
    await userEvent.click(screen.getByRole('button', { name: 'Erase…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(mockErase).not.toHaveBeenCalled();
  });

  it('confirming erases and states how long it stays recoverable (FR-AD-019)', async () => {
    render(<AccountsPanel initialUserId="user-a" />);
    await userEvent.click(screen.getByRole('button', { name: 'Erase…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, erase' }));

    expect(mockErase).toHaveBeenCalledWith('user-a');
    // Saying only "erased" would imply finality the system does not have for 30 days.
    expect(await screen.findByTestId('accounts-notice')).toHaveTextContent(
      /recoverable for 30 days/i,
    );
  });

  it('editing the user id closes an open confirmation', async () => {
    // Otherwise the dialog says one name while the field holds another, and confirming
    // erases whoever is in the field.
    render(<AccountsPanel initialUserId="user-a" />);
    await userEvent.click(screen.getByRole('button', { name: 'Erase…' }));
    await userEvent.type(screen.getByLabelText('User ID'), 'x');

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

describe('AccountsPanel — export, restore, purge', () => {
  it('exports and shows what came back', async () => {
    render(<AccountsPanel initialUserId="user-a" />);
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));

    expect(mockExport).toHaveBeenCalledWith('user-a');
    expect(await screen.findByText(/exported 2 collections/i)).toBeInTheDocument();
  });

  it('restores an account inside the window', async () => {
    render(<AccountsPanel initialUserId="user-a" />);
    await userEvent.click(screen.getByRole('button', { name: 'Restore' }));

    expect(mockRestore).toHaveBeenCalledWith('user-a');
    expect(await screen.findByText(/user-a restored/i)).toBeInTheDocument();
  });

  it('says plainly when a purge sweep had nothing to do', async () => {
    render(<AccountsPanel />);
    await userEvent.click(screen.getByRole('button', { name: /purge sweep/i }));

    expect(await screen.findByText(/no erasures were due/i)).toBeInTheDocument();
  });

  it('requires a user id before any per-account action is available', async () => {
    render(<AccountsPanel />);
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Restore' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Erase…' })).toBeDisabled();
  });

  it('reports a refusal instead of implying the action succeeded', async () => {
    mockRestore.mockRejectedValue(new Error('410'));
    render(<AccountsPanel initialUserId="user-a" />);
    await userEvent.click(screen.getByRole('button', { name: 'Restore' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/refused/i);
  });
});
