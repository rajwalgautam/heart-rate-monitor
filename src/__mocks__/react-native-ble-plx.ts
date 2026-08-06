// Minimal stand-in for react-native-ble-plx. The real module loads a native
// binary, so tests substitute this and drive it through `__bleMock`.
//
// This mock deliberately enforces two of the real library's preconditions,
// because an earlier, more permissive version modelled a happy path ble-plx
// does not offer and let a broken connect flow pass 93 tests:
//
//   1. `monitorCharacteristicForService` requires discovery to have run on the
//      *same* Device instance, and throws ServiceNotFound otherwise.
//   2. Connections are counted, so a spec can assert exactly one per session.

export interface MockCharacteristic {
  value: string | null;
}

type MonitorCallback = (
  error: Error | null,
  characteristic: MockCharacteristic | null,
) => void;

/** Test handle: lets a spec push notifications and inspect calls. */
export const __bleMock = {
  /** Devices `startDeviceScan` will emit. */
  discovered: [] as Array<{ id: string; name: string | null; rssi: number | null }>,
  /** Last monitor callback registered, so tests can push readings. */
  monitorCallback: null as MonitorCallback | null,
  scanStopped: false,
  cancelledConnections: [] as string[],
  connectShouldFail: false,
  /** How many times connectToDevice has been called. */
  connectCount: 0,
  /** Services the connected device reports; defaults to exposing 0x180D. */
  services: ['0000180d-0000-1000-8000-00805f9b34fb'] as string[],
  /** Registered disconnect listener, so a spec can simulate a dropout. */
  disconnectListener: null as
    | ((error: Error | null, device: MockDevice | null) => void)
    | null,
  reset(): void {
    this.disconnectListener = null;
    this.discovered = [];
    this.monitorCallback = null;
    this.scanStopped = false;
    this.cancelledConnections = [];
    this.connectShouldFail = false;
    this.connectCount = 0;
    this.services = ['0000180d-0000-1000-8000-00805f9b34fb'];
  },
  /** Push a characteristic value (base64) to the active monitor. */
  emitReading(base64: string): void {
    this.monitorCallback?.(null, { value: base64 });
  },
  emitError(error: Error): void {
    this.monitorCallback?.(error, null);
  },
};

class MockDevice {
  id: string;
  name: string | null;
  rssi: number | null;
  /** Per-instance, mirroring ble-plx: discovery does not transfer between objects. */
  private isDiscovered = false;

  constructor(id: string, name: string | null, rssi: number | null) {
    this.id = id;
    this.name = name;
    this.rssi = rssi;
  }

  async discoverAllServicesAndCharacteristics(): Promise<MockDevice> {
    this.isDiscovered = true;
    return this;
  }

  async services(): Promise<Array<{ uuid: string }>> {
    return __bleMock.services.map((uuid) => ({ uuid }));
  }

  monitorCharacteristicForService(
    service: string,
    _characteristic: string,
    callback: MonitorCallback,
  ): { remove: () => void } {
    if (!this.isDiscovered) {
      // The exact ble-plx failure this mock exists to reproduce.
      throw new Error(`Service ${service} for device ${this.id} not found`);
    }
    __bleMock.monitorCallback = callback;
    return {
      remove: () => {
        __bleMock.monitorCallback = null;
      },
    };
  }
}

export type Device = MockDevice;

export class BleManager {
  async state(): Promise<string> {
    return 'PoweredOn';
  }

  startDeviceScan(
    _uuids: string[] | null,
    _options: unknown,
    listener: (error: Error | null, device: MockDevice | null) => void,
  ): void {
    __bleMock.scanStopped = false;
    for (const d of __bleMock.discovered) {
      listener(null, new MockDevice(d.id, d.name, d.rssi));
    }
  }

  stopDeviceScan(): void {
    __bleMock.scanStopped = true;
  }

  async connectToDevice(id: string): Promise<MockDevice> {
    __bleMock.connectCount += 1;
    if (__bleMock.connectShouldFail) {
      throw new Error('connection failed');
    }
    return new MockDevice(id, 'Mock HRM', -50);
  }

  async cancelDeviceConnection(id: string): Promise<void> {
    __bleMock.cancelledConnections.push(id);
  }

  onDeviceDisconnected(
    _id: string,
    listener: (error: Error | null, device: MockDevice | null) => void,
  ): { remove: () => void } {
    __bleMock.disconnectListener = listener;
    return { remove: () => undefined };
  }

  destroy(): void {
    __bleMock.reset();
  }
}

export const State = {
  PoweredOn: 'PoweredOn',
  PoweredOff: 'PoweredOff',
  Unauthorized: 'Unauthorized',
} as const;
