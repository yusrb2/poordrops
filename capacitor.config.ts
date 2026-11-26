import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.poordrops.app',
  appName: 'PoorDrops',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
