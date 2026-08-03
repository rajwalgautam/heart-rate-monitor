import {
  formatBaselineDelta,
  formatDuration,
  formatRelativeTime,
} from '@/utils/format';
import { baseVersion, isNewerVersion } from '@/utils/versionCompare';

describe('formatDuration', () => {
  it('formats under a minute', () => {
    expect(formatDuration(5_000)).toBe('0:05');
  });

  it('zero-pads seconds', () => {
    expect(formatDuration(65_000)).toBe('1:05');
  });

  it('switches to H:MM:SS past an hour', () => {
    expect(formatDuration(3_661_000)).toBe('1:01:01');
  });

  it('clamps negative input to zero', () => {
    expect(formatDuration(-5_000)).toBe('0:00');
  });
});

describe('formatRelativeTime', () => {
  const NOW = Date.parse('2026-08-02T12:00:00.000Z');

  it('reports never for a null timestamp', () => {
    expect(formatRelativeTime(null, NOW)).toBe('Never');
  });

  it('reports just now under a minute', () => {
    expect(formatRelativeTime(NOW - 30_000, NOW)).toBe('Just now');
  });

  it('singularizes one minute', () => {
    expect(formatRelativeTime(NOW - 60_000, NOW)).toBe('1 min ago');
  });

  it('reports minutes under an hour', () => {
    expect(formatRelativeTime(NOW - 25 * 60_000, NOW)).toBe('25 min ago');
  });

  it('reports hours', () => {
    expect(formatRelativeTime(NOW - 3 * 3_600_000, NOW)).toBe('3 hours ago');
  });

  it('reports days', () => {
    expect(formatRelativeTime(NOW - 50 * 3_600_000, NOW)).toBe('2 days ago');
  });

  it('treats a future timestamp as just now rather than negative', () => {
    expect(formatRelativeTime(NOW + 60_000, NOW)).toBe('Just now');
  });
});

describe('formatBaselineDelta', () => {
  it('shows a positive delta', () => {
    expect(formatBaselineDelta(90, 72)).toBe('+18 vs baseline');
  });

  it('shows a negative delta', () => {
    expect(formatBaselineDelta(60, 72)).toBe('−12 vs baseline');
  });

  it('names the equal case', () => {
    expect(formatBaselineDelta(72, 72)).toBe('At baseline');
  });

  it('returns null when either side is unknown', () => {
    expect(formatBaselineDelta(null, 72)).toBeNull();
    expect(formatBaselineDelta(90, null)).toBeNull();
  });
});

describe('versionCompare', () => {
  it('ranks a higher patch as newer', () => {
    expect(isNewerVersion('1.2.4', '1.2.3')).toBe(true);
  });

  it('ranks a build suffix above the base version', () => {
    expect(isNewerVersion('1.2.3-1751999999', '1.2.3')).toBe(true);
  });

  it('is false for the same version', () => {
    expect(isNewerVersion('1.2.3', '1.2.3')).toBe(false);
  });

  it('tolerates a leading v', () => {
    expect(isNewerVersion('v1.3.0', '1.2.9')).toBe(true);
  });

  it('strips the build suffix for changelog lookup', () => {
    expect(baseVersion('v1.5.3-1751999999')).toBe('1.5.3');
    expect(baseVersion('v1.5.3-rerelease')).toBe('1.5.3');
  });
});
