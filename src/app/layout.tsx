import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "NYC Day Planner",
  description: "Turn a wishlist of NYC sights into an optimized, door-to-door itinerary across subway, PATH, LIRR, Metro-North, Citi Bike and Uber.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
