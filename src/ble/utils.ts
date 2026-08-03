// Pure decoding for the Heart Rate Measurement characteristic (0x2A37).
// No native imports — this file runs in the `unit` Jest project.
//
// Packet layout (Bluetooth SIG Heart Rate Service, §3.1):
//
//   byte 0      flags
//                 bit 0  value format:  0 = uint8, 1 = uint16 little-endian
//                 bit 1  sensor contact status
//                 bit 2  sensor contact supported
//                 bit 3  energy expended present
//                 bit 4  RR-interval present
//   byte 1..    heart rate value, width per bit 0
//   ...         energy expended / RR intervals, which we do not consume
//
// See implementation.md §11 item 5 and prompt.md's parsing specification.

import { MAX_PLAUSIBLE_BPM } from '@/constants/ble';

const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Decode a base64 string to bytes.
 *
 * Hand-rolled rather than using `atob`/`Buffer` so the same code path runs
 * under Hermes and under Node in tests, with no polyfill and no assumption
 * about which globals the runtime happens to expose. ble-plx hands characteristic
 * values over as base64, so this is on the hot path for every notification.
 *
 * Returns an empty array for malformed input rather than throwing — a garbled
 * packet should drop a reading, not crash the session.
 */
export function decodeBase64(input: string): Uint8Array {
  const clean = input.replace(/[^A-Za-z0-9+/]/g, '');
  if (clean.length === 0) return new Uint8Array(0);

  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const char of clean) {
    const value = BASE64_ALPHABET.indexOf(char);
    if (value === -1) return new Uint8Array(0);
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }

  return new Uint8Array(bytes);
}

/**
 * Extract the BPM from a decoded Heart Rate Measurement packet.
 *
 * Returns null when the packet cannot yield a trustworthy value: empty,
 * truncated for its declared format, or an implausible reading.
 */
export function parseHeartRateMeasurement(bytes: Uint8Array): number | null {
  // Need at least a flags byte plus one byte of payload.
  if (bytes.length < 2) return null;

  const is16Bit = (bytes[0] & 0x01) === 1;

  if (is16Bit) {
    // A 16-bit packet needs both payload bytes; a truncated one is not
    // silently downgraded to 8-bit, because that would report the low byte
    // of a large value as a plausible-looking heart rate.
    if (bytes.length < 3) return null;
    const value = bytes[1] | (bytes[2] << 8); // little-endian
    return isPlausible(value) ? value : null;
  }

  const value = bytes[1];
  return isPlausible(value) ? value : null;
}

/**
 * Decode a base64 characteristic value straight to a BPM. The composition
 * used by `BleManager`; returns null on any unusable input.
 */
export function parseHeartRateValue(base64Value: string | null): number | null {
  if (base64Value === null) return null;
  return parseHeartRateMeasurement(decodeBase64(base64Value));
}

/**
 * A reading of 0 means "no contact / no reading" rather than a real heart rate,
 * so it is rejected alongside out-of-range values.
 */
function isPlausible(bpm: number): boolean {
  return bpm > 0 && bpm <= MAX_PLAUSIBLE_BPM;
}
