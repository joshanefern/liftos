import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.liftos.app',
  appName: 'LiftOS',
  webDir: 'dist',
  server: {
    // Strava OAuth must navigate IN-WEBVIEW: the consent redirect targets the
    // webview origin (capacitor://localhost/auth/strava/callback), which a
    // system-Safari sheet can never hand back to the app.
    allowNavigation: ['strava.com', '*.strava.com'],
  },
  ios: {
    contentInset: 'never',
    backgroundColor: '#0e1420',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: '#0e1420',
    },
    StatusBar: {
      style: 'DARK',
      overlaysWebView: true,
    },
  },
};

export default config;
