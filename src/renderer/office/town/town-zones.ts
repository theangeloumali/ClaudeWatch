// The districts a city lot is zoned for.
export const TOWN_DISTRICTS = [
  'civic',
  'market',
  'entertainment',
  'residential',
  'workshop',
  'park'
] as const
export type TownDistrict = (typeof TOWN_DISTRICTS)[number]

// The tallest an ordinary design of each district may be drawn.
export const ZONE_HEIGHT_CAP_M: Record<TownDistrict, number> = {
  civic: 24,
  market: 7,
  entertainment: 12,
  residential: 9,
  workshop: 12,
  park: 5
}
