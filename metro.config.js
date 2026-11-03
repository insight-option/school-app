// Learn more: https://docs.expo.dev/guides/customizing-metro
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Expo Go has no `@aws-amplify/react-native` native module, which Amplify needs for parts of
// sign-in (device key hashing / SRP maths). Resolve the package's internal `nativeModule` file to
// our module: it returns the real native module in builds and a pure-JS version in Expo Go.
const AMPLIFY_RN = `${path.sep}@aws-amplify${path.sep}react-native${path.sep}`;
const SHIM = path.resolve(__dirname, 'src/lib/amplifyNativeShim.ts');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (context.originModulePath.includes(AMPLIFY_RN) && /(^|\/)nativeModule(\.m?js)?$/.test(moduleName)) {
    return { type: 'sourceFile', filePath: SHIM };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
