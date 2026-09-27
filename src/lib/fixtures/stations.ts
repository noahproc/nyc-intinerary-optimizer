import type { LatLng } from "../types";

export interface Station {
  name: string;
  location: LatLng;
}

export const PATH_NY: Station[] = [
  { name: "World Trade Center", location: { lat: 40.7126, lng: -74.0099 } },
  { name: "Christopher St", location: { lat: 40.733, lng: -74.007 } },
  { name: "9th St", location: { lat: 40.7342, lng: -73.999 } },
  { name: "14th St", location: { lat: 40.7374, lng: -73.9969 } },
  { name: "23rd St", location: { lat: 40.7429, lng: -73.9926 } },
  { name: "33rd St", location: { lat: 40.7491, lng: -73.9882 } },
];

export const PATH_NJ: Station[] = [
  { name: "Exchange Place", location: { lat: 40.7163, lng: -74.0331 } },
  { name: "Grove St", location: { lat: 40.7195, lng: -74.0431 } },
  { name: "Newport", location: { lat: 40.727, lng: -74.0339 } },
  { name: "Hoboken", location: { lat: 40.7353, lng: -74.0291 } },
  { name: "Journal Square", location: { lat: 40.7327, lng: -74.0629 } },
];

export const LIRR_CITY: Station[] = [
  { name: "Penn Station", location: { lat: 40.7506, lng: -73.9935 } },
  { name: "Grand Central Madison", location: { lat: 40.7527, lng: -73.9772 } },
  { name: "Atlantic Terminal", location: { lat: 40.6843, lng: -73.9776 } },
];

export const LIRR_ISLAND: Station[] = [
  { name: "Long Beach", location: { lat: 40.589, lng: -73.6647 } },
  { name: "Port Washington", location: { lat: 40.829, lng: -73.6874 } },
  { name: "Freeport", location: { lat: 40.6574, lng: -73.5826 } },
  { name: "Huntington", location: { lat: 40.8528, lng: -73.4096 } },
  { name: "Babylon", location: { lat: 40.7003, lng: -73.3237 } },
  { name: "Mineola", location: { lat: 40.7405, lng: -73.6408 } },
];

export const MNR_CITY: Station[] = [{ name: "Grand Central", location: { lat: 40.7527, lng: -73.9772 } }];

export const MNR_NORTH: Station[] = [
  { name: "Beacon", location: { lat: 41.5048, lng: -73.9847 } },
  { name: "Cold Spring", location: { lat: 41.4152, lng: -73.9546 } },
  { name: "Tarrytown", location: { lat: 41.0762, lng: -73.8646 } },
  { name: "White Plains", location: { lat: 41.0331, lng: -73.7752 } },
  { name: "Yonkers", location: { lat: 40.9357, lng: -73.9024 } },
];
