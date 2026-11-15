// Best-effort GPS. A missing fix never blocks a check-in or a scan: the server just marks it "needs review".
import * as Location from 'expo-location';

export async function getFix(timeoutMs = 3000) {
  try {
    let perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return null;
    const recent = await Location.getLastKnownPositionAsync({ maxAge: 120000, requiredAccuracy: 100 });
    const pos = recent || await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    if (!pos) return null;
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy_m: pos.coords.accuracy == null ? undefined : Math.round(pos.coords.accuracy) };
  } catch { return null; }
}
