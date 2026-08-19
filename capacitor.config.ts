import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.liftos.app',
  appName: 'LiftOS',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
    backgroundColor: '#1A1714',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: '#1A1714',
    },
    StatusBar: {
      style: 'DARK',
      overlaysWebView: true,
    },
  },
};

export default config;
