import { describe, expect, it } from 'vitest';

import { renderWithProviders, screen } from '@/test/helpers/render';

import { ProgressMeter } from './ProgressMeter';

describe('ProgressMeter', () => {
  it('renders the given percentage', () => {
    renderWithProviders(<ProgressMeter value={42} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
  });

  it('clamps values above 100', () => {
    renderWithProviders(<ProgressMeter value={150} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });

  it('clamps values below 0', () => {
    renderWithProviders(<ProgressMeter value={-20} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });
});
