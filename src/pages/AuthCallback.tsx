import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const isMedianApp = () =>
  typeof navigator !== "undefined" && navigator.userAgent.toLowerCase().includes("median");

const AuthCallback = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState("Completing sign-in…");

  useEffect(() => {
    const handle = async () => {
      try {
        // Supabase automatically exchanges the code/hash for a session
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          console.error("Auth callback error:", error.message);
          setStatus("Sign-in failed. Redirecting…");
          setTimeout(() => navigate("/auth"), 2000);
          return;
        }

        if (session && isMedianApp()) {
          // Deep-link back into the native Median app with the tokens
          const deepLink = `campustalks://auth-callback?access_token=${encodeURIComponent(
            session.access_token
          )}&refresh_token=${encodeURIComponent(session.refresh_token)}`;
          window.location.replace(deepLink);
          return;
        }

        if (session) {
          // Normal web — check profile completeness
          const { data: profile } = await supabase
            .from("profiles")
            .select("username")
            .eq("id", session.user.id)
            .single();

          navigate(profile?.username ? "/conversations" : "/profile-setup");
        } else {
          navigate("/auth");
        }
      } catch (e) {
        console.error("Auth callback exception:", e);
        navigate("/auth");
      }
    };

    handle();
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin rounded-full h-10 w-10 border-3 border-primary border-t-transparent" />
        <p className="text-muted-foreground text-sm">{status}</p>
      </div>
    </div>
  );
};

export default AuthCallback;
