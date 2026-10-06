// Local notification system for TaskMint.
//
// No backend / no FCM sender is required: everything runs on-device and reuses
// the SAME Firestore reads the app already performs, so it stays within the
// free tier with minimal reads.
//
//  • Daily reminder  -> a scheduled local notification (fires even when the app
//                       is closed, zero Firestore reads).
//  • Withdrawal approved / rejected, new offerwall task -> local notifications
//    raised when the app syncs with Firestore (foreground reconcile reuses
//    already-fetched data; a background task also checks periodically).
//
// Dedup is handled with small on-device string sets so the same event is never
// announced twice, whether detected in the foreground or by the background task.

import * as Notifications from "expo-notifications";
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { Linking, Platform } from "react-native";

import { storage } from "@/src/utils/storage";
import { KEYS } from "@/src/lib/storageKeys";
import {
  listTasks,
  myPayouts,
  mySubmissions,
  OfferSubmission,
  OfferTask,
  PayoutRequest,
} from "@/src/lib/firestore";
import { formatRupees } from "@/src/utils/format";

const isNative = Platform.OS !== "web";
const DAILY_ID = "tm-daily-reminder";
const BG_TASK = "tm-notify-sync";

// --------------------------- Permissions -----------------------------------
export async function requestNotificationPermission(): Promise<{
  granted: boolean;
  canAskAgain: boolean;
}> {
  if (!isNative) return { granted: false, canAskAgain: false };
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return { granted: true, canAskAgain: current.canAskAgain };
  if (!current.canAskAgain) return { granted: false, canAskAgain: false };
  const req = await Notifications.requestPermissionsAsync();
  return { granted: req.granted, canAskAgain: req.canAskAgain };
}

export function openNotificationSettings() {
  Linking.openSettings().catch(() => {});
}

// --------------------------- Presenting -------------------------------------
async function present(title: string, body: string, data: Record<string, any> = {}) {
  if (!isNative) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data, sound: "default" },
      trigger: null, // immediate
    });
  } catch {
    // ignore
  }
}

// --------------------------- Daily reminder ---------------------------------
export async function scheduleDailyReminder(hour = 19, minute = 0) {
  if (!isNative) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(DAILY_ID).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: DAILY_ID,
      content: {
        title: "TaskMint 🎁",
        body: "Your daily reward is ready! Tap to claim your check-in and earn more.",
        data: { deeplink: "/(tabs)" },
        sound: "default",
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });
  } catch {
    // ignore
  }
}

// --------------------------- Event helpers ----------------------------------
function notifyPayout(p: PayoutRequest) {
  if (p.status === "successful") {
    present(
      "Withdrawal approved ✅",
      `Your ${formatRupees(p.amount)} withdrawal has been approved.`,
      { deeplink: "/(tabs)/wallet" },
    );
  } else if (p.status === "rejected") {
    present(
      "Withdrawal rejected",
      `Your ${formatRupees(p.amount)} withdrawal was rejected${
        p.reason ? `: ${p.reason}` : "."
      }`,
      { deeplink: "/(tabs)/wallet" },
    );
  }
}

function notifyTaskApproved(s: OfferSubmission) {
  present(
    "Task approved 🎉",
    `You earned ${formatRupees(s.reward)} for "${s.taskTitle}".`,
    { deeplink: "/(tabs)/wallet" },
  );
}

function notifyNewTask(t: OfferTask) {
  present(
    "New task available 🆕",
    `${t.title} — earn ${formatRupees(t.reward)}. Tap to start!`,
    { deeplink: "/(tabs)" },
  );
}

// Processes already-fetched data and raises any notifications that are new.
// Reuses the caller's Firestore reads — no extra reads are performed here.
export async function processAndNotify(opts: {
  pays?: PayoutRequest[];
  subs?: OfferSubmission[];
  tasks?: OfferTask[];
}) {
  if (!isNative) return;
  const { pays, subs, tasks } = opts;

  if (pays) {
    const notified = (await storage.getItem<string[]>(KEYS.notifiedPayouts, [])) ?? [];
    const add: string[] = [];
    for (const p of pays) {
      const key = `${p.id}:${p.status}`;
      if ((p.status === "successful" || p.status === "rejected") && !notified.includes(key)) {
        notifyPayout(p);
        add.push(key);
      }
    }
    if (add.length) {
      await storage.setItem(KEYS.notifiedPayouts, [...notified, ...add].slice(-300));
    }
  }

  if (subs) {
    const notified = (await storage.getItem<string[]>(KEYS.notifiedSubs, [])) ?? [];
    const add: string[] = [];
    for (const s of subs) {
      if (s.status === "approved" && !notified.includes(s.id)) {
        notifyTaskApproved(s);
        add.push(s.id);
      }
    }
    if (add.length) {
      await storage.setItem(KEYS.notifiedSubs, [...notified, ...add].slice(-300));
    }
  }

  if (tasks) {
    const seen = (await storage.getItem<string[]>(KEYS.seenTasks, [])) ?? [];
    const currentIds = tasks.map((t) => t.id);
    if (seen.length === 0) {
      // First run: seed the set so existing tasks are never announced.
      await storage.setItem(KEYS.seenTasks, currentIds);
    } else {
      const seenSet = new Set(seen);
      const fresh = tasks.filter((t) => !seenSet.has(t.id));
      fresh.slice(0, 3).forEach(notifyNewTask); // cap to avoid spam
      if (fresh.length) {
        await storage.setItem(
          KEYS.seenTasks,
          [...seen, ...fresh.map((t) => t.id)].slice(-300),
        );
      }
    }
  }
}

// --------------------------- Background sync --------------------------------
// Runs when the app is backgrounded (OS-scheduled, ~15 min min). Performs the
// minimal per-device reads and raises notifications for any new events.
export async function backgroundSync() {
  if (!isNative) return;
  const deviceId = (await storage.getItem<string>(KEYS.deviceId, "")) ?? "";
  if (!deviceId) return;
  try {
    const [pays, subs, tasks] = await Promise.all([
      myPayouts(deviceId),
      mySubmissions(deviceId),
      listTasks(),
    ]);
    await processAndNotify({ pays, subs, tasks });
  } catch {
    // offline / transient
  }
}

if (isNative) {
  // Task must be defined at module scope (before registration).
  TaskManager.defineTask(BG_TASK, async () => {
    try {
      await backgroundSync();
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

export async function registerBackgroundSync() {
  if (!isNative) return;
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return;
    const registered = await TaskManager.isTaskRegisteredAsync(BG_TASK);
    if (!registered) {
      await BackgroundTask.registerTaskAsync(BG_TASK, { minimumInterval: 15 });
    }
  } catch {
    // ignore
  }
}
