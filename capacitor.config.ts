import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.timesinc.app',
  appName: 'TIMES INC',
  webDir: 'dist',
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    // Permite cámara y galería para la firma digital
    Permissions: {
      camera: 'allow',
    },
  },
  // En desarrollo apunta al servidor Vite
  server: {
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#0d0d18',
  },
  ios: {
    backgroundColor: '#0d0d18',
    contentInset: 'automatic',
    scrollEnabled: false,
  },
}

export default config
