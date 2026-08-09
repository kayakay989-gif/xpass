import type { ViewStyle } from 'react-native';

type Props = {
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  testID?: string;
};

/** Non-Android platforms do not render a Google Pay button. */
export function GooglePayButton(_props: Props) {
  return null;
}
