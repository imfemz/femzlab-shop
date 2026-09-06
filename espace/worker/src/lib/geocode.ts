// Géocodage déclaratif ville → [lat, lon] (base embarquée ~3000 villes,
// identique au front). Bundlé dans le Worker via l'import JSON.
import CITIES from '../data/cities.json';

const DB = CITIES as Record<string, [number, number]>;

function normCity(s: string): string {
  return String(s)
    .toLowerCase()
    .split(',')[0]
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/-/g, ' ')
    .trim();
}

export function geocode(city: string): { lat: number; lon: number } | null {
  if (!city) return null;
  const g = DB[normCity(city)];
  return g ? { lat: g[0], lon: g[1] } : null;
}
