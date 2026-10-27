import { formatTripDateRange } from '@/features/trips/formatTripDateRange';

describe('formatTripDateRange', () => {
  it('formats a complete same-year range', () => {
    expect(formatTripDateRange('2026-11-01', '2026-11-05')).toBe('Nov 1 – Nov 5, 2026');
  });

  it('formats the same start and end date once', () => {
    expect(formatTripDateRange('2026-11-01', '2026-11-01')).toBe('Nov 1, 2026');
  });

  it('formats a range spanning calendar years', () => {
    expect(formatTripDateRange('2026-12-30', '2027-01-02')).toBe(
      'Dec 30, 2026 – Jan 2, 2027'
    );
  });

  it('handles either date being absent and hides an entirely absent range', () => {
    expect(formatTripDateRange('2026-11-01', null)).toBe('Nov 1, 2026');
    expect(formatTripDateRange(null, '2026-11-05')).toBe('Nov 5, 2026');
    expect(formatTripDateRange(null, null)).toBeNull();
  });

  it('is stable across runtime timezone settings', () => {
    const originalTimezone = process.env.TZ;
    const values = ['Pacific/Kiritimati', 'America/Los_Angeles'].map((timezone) => {
      process.env.TZ = timezone;
      return formatTripDateRange('2026-11-01', '2026-11-05');
    });
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;

    expect(values).toEqual(['Nov 1 – Nov 5, 2026', 'Nov 1 – Nov 5, 2026']);
  });
});
