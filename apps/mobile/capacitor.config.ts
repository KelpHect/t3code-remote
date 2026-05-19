import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "codes.t3.mobile",
  appName: "T3 Code",
  server: {
    androidScheme: "http",
    cleartext: true,
  },
  webDir: "dist",
};

export default config;
