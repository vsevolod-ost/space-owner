/**
 * Kilograms as tonnes, one decimal rounded down: "21.0" (never shows more than there is; the
 * panel and the warehouse toast read the same mass the same way).
 */
export function tonnesText(kg: number): string {
  return (Math.max(0, Math.floor(kg / 100)) / 10).toFixed(1);
}

/**
 * Speed in km/s rounded down: one decimal ("93.1"), whole from 100 km/s ("103") so the FUEL
 * row keeps its 12 characters.
 */
export function kmPerSText(ms: number): string {
  const kms = Math.max(0, ms) / 1000;
  return kms >= 100 ? Math.floor(kms).toFixed(0) : (Math.floor(kms * 10) / 10).toFixed(1);
}
