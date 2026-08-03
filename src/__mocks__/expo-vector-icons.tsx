// @expo/vector-icons pulls in RNVectorIconsManager, a native module that does
// not exist under jsdom. Icons carry no behaviour worth asserting, so they
// render as nothing in tests.

interface IconProps {
  name?: string;
  size?: number;
  color?: string;
  [key: string]: unknown;
}

const Icon = (_props: IconProps): null => null;

export const Ionicons = Icon;
export const MaterialIcons = Icon;
export const MaterialCommunityIcons = Icon;
export const FontAwesome = Icon;
export const AntDesign = Icon;
export const Feather = Icon;

export default { Ionicons, MaterialIcons, MaterialCommunityIcons };
