// Bluetooth SIG assigned numbers for the Heart Rate Service.
// https://www.bluetooth.com/specifications/assigned-numbers/

/** Heart Rate Service. Scans are filtered on this. */
export const HEART_RATE_SERVICE_UUID = '0000180d-0000-1000-8000-00805f9b34fb';

/** Heart Rate Measurement characteristic — the notifying stream. */
export const HEART_RATE_MEASUREMENT_UUID = '00002a37-0000-1000-8000-00805f9b34fb';

/**
 * Upper bound for a plausible reading. The 16-bit packet format can encode up
 * to 65535, so a corrupt or misparsed packet shows up as an absurd number;
 * anything above this is dropped rather than rendered.
 */
export const MAX_PLAUSIBLE_BPM = 300;

/** How long a scan runs before stopping itself, in ms. */
export const SCAN_TIMEOUT_MS = 15_000;
