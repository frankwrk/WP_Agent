export function getUtcDayStartIso(reference = new Date()): string {
  const dayStart = new Date(
    Date.UTC(
      reference.getUTCFullYear(),
      reference.getUTCMonth(),
      reference.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );

  return dayStart.toISOString();
}
