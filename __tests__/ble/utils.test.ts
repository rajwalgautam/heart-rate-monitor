import {
  decodeBase64,
  parseHeartRateMeasurement,
  parseHeartRateValue,
} from '@/ble/utils';

/** Build a base64 string from raw bytes, mirroring what ble-plx delivers. */
function toBase64(bytes: number[]): string {
  return Buffer.from(Uint8Array.from(bytes)).toString('base64');
}

describe('decodeBase64', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = [0x00, 0x01, 0x40, 0x7f, 0x80, 0xff];
    expect(Array.from(decodeBase64(toBase64(bytes)))).toEqual(bytes);
  });

  it('handles each padding length', () => {
    expect(Array.from(decodeBase64(toBase64([0x41])))).toEqual([0x41]);
    expect(Array.from(decodeBase64(toBase64([0x41, 0x42])))).toEqual([0x41, 0x42]);
    expect(Array.from(decodeBase64(toBase64([0x41, 0x42, 0x43])))).toEqual([
      0x41, 0x42, 0x43,
    ]);
  });

  it('returns empty for an empty string', () => {
    expect(decodeBase64('')).toHaveLength(0);
  });

  it('returns empty rather than throwing on malformed input', () => {
    expect(decodeBase64('!!!!')).toHaveLength(0);
  });
});

describe('parseHeartRateMeasurement', () => {
  it('parses an 8-bit packet (flags bit 0 clear)', () => {
    expect(parseHeartRateMeasurement(Uint8Array.from([0x00, 72]))).toBe(72);
  });

  it('parses a 16-bit little-endian packet (flags bit 0 set)', () => {
    // 300 = 0x012C -> low byte 0x2C, high byte 0x01
    expect(parseHeartRateMeasurement(Uint8Array.from([0x01, 0x2c, 0x01]))).toBe(300);
  });

  it('reads the 16-bit payload little-endian, not big-endian', () => {
    // Payload bytes 0x02, 0x01. Little-endian reads 0x0102 = 258; a big-endian
    // misread would give 0x0201 = 513. Guards against a byte-order flip.
    expect(parseHeartRateMeasurement(Uint8Array.from([0x01, 0x02, 0x01]))).toBe(258);
  });

  it('handles the 255 BPM boundary in both formats', () => {
    expect(parseHeartRateMeasurement(Uint8Array.from([0x00, 0xff]))).toBe(255);
    expect(parseHeartRateMeasurement(Uint8Array.from([0x01, 0xff, 0x00]))).toBe(255);
    // 256 is only expressible in the 16-bit format.
    expect(parseHeartRateMeasurement(Uint8Array.from([0x01, 0x00, 0x01]))).toBe(256);
  });

  it('ignores the non-format flag bits', () => {
    // bits 1-4 set (sensor contact, energy expended, RR present), format bit clear
    expect(parseHeartRateMeasurement(Uint8Array.from([0x1e, 65, 0xaa, 0xbb]))).toBe(65);
  });

  it('returns null for an empty buffer', () => {
    expect(parseHeartRateMeasurement(new Uint8Array(0))).toBeNull();
  });

  it('returns null for a flags-only buffer', () => {
    expect(parseHeartRateMeasurement(Uint8Array.from([0x00]))).toBeNull();
  });

  it('returns null for a 16-bit packet truncated to one payload byte', () => {
    // Must not silently fall back to reading the low byte as an 8-bit value.
    expect(parseHeartRateMeasurement(Uint8Array.from([0x01, 0x2c]))).toBeNull();
  });

  it('rejects a zero reading as "no contact"', () => {
    expect(parseHeartRateMeasurement(Uint8Array.from([0x00, 0x00]))).toBeNull();
  });

  it('rejects an implausibly high 16-bit value', () => {
    // 0xFFFF = 65535
    expect(parseHeartRateMeasurement(Uint8Array.from([0x01, 0xff, 0xff]))).toBeNull();
  });
});

describe('parseHeartRateValue', () => {
  it('decodes a base64 8-bit packet end to end', () => {
    expect(parseHeartRateValue(toBase64([0x00, 88]))).toBe(88);
  });

  it('decodes a base64 16-bit packet end to end', () => {
    expect(parseHeartRateValue(toBase64([0x01, 0x2c, 0x01]))).toBe(300);
  });

  it('returns null for a null characteristic value', () => {
    expect(parseHeartRateValue(null)).toBeNull();
  });

  it('returns null for an empty characteristic value', () => {
    expect(parseHeartRateValue('')).toBeNull();
  });
});
