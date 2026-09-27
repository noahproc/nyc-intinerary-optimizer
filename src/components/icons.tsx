import {
  Baby,
  Bike,
  Building2,
  Car,
  CarTaxiFront,
  CreditCard,
  Footprints,
  Landmark,
  Palette,
  ShoppingBag,
  Smartphone,
  TrainFront,
  TrainFrontTunnel,
  TramFront,
  Trees,
  Utensils,
  Bus,
  type LucideIcon,
} from "lucide-react";
import type { Interest, PaymentChannel, SegmentMode } from "@/lib/types";

export const MODE_ICON: Record<SegmentMode, LucideIcon> = {
  walk: Footprints,
  subway: TrainFront,
  bus: Bus,
  path: TrainFrontTunnel,
  lirr: TramFront,
  "metro-north": TramFront,
  citibike: Bike,
  uber: CarTaxiFront,
  drive: Car,
};

export const INTEREST_ICON: Record<Interest, LucideIcon> = {
  food: Utensils,
  art: Palette,
  views: Building2,
  shopping: ShoppingBag,
  history: Landmark,
  parks: Trees,
  kids: Baby,
};

export const PAYMENT_ICON: Record<PaymentChannel, LucideIcon> = {
  omny: CreditCard,
  tapp: CreditCard,
  "mta-rail": Smartphone,
  citibike: Bike,
  uber: CarTaxiFront,
  car: Car,
  free: Footprints,
};

export function ModeIcon({ mode, size = 16 }: { mode: SegmentMode; size?: number }) {
  const Icon = MODE_ICON[mode];
  return <Icon size={size} strokeWidth={2.2} aria-hidden />;
}
