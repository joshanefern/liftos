import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

/* ── Training reminders: a local notification on chosen weekdays at a
   chosen time. Fully on-device — nothing scheduled server-side, nothing
   fires when the toggle is off. Consistency is the whole game; this is
   the nudge that guards it. ── */

export type ReminderPrefs = {
  enabled: boolean;
  /** 24h clock. */
  hour: number;
  minute: number;
  /** iOS weekday numbers: 1 = Sunday … 7 = Saturday. */
  days: number[];
};

const KEY = "liftos-reminders";
/** Stable notification ids, one per weekday (100 + weekday). */
const idForDay = (day: number): number => 100 + day;
const ALL_IDS = [1, 2, 3, 4, 5, 6, 7].map(idForDay);

export const DEFAULT_REMINDERS: ReminderPrefs = {
  enabled: false,
  hour: 17,
  minute: 0,
  days: [2, 4, 6], // Mon / Wed / Fri
};

export const loadReminderPrefs = (): ReminderPrefs => {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_REMINDERS;
    const parsed = JSON.parse(raw) as Partial<ReminderPrefs>;
    return {
      enabled: parsed.enabled === true,
      hour: typeof parsed.hour === "number" ? parsed.hour : DEFAULT_REMINDERS.hour,
      minute: typeof parsed.minute === "number" ? parsed.minute : DEFAULT_REMINDERS.minute,
      days: Array.isArray(parsed.days)
        ? parsed.days.filter((d): d is number => typeof d === "number" && d >= 1 && d <= 7)
        : DEFAULT_REMINDERS.days,
    };
  } catch {
    return DEFAULT_REMINDERS;
  }
};

export const remindersSupported = (): boolean => Capacitor.isNativePlatform();

/** Persist prefs and reschedule to match. Returns false when the user has
    notifications denied at the OS level (the caller should say so). */
export const applyReminderPrefs = async (prefs: ReminderPrefs): Promise<boolean> => {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable — scheduling still proceeds */
  }
  if (!remindersSupported()) return false;

  // Always clear the previous schedule; stale weekday notifications from
  // an earlier configuration must never keep firing.
  await LocalNotifications.cancel({
    notifications: ALL_IDS.map((id) => ({ id })),
  }).catch(() => {});

  if (!prefs.enabled || prefs.days.length === 0) return true;

  const permission = await LocalNotifications.requestPermissions();
  if (permission.display !== "granted") return false;

  await LocalNotifications.schedule({
    notifications: prefs.days.map((day) => ({
      id: idForDay(day),
      title: "Time to train",
      body: "Your next session is ready — keep the streak alive.",
      schedule: {
        on: { weekday: day, hour: prefs.hour, minute: prefs.minute },
        repeats: true,
        allowWhileIdle: true,
      },
    })),
  });
  return true;
};
