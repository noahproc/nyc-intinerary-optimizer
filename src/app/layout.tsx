import type { Metadata, Viewport } from "next";
import "@fontsource/fustat/400.css";
import "@fontsource/fustat/500.css";
import "@fontsource/fustat/600.css";
import "@fontsource/fustat/700.css";
import "@fontsource/fustat/800.css";
import "@fontsource/anton/400.css";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import NavBar from "@/components/NavBar";
import { TripProvider } from "@/components/TripProvider";

export const metadata: Metadata = {
  title: "NYSee: your NYC day, door to door",
  description:
    "NYSee turns a wishlist of New York sights into an optimized, door-to-door day across subway, PATH, LIRR, Metro-North, Citi Bike and Uber, with one fare breakdown.",
};

export const viewport: Viewport = { themeColor: "#000000" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TripProvider>
          <NavBar />
          {children}
        </TripProvider>
      </body>
    </html>
  );
}
