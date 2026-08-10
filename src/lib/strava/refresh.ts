import { supabase } from "@/lib/supabase";

export type StravaFetchResult = {
  inserted: number;
  total_seen: number;
};

/**
 * Trigger the strava-fetch-activities Edge Function for the current user.
 * Caller is responsible for refreshing the captured sessions context after.
 */
export const fetchStravaActivities = async (): Promise<StravaFetchResult> => {
  const { data, error } = await supabase.functions.invoke("strava-fetch-activities", {
    body: {},
  });
  if (error) throw error;
  return data as StravaFetchResult;
};
