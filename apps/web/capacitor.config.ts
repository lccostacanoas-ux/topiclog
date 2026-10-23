import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "br.com.topiclog.app",
  appName: "Topic Log",
  webDir: "public",
  server: {
    androidScheme: "https",
    cleartext: true,
    // Permite apontar para o servidor de desenvolvimento ou homologação via Wi-Fi local
    // Exemplo: url: process.env.CAPACITOR_SERVER_URL || "http://192.168.0.11:3000",
    url: process.env.CAPACITOR_SERVER_URL
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#0F172A",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0F172A"
    }
  }
};

export default config;
