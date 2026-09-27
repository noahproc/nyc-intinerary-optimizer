import type { ModeChoice, SegmentMode } from "./types";

export const MODE_META: Record<SegmentMode, { label: string; icon: string; color: string; dashed?: boolean }> = {
  walk: { label: "Walk", icon: "🚶", color: "#8a8f98", dashed: true },
  subway: { label: "Subway", icon: "🚇", color: "#0b5fff" },
  bus: { label: "Bus", icon: "🚌", color: "#0e9f6e" },
  path: { label: "PATH", icon: "🚆", color: "#e0620d" },
  lirr: { label: "LIRR", icon: "🚆", color: "#7c3aed" },
  "metro-north": { label: "Metro-North", icon: "🚆", color: "#c81e1e" },
  citibike: { label: "Citi Bike", icon: "🚲", color: "#0891b2" },
  uber: { label: "Uber", icon: "🚕", color: "#111827" },
  drive: { label: "Drive", icon: "🚗", color: "#6b7280" },
};

export const CHOICE_LABEL: Record<ModeChoice, string> = {
  transit: "Best transit",
  bus: "Bus only",
  citibike: "Citi Bike",
  walk: "Walk",
  uber: "Uber",
  drive: "Drive",
};
