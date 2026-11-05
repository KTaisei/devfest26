import { Geolocation } from "@capacitor/geolocation";
export async function getCurrentLocation() {
  const position = await Geolocation.getCurrentPosition({
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 0,
  });
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}
