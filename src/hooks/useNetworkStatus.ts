import { useState, useEffect, useCallback } from "react";

interface NetworkStatus {
  isOnline: boolean;
  isSyncing: boolean;
}

export const useNetworkStatus = () => {
  const [status, setStatus] = useState<NetworkStatus>({
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
    isSyncing: false,
  });

  const setSyncing = useCallback((syncing: boolean) => {
    setStatus(prev => ({ ...prev, isSyncing: syncing }));
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setStatus(prev => ({ ...prev, isOnline: true, isSyncing: true }));
      // Auto-clear syncing after a short delay
      setTimeout(() => setSyncing(false), 2000);
    };

    const handleOffline = () => {
      setStatus(prev => ({ ...prev, isOnline: false, isSyncing: false }));
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [setSyncing]);

  return { ...status, setSyncing };
};
