export interface HomePriceResult {
  zip_code: string
  city: string
  state: string
  county: string
  metro: string
  median_value: number
  last_updated: string
  avg_rent: number | null     // Zillow ZORI avg monthly rent
  avg_agi: number | null      // IRS SOI average AGI per tax return
  income_year: string | null  // Tax year the IRS data is from
}
