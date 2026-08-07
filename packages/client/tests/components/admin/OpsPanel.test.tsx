import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpsPanel } from '../../../src/components/admin/OpsPanel';
import * as adminService from '../../../src/services/admin';

vi.mock('../../../src/services/admin');

const mockReadiness = vi.mocked(adminService.fetchReadiness);
const mockSettings = vi.mocked(adminService.fetchSettings);
const mockUsage = vi.mocked(adminService.fetchUsage);
const mockLimits = vi.mocked(adminService.fetchLimits);
const mockPatch = vi.mocked(adminService.patchSettings);
const mockFlush = vi.mocked(adminService.flushCache);
const mockResetLimit = vi.mocked(adminService.resetLimit);

const SETTINGS: adminService.RuntimeSettings = {
  'ai.enabled': true,
  'recipes.approvedDomains': ['recipetineats.com'],
  'limits.recommendationsPerMinute': 10,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockReadiness.mockResolvedValue({
    ready: true,
    version: '4.14.0',
    dependencies: [
      { name: 'mongodb', status: 'ok' },
      { name: 'meal-recommender', status: 'ok' },
    ],
  });
  mockSettings.mockResolvedValue(SETTINGS);
  mockUsage.mockResolvedValue([{ day: '2026-08-07', feature: 'recommendations', count: 12 }]);
  mockLimits.mockResolvedValue([{ key: 'recs:user-a', count: 9, resetsAt: Date.now() + 30_000 }]);
  mockPatch.mockResolvedValue({ ...SETTINGS, 'ai.enabled': false });
  mockFlush.mockResolvedValue('all');
  mockResetLimit.mockResolvedValue(true);
});

describe('OpsPanel — operational visibility (spec 011 US4)', () => {
  it('names each dependency rather than reporting one opaque bit (SC-AD-005)', async () => {
    render(<OpsPanel />);
    expect(await screen.findByTestId('dependency-mongodb')).toHaveTextContent('ok');
    expect(screen.getByTestId('dependency-meal-recommender')).toHaveTextContent('ok');
    expect(screen.getByTestId('readiness-overall')).toHaveTextContent('Ready');
  });

  it('shows a NOT-ready report as data, not as an error', async () => {
    // `/api/health/ready` answers 503 when a dependency is down. That is the state an
    // operator opens this panel to see — rendering it as "could not load" would hide
    // the one thing they came for.
    mockReadiness.mockResolvedValue({
      ready: false,
      version: '4.14.0',
      dependencies: [{ name: 'mongodb', status: 'down' }],
    });
    render(<OpsPanel />);
    expect(await screen.findByTestId('readiness-overall')).toHaveTextContent('Not ready');
    expect(screen.getByTestId('dependency-mongodb')).toHaveTextContent('down');
    expect(screen.queryByText(/could not load/i)).not.toBeInTheDocument();
  });

  it('reports model usage', async () => {
    render(<OpsPanel />);
    expect(await screen.findByText(/recommendations/)).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });
});

describe('OpsPanel — the AI kill switch (FR-AD-026)', () => {
  it('pulls the switch through the API and follows the SERVER’s answer', async () => {
    render(<OpsPanel />);
    expect(await screen.findByTestId('ai-state')).toHaveTextContent('Enabled');

    await userEvent.click(screen.getByRole('button', { name: 'Disable AI' }));

    await waitFor(() => expect(screen.getByTestId('ai-state')).toHaveTextContent('Disabled'));
    expect(mockPatch).toHaveBeenCalledWith({ 'ai.enabled': false });
  });

  it('does not claim success when the server refuses', async () => {
    mockPatch.mockRejectedValue(new Error('403'));
    render(<OpsPanel />);
    await screen.findByTestId('ai-state');

    await userEvent.click(screen.getByRole('button', { name: 'Disable AI' }));

    expect(await screen.findByText(/could not change the ai kill switch/i)).toBeInTheDocument();
    // The label must still reflect reality — AI is still ON.
    expect(screen.getByTestId('ai-state')).toHaveTextContent('Enabled');
  });
});

describe('OpsPanel — cache and limits (FR-AD-028/029)', () => {
  it('flushes cached AI results', async () => {
    render(<OpsPanel />);
    await userEvent.click(await screen.findByRole('button', { name: /flush cached/i }));
    expect(mockFlush).toHaveBeenCalled();
    expect(await screen.findByText(/flushed/i)).toBeInTheDocument();
  });

  it('releases a bucket and reloads, so the list cannot show a stale count', async () => {
    render(<OpsPanel />);
    await userEvent.click(await screen.findByRole('button', { name: 'Reset' }));
    expect(mockResetLimit).toHaveBeenCalledWith('recs:user-a');
    await waitFor(() => expect(mockLimits).toHaveBeenCalledTimes(2));
  });

  it('surfaces a load failure once, without pretending it has data', async () => {
    mockReadiness.mockRejectedValue(new Error('boom'));
    render(<OpsPanel />);
    expect(await screen.findByText(/could not load operational status/i)).toBeInTheDocument();
  });
});
