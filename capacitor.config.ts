import type { CapacitorConfig } from '@capacitor/cli';

// M8: the native shell around the web build. See docs/mobile.md.
const config: CapacitorConfig = {
  appId: 'ai.avolis.homestead',
  appName: 'Homestead',
  webDir: 'dist',
  backgroundColor: '#1b2a2f',
  ios: {
    contentInset: 'never',
    backgroundColor: '#1b2a2f',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      launchAutoHide: true,
      backgroundColor: '#1b2a2f',
      showSpinner: false,
    },
    SystemBars: {
      // Edge to edge on Android. 'css' also injects --safe-area-inset-* variables,
      // for WebViews whose env(safe-area-inset-*) is still 0.
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
      style: 'DARK',
    },
    StatusBar: {
      // The app draws under the status bar and pads itself with safe-area insets.
      // 'DARK' is the style for dark backgrounds: light text and icons.
      overlaysWebView: true,
      style: 'DARK',
      backgroundColor: '#00000000',
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_homestead',
      iconColor: '#f2a541',
    },
  },
};

export default config;
