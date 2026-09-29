import { describe, expect, it } from 'vitest';
import { holdTimeLabel } from '../src/content/ui/hold-time';
import { HOLD_MS, holdEndsBy, parseOwnerSince } from '../src/core/owner-since';

const hour = 3_600_000;
const now = Date.parse('2026-09-29T17:12:00Z');
// Shaped like Rolimon's player page: [copy id, serial, created, owner since].
const page = `<script>
var player_id = 1;
var scanned_player_assets  = {"24112667":[[232388801,null,1269042860403,${now - 19 * hour}]],"87983592197138":[[411459874396,null,1,${now - 30 * hour}],[411678922661,null,1,${now - 5 * hour}],[411715616056,null,1,${now - 100 * hour}]],"162200696":[[1871958497,14973,1,${now - 2 * hour}],[1871958498,20000,1,${now - 1 * hour}]]};
var chart_data = {};
</script>`;

describe('hold end estimates from Rolimon\'s "Owner Since"', () => {
  it("reads the table from Rolimon's player page", () => {
    const data = parseOwnerSince(page)!;
    expect(Object.keys(data)).toHaveLength(3);
    expect(data['162200696']![0]).toEqual({ serial: 14973, since: now - 2 * hour });
    expect(parseOwnerSince('<html>no table</html>')).toBeNull();
    expect(parseOwnerSince('var scanned_player_assets = {broken};')).toBeNull();
  });

  it('adds the 48-hour hold to when the owner received the copy', () => {
    const data = parseOwnerSince(page)!;
    // Received 19 hours ago: off hold within 29 hours.
    expect(holdEndsBy(data, 24112667, null, now)).toBe(now + 29 * hour);
  });

  it('matches serials exactly, and otherwise uses the most recent copy', () => {
    const data = parseOwnerSince(page)!;
    expect(holdEndsBy(data, 162200696, 14973, now)).toBe(now - 2 * hour + HOLD_MS);
    expect(holdEndsBy(data, 87983592197138, null, now)).toBe(now - 5 * hour + HOLD_MS);
  });

  it("gives no time when Rolimon's has not seen a recent change of hands", () => {
    const data = parseOwnerSince(page)!;
    expect(holdEndsBy(data, 162200696, 99999, now)).toBeNull();
    expect(holdEndsBy(data, 1, null, now)).toBeNull();
    expect(holdEndsBy(data, 24112667, null, now + 40 * hour)).toBeNull();
  });
});

describe('hold time labels', () => {
  it('rounds up to the hour, then minutes, then "Soon"', () => {
    expect(holdTimeLabel(now + 28.2 * hour, now)).toBe('29h');
    expect(holdTimeLabel(now + 20 * 60_000, now)).toBe('20m');
    expect(holdTimeLabel(now - 1, now)).toBe('Soon');
  });
});
