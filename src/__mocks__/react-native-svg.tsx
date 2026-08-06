// react-native-svg renders through native views that do not exist under jsdom
// or in the node `unit` environment. The chart's correctness lives in
// `src/utils/chart.ts` (pure, fully tested); these stubs exist only so a module
// importing the chart can be loaded.

interface AnyProps {
  children?: unknown;
  [key: string]: unknown;
}

const Stub = (_props: AnyProps): null => null;

export const Svg = Stub;
export const Circle = Stub;
export const Line = Stub;
export const Polygon = Stub;
export const Polyline = Stub;
export const Path = Stub;
export const Rect = Stub;
export const G = Stub;
export const Text = Stub;
export const Defs = Stub;
export const LinearGradient = Stub;
export const Stop = Stub;

export default Svg;
