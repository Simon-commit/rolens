import { ALERT_STATE_KEY, ALERTS_KEY, normaliseAlerts, type AlertSettings } from '../core/alerts';

/*
 * Alert changes that wait on a Chrome permission prompt. Chrome may close the popup while
 * its prompt is open, so the popup stores the change before asking, and whichever side
 * sees the permission granted first (the popup, or the service worker's
 * permissions.onAdded) applies it. A declined prompt applies nothing.
 */

export const PENDING_KEY = 'alertsPending';

interface PendingChange {
  patch: Partial<AlertSettings>;
  permissions: chrome.permissions.Permissions;
  at: number;
}

/** A pending change older than this was declined or abandoned. */
const PENDING_TTL_MS = 5 * 60_000;

export async function readAlertSettings(): Promise<AlertSettings> {
  const stored = await chrome.storage.local.get(ALERTS_KEY);
  return normaliseAlerts(stored[ALERTS_KEY]);
}

/** Saves a change to the alert settings. Turning alerts on starts afresh, so trades already waiting never alert. */
export async function applyAlertChange(patch: Partial<AlertSettings>): Promise<AlertSettings> {
  const current = await readAlertSettings();
  const next = normaliseAlerts({ ...current, ...patch });
  if (next.enabled && !current.enabled) await chrome.storage.local.remove(ALERT_STATE_KEY);
  await chrome.storage.local.set({ [ALERTS_KEY]: next });
  return next;
}

/**
 * Asks Chrome for the permissions a change needs, then applies it. Must be called from a
 * click. Resolves whether it was applied; it may never resolve if Chrome closes the popup,
 * in which case the service worker applies the change once the permission is granted.
 */
export async function requestAlertChange(
  patch: Partial<AlertSettings>,
  permissions: chrome.permissions.Permissions,
): Promise<boolean> {
  const pending: PendingChange = { patch, permissions, at: Date.now() };
  // Not awaited before the request, so Chrome still sees it as coming from the click.
  const stored = chrome.storage.local.set({ [PENDING_KEY]: pending });
  const granted = await chrome.permissions.request(permissions).catch(() => false);
  await stored;
  await chrome.storage.local.remove(PENDING_KEY);
  if (granted) await applyAlertChange(patch);
  return granted;
}

/** Applies a stored change once its permissions are granted (called by the service worker). */
export async function applyPendingChange(): Promise<void> {
  const stored = await chrome.storage.local.get(PENDING_KEY);
  const pending = stored[PENDING_KEY] as PendingChange | undefined;
  if (!pending || typeof pending !== 'object') return;
  if (!(Date.now() - pending.at < PENDING_TTL_MS)) {
    await chrome.storage.local.remove(PENDING_KEY);
    return;
  }
  if (!(await chrome.permissions.contains(pending.permissions).catch(() => false))) return;
  await chrome.storage.local.remove(PENDING_KEY);
  await applyAlertChange(pending.patch);
}
