<script setup lang="ts">
import {
  CenteredCardColumn,
  Notification,
  assertConfirm,
  computedResult,
  pushNotification,
  reportSuccess,
  wrapActions,
} from "@45drives/houston-common-ui";
import { getServer } from "@45drives/houston-common-lib";
import { okAsync } from "neverthrow";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

import { ConnectedClientsManager } from "@/tabs/connected-clients/connected-clients-manager";
import type { ConnectedClient } from "@/tabs/connected-clients/data-types";
import ConnectedClientsTableView from "@/tabs/connected-clients/ui/ConnectedClientsTableView.vue";
import { useUserSettings } from "@/common/user-settings";

const _ = cockpit.gettext;

const userSettings = useUserSettings();
const server = getServer();
const manager = server.map((s) => new ConnectedClientsManager(s));

const [clients, reloadClients] = computedResult<ConnectedClient[]>(
  () => manager.andThen((m) => m.getClients()),
  []
);

// Diff successive polls to fire toasts covering five kinds of events:
//  - Client connected: first time we see this logical client
//  - Client disconnected: logical client gone
//  - Client reconnected: same logical client, new session (different
//    connectedSince) — typical kick → auto-reconnect case
//  - Share connected: same logical client, same session, share appeared
//  - Share disconnected: same logical client, same session, share dropped
//
// Rows are aggregated by logical client (protocol + user + IP) in the
// manager, so client.id IS the logical-client key. `null` baseline = no
// diff yet (first load just records, never notifies); baseline updates
// regardless of notifyOnChange so toggling that setting on doesn't
// backfire stale events.
const previousByID = ref<Map<string, ConnectedClient> | null>(null);
const clientIdentity = (c: ConnectedClient): string => {
  const who = c.hostname ?? c.ip;
  return c.user ? `${c.user}@${who}` : who;
};
const clientLabel = (c: ConnectedClient): string => {
  const id = clientIdentity(c);
  return c.share ? `${id} · ${c.share}` : id;
};
const shareLabel = (c: ConnectedClient, share: string): string =>
  `${share} · ${clientIdentity(c)}`;

// Per-protocol toast titles. Strings stay as literal _() calls at each branch
// so the gettext extractor catches them; using a key-driven helper would hide
// them from the extraction tooling.
const connectedTitle = (c: ConnectedClient): string =>
  c.protocol === "samba" ? _("Samba client connected") : _("NFS client connected");
const reconnectedTitle = (c: ConnectedClient): string =>
  c.protocol === "samba" ? _("Samba client reconnected") : _("NFS client reconnected");
const disconnectedTitle = (c: ConnectedClient): string =>
  c.protocol === "samba" ? _("Samba client disconnected") : _("NFS client disconnected");
const shareSet = (s: string | null): Set<string> =>
  new Set(s ? s.split(", ") : []);
const sessionDiffers = (a: Date | null, b: Date | null): boolean => {
  if (a === null && b === null) return false;
  if (a === null || b === null) return true;
  return a.getTime() !== b.getTime();
};
watch(clients, (newClients) => {
  const newMap = new Map(newClients.map((c) => [c.id, c]));
  const prev = previousByID.value;
  if (prev !== null && userSettings.value.connectedClients.notifyOnChange) {
    for (const c of newClients) {
      const old = prev.get(c.id);
      if (!old) {
        pushNotification(
          new Notification(connectedTitle(c), clientLabel(c), "info")
        );
      } else if (sessionDiffers(c.connectedSince, old.connectedSince)) {
        pushNotification(
          new Notification(reconnectedTitle(c), clientLabel(c), "info")
        );
      } else {
        // Same id, same session — check for share-set delta. A user can
        // mount additional shares or drop some while keeping their session.
        const oldShares = shareSet(old.share);
        const newShares = shareSet(c.share);
        for (const s of newShares) {
          if (!oldShares.has(s)) {
            pushNotification(
              new Notification(_("Share connected"), shareLabel(c, s), "info")
            );
          }
        }
        for (const s of oldShares) {
          if (!newShares.has(s)) {
            pushNotification(
              new Notification(_("Share disconnected"), shareLabel(c, s), "info")
            );
          }
        }
      }
    }
    for (const [id, c] of prev) {
      if (!newMap.has(id)) {
        pushNotification(
          new Notification(disconnectedTitle(c), clientLabel(c), "warning")
        );
      }
    }
  }
  previousByID.value = newMap;
});

const refreshIntervalSeconds = computed(
  () => userSettings.value.connectedClients.refreshIntervalSeconds
);

// `inFlight` gates concurrent fetches AND drives the spinner animation on
// the refresh icon. Two reasons for the single source of truth:
//  1) Skip-overlap: if a poll is still running when the next tick (or a
//     manual click) fires, the new one no-ops. Cancelling + restarting
//     hung calls (DNS timeout, slow nmblookup) just produces a fresh
//     hang — and Cockpit lacks first-class cancellation primitives.
//  2) Min-spin duration: local fetches usually finish in <100ms, so the
//     animate-spin barely registers visually. Holding inFlight true for
//     at least MIN_SPIN_MS lets the user perceive each refresh tick.
const inFlight = ref(false);
const MIN_SPIN_MS = 400;
let spinStartedAt = 0;
let spinReleaseTimer: number | undefined;
const beginInFlight = () => {
  inFlight.value = true;
  spinStartedAt = performance.now();
};
const releaseInFlight = () => {
  const remaining = MIN_SPIN_MS - (performance.now() - spinStartedAt);
  if (remaining <= 0) {
    inFlight.value = false;
  } else {
    // Tracked so onUnmounted can clear it — otherwise a pending tick fires
    // after teardown and Vue warns about mutating a destroyed component.
    spinReleaseTimer = window.setTimeout(() => {
      spinReleaseTimer = undefined;
      inFlight.value = false;
    }, remaining);
  }
};

// Background poll: silence errors so a chronic failure doesn't spam
// notifications every tick. ResultAsync is PromiseLike, not Promise, so
// we use .then(success, error) instead of .finally for cleanup.
const pollTick = () => {
  if (inFlight.value) return;
  beginInFlight();
  reloadClients()
    .mapErr(() => undefined)
    .then(releaseInFlight, releaseInFlight);
};

// Manual refresh: surfaces errors via wrapActions's notification handler.
// If a poll is already in flight, return an immediately-resolved ok so
// the click silently no-ops.
const refreshNow = () => {
  if (inFlight.value) return okAsync(undefined as void);
  beginInFlight();
  const r = reloadClients();
  r.then(releaseInFlight, releaseInFlight);
  return r;
};

let refreshTimer: number | undefined;
const startTimer = () => {
  if (refreshTimer !== undefined) window.clearInterval(refreshTimer);
  const ms = Math.max(1, refreshIntervalSeconds.value) * 1000;
  refreshTimer = window.setInterval(pollTick, ms);
};

onMounted(startTimer);
onUnmounted(() => {
  if (refreshTimer !== undefined) window.clearInterval(refreshTimer);
  if (spinReleaseTimer !== undefined) window.clearTimeout(spinReleaseTimer);
});
watch(refreshIntervalSeconds, startTimer);

const kickClient = (client: ConnectedClient) => {
  const label = client.hostname ? `${client.hostname} (${client.ip})` : client.ip;
  return assertConfirm({
    header: _("Disconnect Samba client?"),
    body:
      _("All open sessions and file handles from") +
      ` ${label} ` +
      _("will be closed. The client may reconnect automatically."),
    dangerous: true,
  })
    .andThen(() => manager)
    .andThen((m) => m.kickSamba(client.ip))
    .andThen(() => reloadClients())
    .map(() => reportSuccess(_("Disconnected") + ` ${label}`));
};

const actions = wrapActions({
  refreshNow,
  kickClient,
});
</script>

<template>
  <CenteredCardColumn>
    <ConnectedClientsTableView
      :clients="clients"
      :inFlight="inFlight"
      @refresh="actions.refreshNow()"
      @kick="(c) => actions.kickClient(c)"
    />
  </CenteredCardColumn>
</template>
