import {
  useHeartRateStore,
  __resetHeartRateModuleState,
} from '@/store/useHeartRateStore';

jest.mock('@/ble/BleManager', () => ({
  requestPermissions: jest.fn(),
  isBluetoothReady: jest.fn(),
  scanForDevices: jest.fn(),
  connectToDevice: jest.fn(),
  subscribeHeartRate: jest.fn(),
  disconnect: jest.fn(),
  onDisconnected: jest.fn(),
}));

jest.mock('@/db/queries', () => ({
  createSession: jest.fn(),
  finalizeSession: jest.fn(),
  insertReading: jest.fn(),
}));

import * as Ble from '@/ble/BleManager';
import { createSession, finalizeSession, insertReading } from '@/db/queries';

const mockBle = Ble as jest.Mocked<typeof Ble>;
const mockCreateSession = createSession as jest.MockedFunction<typeof createSession>;
const mockFinalize = finalizeSession as jest.MockedFunction<typeof finalizeSession>;
const mockInsertReading = insertReading as jest.MockedFunction<typeof insertReading>;

/** Captured callback from subscribeHeartRate, so specs can push readings. */
let emitReading: ((bpm: number) => void) | null = null;
let scanDispose: jest.Mock;
let readingDispose: jest.Mock;
let disconnectDispose: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  __resetHeartRateModuleState();
  useHeartRateStore.setState({
    connectionState: 'disconnected',
    connectedDevice: null,
    liveHeartRate: null,
    discoveredDevices: [],
    activeSession: null,
    error: null,
  });

  scanDispose = jest.fn();
  readingDispose = jest.fn();
  disconnectDispose = jest.fn();
  emitReading = null;

  mockBle.requestPermissions.mockResolvedValue(true);
  mockBle.isBluetoothReady.mockResolvedValue(true);
  mockBle.scanForDevices.mockImplementation(() => scanDispose);
  mockBle.connectToDevice.mockResolvedValue({
    id: 'device-1',
    name: 'Mock HRM',
    rssi: -50,
  });
  mockBle.subscribeHeartRate.mockImplementation((_id, onReading) => {
    emitReading = onReading;
    return readingDispose;
  });
  mockBle.onDisconnected.mockImplementation(() => disconnectDispose);
  mockBle.disconnect.mockResolvedValue(undefined);

  mockCreateSession.mockResolvedValue({
    id: 1,
    startTime: Date.now(),
    endTime: null,
    avgHr: null,
    maxHr: null,
    createdAt: Date.now(),
  });
  mockFinalize.mockResolvedValue(undefined);
  mockInsertReading.mockResolvedValue(undefined);
});

describe('scanning', () => {
  it('enters the scanning state and collects discovered devices', async () => {
    mockBle.scanForDevices.mockImplementation((onDevice) => {
      onDevice({ id: 'a', name: 'Strap A', rssi: -40 });
      onDevice({ id: 'b', name: 'Strap B', rssi: -60 });
      return scanDispose;
    });

    await useHeartRateStore.getState().startScan();

    expect(useHeartRateStore.getState().connectionState).toBe('scanning');
    expect(useHeartRateStore.getState().discoveredDevices).toHaveLength(2);
  });

  it('ignores a duplicate device id', async () => {
    mockBle.scanForDevices.mockImplementation((onDevice) => {
      onDevice({ id: 'a', name: 'Strap A', rssi: -40 });
      onDevice({ id: 'a', name: 'Strap A', rssi: -41 });
      return scanDispose;
    });

    await useHeartRateStore.getState().startScan();
    expect(useHeartRateStore.getState().discoveredDevices).toHaveLength(1);
  });

  it('does not scan when permission is denied', async () => {
    mockBle.requestPermissions.mockResolvedValue(false);
    await useHeartRateStore.getState().startScan();

    expect(mockBle.scanForDevices).not.toHaveBeenCalled();
    expect(useHeartRateStore.getState().connectionState).toBe('disconnected');
    expect(useHeartRateStore.getState().error).toMatch(/permission/i);
  });

  it('does not scan when the adapter is off', async () => {
    mockBle.isBluetoothReady.mockResolvedValue(false);
    await useHeartRateStore.getState().startScan();

    expect(mockBle.scanForDevices).not.toHaveBeenCalled();
    expect(useHeartRateStore.getState().error).toMatch(/bluetooth is off/i);
  });

  it('disposes the previous scan when startScan is called twice', async () => {
    await useHeartRateStore.getState().startScan();
    await useHeartRateStore.getState().startScan();

    expect(scanDispose).toHaveBeenCalled();
  });

  it('tolerates stopScan when no scan is running', () => {
    expect(() => {
      useHeartRateStore.getState().stopScan();
      useHeartRateStore.getState().stopScan();
    }).not.toThrow();
  });
});

describe('connecting', () => {
  it('stops the scan and reaches the connected state', async () => {
    await useHeartRateStore.getState().startScan();
    await useHeartRateStore.getState().connectToDevice('device-1');

    expect(scanDispose).toHaveBeenCalled();
    expect(useHeartRateStore.getState().connectionState).toBe('connected');
    expect(useHeartRateStore.getState().connectedDevice?.id).toBe('device-1');
  });

  it('records live readings from the subscription', async () => {
    await useHeartRateStore.getState().connectToDevice('device-1');
    emitReading?.(83);
    expect(useHeartRateStore.getState().liveHeartRate).toBe(83);
  });

  it('returns to disconnected when the connection fails', async () => {
    mockBle.connectToDevice.mockRejectedValue(new Error('out of range'));
    await useHeartRateStore.getState().connectToDevice('device-1');

    const state = useHeartRateStore.getState();
    expect(state.connectionState).toBe('disconnected');
    expect(state.connectedDevice).toBeNull();
    expect(state.error).toBe('out of range');
  });
});

describe('sessions', () => {
  it('accumulates readings and writes the summary on end', async () => {
    await useHeartRateStore.getState().connectToDevice('device-1');
    await useHeartRateStore.getState().startSession();

    emitReading?.(60);
    emitReading?.(80);
    emitReading?.(100);

    await useHeartRateStore.getState().endSession();

    expect(mockFinalize).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ avgHr: 80, maxHr: 100 }),
    );
    expect(useHeartRateStore.getState().activeSession).toBeNull();
  });

  it('persists each reading during a session', async () => {
    await useHeartRateStore.getState().connectToDevice('device-1');
    await useHeartRateStore.getState().startSession();

    emitReading?.(70);
    emitReading?.(72);

    expect(mockInsertReading).toHaveBeenCalledTimes(2);
    expect(mockInsertReading).toHaveBeenCalledWith(1, 70);
  });

  it('does not persist readings outside a session', async () => {
    await useHeartRateStore.getState().connectToDevice('device-1');
    emitReading?.(70);

    expect(mockInsertReading).not.toHaveBeenCalled();
    expect(useHeartRateStore.getState().liveHeartRate).toBe(70);
  });

  it('writes a null summary when a session captured no readings', async () => {
    await useHeartRateStore.getState().connectToDevice('device-1');
    await useHeartRateStore.getState().startSession();
    await useHeartRateStore.getState().endSession();

    expect(mockFinalize).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ avgHr: null, maxHr: null }),
    );
  });

  it('rounds a fractional average', async () => {
    await useHeartRateStore.getState().connectToDevice('device-1');
    await useHeartRateStore.getState().startSession();

    emitReading?.(60);
    emitReading?.(61);

    await useHeartRateStore.getState().endSession();
    expect(mockFinalize).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ avgHr: 61 }),
    );
  });

  it('resets the accumulator between sessions', async () => {
    await useHeartRateStore.getState().connectToDevice('device-1');

    await useHeartRateStore.getState().startSession();
    emitReading?.(200);
    await useHeartRateStore.getState().endSession();

    mockCreateSession.mockResolvedValue({
      id: 2,
      startTime: Date.now(),
      endTime: null,
      avgHr: null,
      maxHr: null,
      createdAt: Date.now(),
    });
    await useHeartRateStore.getState().startSession();
    emitReading?.(60);
    await useHeartRateStore.getState().endSession();

    expect(mockFinalize).toHaveBeenLastCalledWith(
      2,
      expect.objectContaining({ avgHr: 60, maxHr: 60 }),
    );
  });

  it('ignores startSession while one is already active', async () => {
    await useHeartRateStore.getState().startSession();
    await useHeartRateStore.getState().startSession();
    expect(mockCreateSession).toHaveBeenCalledTimes(1);
  });

  it('ignores endSession when none is active', async () => {
    await useHeartRateStore.getState().endSession();
    expect(mockFinalize).not.toHaveBeenCalled();
  });
});

describe('teardown', () => {
  it('releases scan, reading, and disconnect handles', async () => {
    await useHeartRateStore.getState().startScan();
    await useHeartRateStore.getState().connectToDevice('device-1');

    useHeartRateStore.getState().teardown();

    expect(readingDispose).toHaveBeenCalled();
    expect(disconnectDispose).toHaveBeenCalled();
  });

  it('is idempotent — repeated calls dispose only once each', async () => {
    await useHeartRateStore.getState().connectToDevice('device-1');

    useHeartRateStore.getState().teardown();
    useHeartRateStore.getState().teardown();
    useHeartRateStore.getState().teardown();

    expect(readingDispose).toHaveBeenCalledTimes(1);
    expect(disconnectDispose).toHaveBeenCalledTimes(1);
  });

  it('is safe when nothing was ever started', () => {
    expect(() => useHeartRateStore.getState().teardown()).not.toThrow();
  });

  it('disconnect clears device state and releases handles', async () => {
    await useHeartRateStore.getState().connectToDevice('device-1');
    await useHeartRateStore.getState().disconnect();

    const state = useHeartRateStore.getState();
    expect(state.connectionState).toBe('disconnected');
    expect(state.connectedDevice).toBeNull();
    expect(state.liveHeartRate).toBeNull();
    expect(mockBle.disconnect).toHaveBeenCalledWith('device-1');
    expect(readingDispose).toHaveBeenCalled();
  });

  it('disconnect is safe when nothing is connected', async () => {
    await expect(useHeartRateStore.getState().disconnect()).resolves.toBeUndefined();
    expect(mockBle.disconnect).not.toHaveBeenCalled();
  });
});
