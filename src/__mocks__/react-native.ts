export const Platform = {
  OS: 'android',
  Version: 33,
  select: (obj: Record<string, unknown>) => obj.android ?? obj.default,
};

export const PermissionsAndroid = {
  PERMISSIONS: {
    BLUETOOTH_SCAN: 'android.permission.BLUETOOTH_SCAN',
    BLUETOOTH_CONNECT: 'android.permission.BLUETOOTH_CONNECT',
    ACCESS_FINE_LOCATION: 'android.permission.ACCESS_FINE_LOCATION',
  },
  RESULTS: {
    GRANTED: 'granted',
    DENIED: 'denied',
    NEVER_ASK_AGAIN: 'never_ask_again',
  },
  request: () => Promise.resolve('granted'),
  requestMultiple: (permissions: string[]) =>
    Promise.resolve(
      Object.fromEntries(permissions.map((p) => [p, 'granted'])) as Record<
        string,
        string
      >,
    ),
};

export const AppState = {
  currentState: 'active' as string,
  addEventListener: (_type: string, _handler: (state: string) => void) => ({
    remove: () => undefined,
  }),
};
export const StyleSheet = {
  create: (s: unknown) => s,
  absoluteFillObject: {},
  hairlineWidth: 1,
};
export const Dimensions = { get: () => ({ width: 390, height: 844 }) };
export const useColorScheme = () => 'light';
export const Animated = {
  Value: class {
    setValue() {}
  },
  timing: () => ({ start: () => {}, stop: () => {} }),
  spring: () => ({ start: () => {}, stop: () => {} }),
  parallel: () => ({ start: () => {}, stop: () => {} }),
  sequence: () => ({ start: () => {}, stop: () => {} }),
  delay: () => ({ start: () => {}, stop: () => {} }),
  View: () => null,
};
export const View = () => null;
export const Text = () => null;
export const Pressable = () => null;
export const TouchableOpacity = () => null;
export const FlatList = () => null;
export const Image = () => null;
export const ScrollView = () => null;
export const TextInput = () => null;
export const Modal = () => null;
export const Switch = () => null;
export const Alert = { alert: () => undefined };
export const SafeAreaView = () => null;
export const KeyboardAvoidingView = () => null;
export const ActivityIndicator = () => null;
export const RefreshControl = () => null;
