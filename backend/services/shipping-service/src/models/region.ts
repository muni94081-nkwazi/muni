// Uganda local-fulfillment coverage zones and the hubs packages originate from.

export const REGIONS = ['KAMPALA', 'ENTEBBE', 'JINJA', 'UPCOUNTRY'] as const;
export type Region = (typeof REGIONS)[number];

export const HUBS = ['KAMPALA_HUB', 'ENTEBBE_HUB', 'JINJA_HUB', 'UPCOUNTRY_HUB'] as const;
export type Hub = (typeof HUBS)[number];

export function isRegion(value: string): value is Region {
  return (REGIONS as readonly string[]).includes(value);
}

export function isHub(value: string): value is Hub {
  return (HUBS as readonly string[]).includes(value);
}

const CITY_TO_REGION: Record<string, Region> = {
  kampala: 'KAMPALA',
  wakiso: 'KAMPALA',
  entebbe: 'ENTEBBE',
  mukono: 'ENTEBBE',
  jinja: 'JINJA',
};

// Anything not explicitly mapped to a Kampala-metro or Entebbe/Jinja town falls to Upcountry.
export function regionForCity(city: string): Region {
  const normalized = city.toLowerCase().trim();
  for (const [key, region] of Object.entries(CITY_TO_REGION)) {
    if (normalized.includes(key)) return region;
  }
  return 'UPCOUNTRY';
}
