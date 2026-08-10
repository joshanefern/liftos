import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.liftos.app',
  appName: 'LiftOS',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
    backgroundColor: '#0a0c15',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: '#0a0c15',
    },
    StatusBar: {
      style: 'DARK',
      overlaysWebView: true,
    },
  },
};

export default config;
