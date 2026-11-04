import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QrCode } from '@/components/common/Footer/QrCode';
import { AppDownload } from '@/components/common/Footer/AppDownload';

describe('QrCode', () => {
  it('renders a real scannable PNG data URI for the configured URL', async () => {
    render(<QrCode value="https://muni.ug/app" label="QR code to the MUNI app" />);
    const img = await screen.findByAltText('QR code to the MUNI app');
    expect(img.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
    // A real encoded matrix is substantial; a stub would be a few bytes.
    expect((img.getAttribute('src') ?? '').length).toBeGreaterThan(500);
  });
});

describe('AppDownload', () => {
  it('renders nothing while no store link is configured', () => {
    const { container } = render(<AppDownload links={[]} qrTarget={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders store links and a QR code once real URLs are configured', async () => {
    render(
      <AppDownload
        links={[
          { id: 'ios', label: 'App Store', platform: 'ios', url: 'https://apps.apple.com/app/id123' },
          { id: 'and', label: 'Google Play', platform: 'android', url: 'https://play.google.com/store/apps/details?id=ug.muni.app' },
        ]}
        qrTarget="https://muni.ug/app"
      />,
    );

    expect(screen.getByRole('link', { name: /App Store/ })).toHaveAttribute('href', 'https://apps.apple.com/app/id123');
    expect(screen.getByRole('link', { name: /Google Play/ })).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: /Google Play/ })).toHaveAttribute('rel', 'noopener noreferrer');
    await waitFor(() => expect(screen.getByAltText(/QR code linking to https:\/\/muni\.ug\/app/)).toBeInTheDocument());
  });
});
