import type { ModeChoice, PaymentChannel, SegmentMode } from "./types";

// Line colors for the dark map: bright enough to read on black, distinct from each other.
export const MODE_META: Record<SegmentMode, { label: string; color: string; dashed?: boolean }> = {
  walk: { label: "Walk", color: "#c9c2c5", dashed: true },
  subway: { label: "Subway", color: "#f50538" },
  bus: { label: "Bus", color: "#ffb547" },
  path: { label: "PATH", color: "#4cc3ff" },
  lirr: { label: "LIRR", color: "#b58cff" },
  "metro-north": { label: "Metro-North", color: "#3ddc97" },
  citibike: { label: "Citi Bike", color: "#2fd6e8" },
  uber: { label: "Uber", color: "#ffffff" },
  drive: { label: "Drive", color: "#8f8a8c" },
};

export const CHOICE_LABEL: Record<ModeChoice, string> = {
  transit: "Best transit",
  bus: "Bus only",
  citibike: "Citi Bike",
  walk: "Walk",
  uber: "Uber",
  drive: "Drive",
};

export const PAYMENT_META: Record<PaymentChannel, { short: string; color: string }> = {
  omny: { short: "OMNY tap", color: "#f50538" },
  tapp: { short: "PATH tap", color: "#4cc3ff" },
  "mta-rail": { short: "TrainTime", color: "#b58cff" },
  citibike: { short: "Citi Bike app", color: "#2fd6e8" },
  uber: { short: "Uber app", color: "#ffffff" },
  car: { short: "Car", color: "#8f8a8c" },
  free: { short: "Free", color: "#6f686b" },
};
