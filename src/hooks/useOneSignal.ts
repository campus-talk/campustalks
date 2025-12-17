import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

declare global {
  interface Window {
    OneSignalDeferred?: any[];
    OneSignal?: any;
  }
}

const ONESIGNAL_APP_ID = "a8671653-d9f5-4c42-8feb-e9ed8ad2892e";

export const useOneSignal = () => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    const initOneSignal = async () => {
      // Only initialize on production domain
      const allowedDomains = ['campustalks.lovable.app', 'localhost'];
      const currentHost = window.location.hostname;
      
      if (!allowedDomains.some(domain => currentHost.includes(domain) || currentHost === domain)) {
        console.log("OneSignal: Skipping init on non-production domain");
        return;
      }

      // Check if user is logged in
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load OneSignal SDK
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
            notifyButton: {
              enable: false,
            },
            promptOptions: {
              slidedown: {
                prompts: [
                  {
                    type: "push",
                    autoPrompt: true,
                    text: {
                      actionMessage: "Campus Talks से notifications प्राप्त करें",
                      acceptButton: "Allow",
                      cancelButton: "Later",
                    },
                    delay: {
                      pageViews: 1,
                      timeDelay: 2,
                    },
                  },
                ],
              },
            },
          });

          // Login user with Supabase user ID as external user id
          await OneSignal.login(user.id);
          console.log("OneSignal initialized and user logged in:", user.id);
          
          // Check subscription status
          const isPushSupported = OneSignal.Notifications.isPushSupported();
          if (isPushSupported) {
            const permission = await OneSignal.Notifications.permission;
            setIsSubscribed(permission);
            
            // Request permission if not granted
            if (!permission) {
              await OneSignal.Notifications.requestPermission();
            }
          }
          
          setIsInitialized(true);
        } catch (error) {
          console.error("OneSignal initialization error:", error);
        }
      });
    };

    initOneSignal();

    // Cleanup on logout
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" && window.OneSignal) {
        window.OneSignal.logout();
        setIsSubscribed(false);
      } else if (event === "SIGNED_IN" && session?.user && window.OneSignal) {
        window.OneSignal.login(session.user.id);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return { isInitialized, isSubscribed };
};
