/** Detect if the app is running inside a Median.co native webview */
export const isMedianApp = (): boolean =>
  typeof navigator !== "undefined" &&
  (navigator.userAgent.toLowerCase().includes("median") ||
    typeof (window as any).median !== "undefined");

/** Restore a session from a deep-link token (campustalks://auth-callback?access_token=…) */
export const restoreSessionFromDeepLink = async (
  supabase: any
): Promise<boolean> => {
  if (!isMedianApp()) return false;

  const params = new URLSearchParams(window.location.search);
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");

  if (accessToken && refreshToken) {
    try {
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) {
        console.error("Failed to restore session from deep link:", error);
        return false;
      }
      // Clean the URL so tokens aren't visible
      window.history.replaceState({}, "", window.location.pathname);
      return true;
    } catch (e) {
      console.error("Error restoring session:", e);
      return false;
    }
  }
  return false;
};
