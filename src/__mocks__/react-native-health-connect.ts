// Minimal stand-in for react-native-health-connect. Tests drive it via `__hcMock`.

export interface MockRecord {
  samples: Array<{ time: string; beatsPerMinute: number }>;
}

export const __hcMock = {
  sdkStatus: 3, // SDK_AVAILABLE
  initialized: true,
  grantedPermissions: [{ accessType: 'read', recordType: 'HeartRate' }],
  records: [] as MockRecord[],
  /** Set to throw from readRecords, e.g. to simulate a rate-limit error. */
  readError: null as Error | null,
  reset(): void {
    this.sdkStatus = 3;
    this.initialized = true;
    this.grantedPermissions = [{ accessType: 'read', recordType: 'HeartRate' }];
    this.records = [];
    this.readError = null;
  },
};

export const SdkAvailabilityStatus = {
  SDK_UNAVAILABLE: 1,
  SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED: 2,
  SDK_AVAILABLE: 3,
} as const;

export function getSdkStatus(): Promise<number> {
  return Promise.resolve(__hcMock.sdkStatus);
}

export function initialize(): Promise<boolean> {
  return Promise.resolve(__hcMock.initialized);
}

export function getGrantedPermissions(): Promise<
  Array<{ accessType: string; recordType: string }>
> {
  return Promise.resolve(__hcMock.grantedPermissions);
}

export function requestPermission(): Promise<
  Array<{ accessType: string; recordType: string }>
> {
  return Promise.resolve(__hcMock.grantedPermissions);
}

export function readRecords(): Promise<{ records: MockRecord[] }> {
  if (__hcMock.readError !== null) return Promise.reject(__hcMock.readError);
  return Promise.resolve({ records: __hcMock.records });
}

export default {
  getSdkStatus,
  initialize,
  getGrantedPermissions,
  requestPermission,
  readRecords,
};
