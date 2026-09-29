/*
 * The attributes RoLens puts on the page. Everything RoLens adds carries one of these,
 * so it can be told apart from Roblox's own markup and removed without a trace.
 */

/** On every element RoLens creates; the value names the widget ("badge", "trade", ...). */
export const ROLENS_ATTR = 'data-rolens';
/** On a Roblox item card whose item is rare, so content.css can outline it. */
export const RARE_ATTR = 'data-rolens-rare';
/** On a Roblox element a chip floats over; "set" when RoLens made it a positioning context. */
export const ANCHOR_ATTR = 'data-rolens-anchor';
