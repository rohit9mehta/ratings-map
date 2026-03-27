const cache = new Map();

export async function searchPlaces(query) {
  if (!query || query.length < 2) return [];

  const key = query.toLowerCase().trim();
  if (cache.has(key)) return cache.get(key);

  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`;

  const res = await fetch(url, {
    headers: { "Accept": "application/json" }
  });

  if (!res.ok) return [];

  const data = await res.json();
  const results = data.map(item => {
    const parts = item.display_name.split(", ");
    const name = item.name || parts[0];
    // Build a short location string: skip the name itself, grab city/state-level info
    const location = parts.slice(1, 4).join(", ");
    return {
      name,
      location,
      displayName: item.display_name,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      type: item.type?.replace(/_/g, " ") || ""
    };
  });

  cache.set(key, results);
  return results;
}
