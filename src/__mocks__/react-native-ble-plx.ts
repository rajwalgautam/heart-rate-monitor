// Minimal stand-in for react-native-ble-plx. The real module loads a native
// binary, so tests substitute this and drive it through `__bleMock`.

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
  reset(): void {
    this.discovered = [];
    this.monitorCallback = null;
    this.scanStopped = false;
    this.cancelledConnections = [];
    this.connectShouldFail = false;
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

  constructor(id: string, name: string | null, rssi: number | null) {
    this.id = id;
    this.name = name;
    this.rssi = rssi;
  }

  async discoverAllServicesAndCharacteristics(): Promise<MockDevice> {
    return this;
  }

  monitorCharacteristicForService(
    _service: string,
    _characteristic: string,
    callback: MonitorCallback,
  ): { remove: () => void } {
    __bleMock.monitorCallback = callback;
    return {
      remove: () => {
        __bleMock.monitorCallback = null;
      },
    };
  }
}

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
    _listener: (error: Error | null, device: MockDevice | null) => void,
  ): { remove: () => void } {
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
