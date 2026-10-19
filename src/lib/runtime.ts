import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

/** True when the JS runs inside the Expo Go client (no custom native modules, Apple Maps on iOS). */
export const IS_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/** Background tasks and custom notification channels need a development/store build. */
export const SUPPORTS_BACKGROUND_LOCATION = Platform.OS !== 'web' && !IS_EXPO_GO;
