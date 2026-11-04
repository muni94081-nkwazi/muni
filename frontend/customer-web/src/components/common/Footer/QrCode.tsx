import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { logger } from '@/utils/logger';

export interface QrCodeProps {
  /** The URL the code encodes. */
  value: string;
  size?: number;
  /** Describes the destination for screen readers. */
  label: string;
}

/**
 * A real, scannable QR code.
 *
 * Rendered with the `qrcode` package rather than hand-rolled: a subtly wrong
 * encoder produces a code that silently fails to scan, which is worse than no
 * code at all. Error-correction level M is the usual choice for a screen —
 * enough redundancy to survive a phone camera at an angle without inflating
 * the module count.
 *
 * Output is an inline SVG data URI, so it scales cleanly and needs no network
 * request. If generation throws, nothing is rendered — the caller shows the
 * store links, which are the real download path anyway.
 */
export function QrCode({ value, size = 160, label }: QrCodeProps) {
  const [dataUri, setDataUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    QRCode.toDataURL(value, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: size,
      color: { dark: '#000000ff', light: '#ffffffff' },
    })
      .then((uri) => {
        if (!cancelled) setDataUri(uri);
      })
      .catch((error: unknown) => {
        logger.warn('QR code generation failed', error);
        if (!cancelled) setDataUri(null);
      });

    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!dataUri) return null;

  return <img src={dataUri} width={size} height={size} alt={label} />;
}
