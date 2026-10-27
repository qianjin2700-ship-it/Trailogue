let revision = 0;

export function getTripListRevision(): number {
  return revision;
}

export function invalidateTripList(): void {
  revision += 1;
}
