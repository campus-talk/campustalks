import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { restoreSessionFromDeepLink } from "@/lib/median";

const Index = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Safety timeout - if auth check takes too long, redirect to auth page
    const timeout = setTimeout(() => {
      console.warn("Auth check timed out, redirecting to auth");
      setError(true);
      navigate("/auth");
    }, 8000);

    const checkAuth = async () => {
      try {
        // Try restoring session from deep link tokens first
        await restoreSessionFromDeepLink(supabase);

        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error("Session error:", sessionError);
          clearTimeout(timeout);
          navigate("/auth");
          return;
        }

        if (session) {
          // Check if profile is complete
          const { data: profile } = await supabase
            .from("profiles")
            .select("username")
            .eq("id", session.user.id)
            .single();

          clearTimeout(timeout);
          if (!profile?.username) {
            navigate("/profile-setup");
          } else {
            navigate("/conversations");
          }
        } else {
          clearTimeout(timeout);
          navigate("/auth");
        }
      } catch (err) {
        console.error("Auth check failed:", err);
        clearTimeout(timeout);
        navigate("/auth");
      } finally {
        setLoading(false);
      }
    };

    checkAuth();

    return () => clearTimeout(timeout);
  }, []);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground text-sm">Loading took too long</p>
          <button 
            onClick={() => window.location.reload()}
            className="text-primary text-sm font-medium"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center geometric-pattern">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent"></div>
    </div>
  );
};

export default Index;
