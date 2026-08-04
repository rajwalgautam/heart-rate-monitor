// Regression coverage for the connect/subscribe flow (issue #2).
//
// The previous implementation connected twice — once in `connectToDevice`,
// which discovered services, and again inside `subscribeHeartRate`, which
// monitored on a fresh Device that had never run discovery. On hardware that
// surfaced as `Service 0000180d-... for device ? not found`. These specs pin
// the invariants that make that impossible, against a mock that now enforces
// ble-plx's real preconditions.

import {
  connectToDevice,
  subscribeHeartRate,
  disconnect,
  onDisconnected,
  __resetManager,
} from '@/ble/BleManager';
// Imported by concrete path, not the package name: ts-jest typechecks against
// the real library's declarations, which have no `__bleMock`. Both specifiers
// resolve to this same file through moduleNameMapper, so it is the same
// instance BleManager sees.
import { __bleMock } from '@/__mocks__/react-native-ble-plx';
import { HEART_RATE_SERVICE_UUID } from '@/constants/ble';

/** A 8-bit Heart Rate Measurement packet reading `bpm`. */
function packet(bpm: number): string {
  return Buffer.from(Uint8Array.from([0x00, bpm])).toString('base64');
}

beforeEach(() => {
  __bleMock.reset();
  __resetManager();
});

describe('connectToDevice', () => {
  it('connects exactly once and discovers services', async () => {
    const device = await connectToDevice('device-1');

    expect(__bleMock.connectCount).toBe(1);
    expect(device.id).toBe('device-1');
  });

  it('rejects a peripheral that connects without exposing the Heart Rate Service', async () => {
    // Advertises 0x180D (so the scan matched) but does not serve it — the
    // wearable "broadcast mode off" case.
    __bleMock.services = ['0000180a-0000-1000-8000-00805f9b34fb'];

    await expect(connectToDevice('device-1')).rejects.toThrow(
      /not exposing the Heart Rate Service/i,
    );
  });

  it('names the likely cause rather than surfacing a raw ble-plx error', async () => {
    __bleMock.services = [];
    await expect(connectToDevice('device-1')).rejects.toThrow(/broadcast heart rate/i);
  });

  it('matches the service UUID case-insensitively', async () => {
    __bleMock.services = [HEART_RATE_SERVICE_UUID.toUpperCase()];
    await expect(connectToDevice('device-1')).resolves.toBeDefined();
  });
});

describe('subscribeHeartRate', () => {
  it('does not open a second connection', async () => {
    await connectToDevice('device-1');
    expect(__bleMock.connectCount).toBe(1);

    subscribeHeartRate(() => undefined);

    // The regression: this was 2, and the second connection's Device had no
    // discovery, so the monitor threw ServiceNotFound.
    expect(__bleMock.connectCount).toBe(1);
  });

  it('monitors the discovered instance and decodes readings', async () => {
    await connectToDevice('device-1');
    const readings: number[] = [];
    subscribeHeartRate((bpm) => readings.push(bpm));

    __bleMock.emitReading(packet(72));
    __bleMock.emitReading(packet(75));

    expect(readings).toEqual([72, 75]);
  });

  it('reports an actionable error when nothing is connected', () => {
    const onError = jest.fn();
    subscribeHeartRate(() => undefined, onError);

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Not connected to a device.' }),
    );
  });

  it('returns a disposer that is safe to call when subscription failed', () => {
    const dispose = subscribeHeartRate(() => undefined, jest.fn());
    expect(() => {
      dispose();
      dispose();
    }).not.toThrow();
  });

  it('drops unparseable packets instead of erroring', async () => {
    await connectToDevice('device-1');
    const onReading = jest.fn();
    const onError = jest.fn();
    subscribeHeartRate(onReading, onError);

    // A 16-bit packet truncated to one payload byte — the realistic garbled
    // frame. An empty value covers the dropped-notification case. Neither may
    // reach onReading, and neither is worth flickering the UI into an error.
    __bleMock.emitReading(Buffer.from(Uint8Array.from([0x01, 0x2c])).toString('base64'));
    __bleMock.emitReading('');

    expect(onReading).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('surfaces stream errors from the characteristic monitor', async () => {
    await connectToDevice('device-1');
    const onError = jest.fn();
    subscribeHeartRate(() => undefined, onError);

    __bleMock.emitError(new Error('GATT failure'));

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'GATT failure' }),
    );
  });

  it('stops delivering readings after the disposer runs', async () => {
    await connectToDevice('device-1');
    const onReading = jest.fn();
    const dispose = subscribeHeartRate(onReading);

    dispose();
    __bleMock.emitReading(packet(72));

    expect(onReading).not.toHaveBeenCalled();
  });

  it('is idempotent on repeated disposal', async () => {
    await connectToDevice('device-1');
    const dispose = subscribeHeartRate(() => undefined);
    expect(() => {
      dispose();
      dispose();
    }).not.toThrow();
  });
});

describe('connection teardown', () => {
  it('releases the retained device on disconnect', async () => {
    await connectToDevice('device-1');
    await disconnect('device-1');

    const onError = jest.fn();
    subscribeHeartRate(() => undefined, onError);

    // Subscribing after a disconnect must not silently monitor a dead handle.
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Not connected to a device.' }),
    );
    expect(__bleMock.cancelledConnections).toContain('device-1');
  });

  it('releases the retained device when the peripheral drops out', async () => {
    await connectToDevice('device-1');
    const onDrop = jest.fn();
    onDisconnected('device-1', onDrop);

    __bleMock.disconnectListener?.(null, null);
    expect(onDrop).toHaveBeenCalled();

    const onError = jest.fn();
    subscribeHeartRate(() => undefined, onError);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Not connected to a device.' }),
    );
  });

  it('disconnect tolerates a failing cancel', async () => {
    await connectToDevice('device-1');
    await expect(disconnect('unknown-device')).resolves.toBeUndefined();
  });
});
