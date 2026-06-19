import { describe, expect, it } from 'vitest';

import { renderWithProviders, screen } from '@/test/helpers/render';

import { ConfidenceMeter } from './ConfidenceMeter';

describe('ConfidenceMeter', () => {
  it('reflects the engine confidence value', () => {
    renderWithProviders(<ConfidenceMeter value={42} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
  });

  it('updates and pops a positive delta after a round', async () => {
    const { rerender } = renderWithProviders(<ConfidenceMeter value={42} />);
    rerender(<ConfidenceMeter value={58} />);

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '58');
    expect(await screen.findByText('+16%')).toBeInTheDocument();
  });
});
