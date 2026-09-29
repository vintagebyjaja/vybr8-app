/**
 * Activity sources for Active Vybe. Apple HealthKit and Android Health Connect are native-only;
 * the web app supports manual entry now and gains these through a future native shell.
 * There is intentionally no fake web implementation.
 */
export type ActivitySourceId = "manual" | "healthkit" | "health_connect";

export type DailyActivity = {
  date: string; // YYYY-MM-DD in the user's timezone
  steps?: number;
  distanceMeters?: number;
  activeEnergyKcal?: number;
  workoutMinutes?: number;
  source: ActivitySourceId;
};

export interface ActivitySource {
  readonly id: ActivitySourceId;
  readonly availableOnWeb: boolean;
  requestPermission(): Promise<"granted" | "denied" | "unavailable">;
  readDay(date: string): Promise<DailyActivity | null>;
}

export const unavailableNativeSource = (id: Exclude<ActivitySourceId, "manual">): ActivitySource => ({
  id,
  availableOnWeb: false,
  async requestPermission() {
    return "unavailable";
  },
  async readDay() {
    return null;
  },
});
