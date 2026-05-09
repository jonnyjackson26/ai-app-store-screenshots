export type Platform = "apple" | "android";

export type DevicePreset = {
  id: string;
  label: string;
  width: number;
  height: number;
};

export const PLATFORM_LABELS: Record<Platform, string> = {
  apple: "Apple App Store",
  android: "Google Play Store",
};

export const DEVICE_PRESETS: Record<Platform, DevicePreset[]> = {
  apple: [
    { id: "iphone-6-9", label: 'iPhone 6.9" Display', width: 1290, height: 2796 },
    { id: "iphone-6-5", label: 'iPhone 6.5" Display', width: 1284, height: 2778 },
    { id: "iphone-6-3", label: 'iPhone 6.3" Display', width: 1206, height: 2622 },
    { id: "iphone-6-1", label: 'iPhone 6.1" Display', width: 1125, height: 2436 },
    { id: "iphone-5-5", label: 'iPhone 5.5" Display', width: 1242, height: 2208 },
    { id: "iphone-4-7", label: 'iPhone 4.7" Display', width: 750, height: 1334 },
    { id: "iphone-4", label: 'iPhone 4" Display', width: 640, height: 1136 },
    { id: "iphone-3-5", label: 'iPhone 3.5" Display', width: 640, height: 960 },
    { id: "ipad-13", label: 'iPad 13" Display', width: 2064, height: 2752 },
    { id: "ipad-12-9", label: 'iPad Pro 12.9" Display', width: 2048, height: 2732 },
    { id: "ipad-11", label: 'iPad 11" Display', width: 1668, height: 2420 },
    { id: "ipad-10-5", label: 'iPad 10.5" Display', width: 1668, height: 2224 },
    { id: "ipad-9-7", label: 'iPad 9.7" Display', width: 1536, height: 2048 },
  ],
  android: [
    { id: "phone", label: "Phone", width: 1080, height: 1920 },
    { id: "tablet-7", label: "7-inch tablet", width: 1440, height: 2560 },
    { id: "tablet-10", label: "10-inch tablet", width: 1800, height: 3200 },
    { id: "chromebook", label: "Chromebook", width: 1920, height: 1080 },
  ],
};

export const CUSTOM_PRESET_ID = "custom";

export type PresetMatch = {
  platform: Platform;
  presetId: string;
};

export function findPresetByDimensions(width: number, height: number): PresetMatch | null {
  for (const platform of Object.keys(DEVICE_PRESETS) as Platform[]) {
    for (const preset of DEVICE_PRESETS[platform]) {
      if (preset.width === width && preset.height === height) {
        return { platform, presetId: preset.id };
      }
    }
  }
  return null;
}
