import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
      // Check if profile is complete
      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", session.user.id)
        .single();

      if (!profile?.username) {
        navigate("/profile-setup");
      } else {
        navigate("/conversations");
      }
    } else {
      navigate("/auth");
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center geometric-pattern">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent"></div>
    </div>
  );
};

export default Index;
