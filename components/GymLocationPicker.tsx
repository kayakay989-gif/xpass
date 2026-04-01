/* eslint-disable @typescript-eslint/no-require-imports -- platform split; Metro resolves .web/.native */
import { Platform } from 'react-native';

/**
 * Metro picks `.web` / `.native` automatically; this file exists so TypeScript
 * can resolve `@/components/GymLocationPicker` and IDEs get typings.
 */
const GymLocationPicker =
  Platform.OS === 'web'
    ? require('./GymLocationPicker.web').default
    : require('./GymLocationPicker.native').default;

export default GymLocationPicker;
