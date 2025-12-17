import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

declare global {
  interface Window {
    OneSignalDeferred?: any[];
    OneSignal?: any;
    median?: {
      onesignal?: {
        register: () => void;
        info: () => Promise<{ userId?: string; pushToken?: string; subscribed?: boolean }>;
        externalUserId: {
          set: (userId: string) => void;
          remove: () => void;
        };
        tags: {
          set: (tags: Record<string, string>) => void;
        };
      };
    };
  }
}

const ONESIGNAL_APP_ID = "a8671653-d9f5-4c42-8feb-e9ed8ad2892e";

// Detect if running in Median.co WebView
const isMedianApp = () => {
  return typeof window.median !== 'undefined' || 
         navigator.userAgent.includes('median') ||
         navigator.userAgent.includes('gonative');
};

export const useOneSignal = () => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    const initOneSignal = async () => {
      // Check if user is logged in
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // If running in Median.co WebView
      if (isMedianApp() && window.median?.onesignal) {
        console.log("OneSignal: Initializing for Median.co app");
        try {
          // Register for push notifications
          window.median.onesignal.register();
          
          // Set external user ID for targeting
          window.median.onesignal.externalUserId.set(user.id);
          
          // Set user tags
          window.median.onesignal.tags.set({
            user_id: user.id,
            platform: 'android'
          });
          
          // Get subscription info
          const info = await window.median.onesignal.info();
          console.log("Median OneSignal info:", info);
          
          setIsSubscribed(info?.subscribed || false);
          setIsInitialized(true);
        } catch (error) {
          console.error("Median OneSignal error:", error);
        }
        return;
      }

      // For web browser - only on allowed domains
      const allowedDomains = ['campustalks.lovable.app', 'localhost'];
      const currentHost = window.location.hostname;
      
      if (!allowedDomains.some(domain => currentHost.includes(domain) || currentHost === domain)) {
        console.log("OneSignal: Skipping init on non-production domain");
        return;
      }

      // Load OneSignal SDK for web
      if (!window.OneSignalDeferred) {
        window.OneSignalDeferred = [];
        const script = document.createElement("script");
        script.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
        script.defer = true;
        document.head.appendChild(script);
      }

      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(async (OneSignal: any) => {
        try {
          await OneSignal.init({
            appId: ONESIGNAL_APP_ID,
            allowLocalhostAsSecureOrigin: true,
            serviceWorkerParam: { scope: "/" },
            serviceWorkerPath: "/OneSignalSDKWorker.js",
            notifyButton: { enable: false },
            promptOptions: {
              slidedown: {
                prompts: [{
                  type: "push",
                  autoPrompt: true,
                  text: {
                    actionMessage: "Campus Talks से notifications प्राप्त करें",
                    acceptButton: "Allow",
                    cancelButton: "Later",
                  },
                  delay: { pageViews: 1, timeDelay: 2 },
                }],
              },
            },
          });

          // Login user with Supabase user ID
          await OneSignal.login(user.id);
          console.log("OneSignal initialized for web:", user.id);
          
          const isPushSupported = OneSignal.Notifications.isPushSupported();
          if (isPushSupported) {
            const permission = await OneSignal.Notifications.permission;
            setIsSubscribed(permission);
            
            if (!permission) {
              await OneSignal.Notifications.requestPermission();
            }
          }
          
          setIsInitialized(true);
        } catch (error) {
          console.error("OneSignal web initialization error:", error);
        }
      });
    };

    initOneSignal();

    // Handle auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        if (isMedianApp() && window.median?.onesignal) {
          window.median.onesignal.externalUserId.remove();
        } else if (window.OneSignal) {
          window.OneSignal.logout();
        }
        setIsSubscribed(false);
      } else if (event === "SIGNED_IN" && session?.user) {
        if (isMedianApp() && window.median?.onesignal) {
          window.median.onesignal.externalUserId.set(session.user.id);
        } else if (window.OneSignal) {
          window.OneSignal.login(session.user.id);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return { isInitialized, isSubscribed };
};