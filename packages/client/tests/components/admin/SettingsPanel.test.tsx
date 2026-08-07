import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsPanel } from '../../../src/components/admin/SettingsPanel';
import * as adminService from '../../../src/services/admin';

vi.mock('../../../src/services/admin');

const mockFetch = vi.mocked(adminService.fetchSettings);
const mockPatch = vi.mocked(adminService.patchSettings);

const DEFAULTS: adminService.RuntimeSettings = {
  'ai.enabled': true,
  'recipes.approvedDomains': ['panlasangpinoy.com', 'recipetineats.com'],
  'limits.recommendationsPerMinute': 10,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue(DEFAULTS);
  mockPatch.mockResolvedValue({ ...DEFAULTS, 'limits.recommendationsPerMinute': 7 });
});

describe('SettingsPanel — runtime-adjustable content (spec 011 US7, FR-AD-030)', () => {
  it('shows the effective values, which with no overrides are the code defaults', async () => {
    render(<SettingsPanel />);
    expect(await screen.findByLabelText(/recommendations per minute/i)).toHaveValue('10');
    expect(screen.getByLabelText(/approved recipe domains/i)).toHaveValue(
      'panlasangpinoy.com\nrecipetineats.com',
    );
  });

  it('saves the edited values as an override', async () => {
    render(<SettingsPanel />);
    const limit = await screen.findByLabelText(/recommendations per minute/i);
    await userEvent.clear(limit);
    await userEvent.type(limit, '7');
    await userEvent.click(screen.getByRole('button', { name: /save settings/i }));

    expect(mockPatch).toHaveBeenCalledWith({
      'recipes.approvedDomains': ['panlasangpinoy.com', 'recipetineats.com'],
      'limits.recommendationsPerMinute': 7,
    });
    expect(await screen.findByRole('status')).toHaveTextContent(/no restart/i);
  });

  it('drops blank lines from the domain list rather than sending empty entries', async () => {
    render(<SettingsPanel />);
    const domains = await screen.findByLabelText(/approved recipe domains/i);
    await userEvent.clear(domains);
    await userEvent.type(domains, 'a.com\n\n  b.com  \n');
    await userEvent.click(screen.getByRole('button', { name: /save settings/i }));

    expect(mockPatch).toHaveBeenCalledWith(
      expect.objectContaining({ 'recipes.approvedDomains': ['a.com', 'b.com'] }),
    );
  });

  it('refuses a non-numeric limit locally, without touching the server', async () => {
    render(<SettingsPanel />);
    const limit = await screen.findByLabelText(/recommendations per minute/i);
    await userEvent.clear(limit);
    await userEvent.type(limit, 'ten');
    await userEvent.click(screen.getByRole('button', { name: /save settings/i }));

    expect(mockPatch).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(/must be a number/i);
  });

  it('says the previous values are still in force when the server rejects', async () => {
    // The API validates every key before writing, so a rejection changed NOTHING.
    // Telling the user "failed" without that would leave them unsure what is live.
    mockPatch.mockRejectedValue(new Error('400'));
    render(<SettingsPanel />);
    await screen.findByLabelText(/recommendations per minute/i);
    await userEvent.click(screen.getByRole('button', { name: /save settings/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /previous values are still in force/i,
    );
  });
});
