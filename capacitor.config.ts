/// <reference types="@capacitor/status-bar" />
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.sujian.epubeditor',
  appName: '素笺',
  webDir: 'dist',
  android: {
    adjustMarginsForEdgeToEdge: 'force',
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#efe6d4',
    },
  },
}

export default config
