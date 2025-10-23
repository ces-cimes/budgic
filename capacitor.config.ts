import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.budgic.app',
  appName: 'budgic',
  webDir: 'build',
  plugins: {
    EdgeToEdge: {
      backgroundColor: "#09090b",
    },
  },
};

export default config;
