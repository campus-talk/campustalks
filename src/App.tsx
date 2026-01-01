import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import { useOneSignal } from "@/hooks/useOneSignal";
import { supabase } from "@/integrations/supabase/client";

// Lazy load pages for better performance
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const ProfileSetup = lazy(() => import("./pages/ProfileSetup"));
const Home = lazy(() => import("./pages/Home"));
const Conversations = lazy(() => import("./pages/Conversations"));
const Chat = lazy(() => import("./pages/Chat"));
const Search = lazy(() => import("./pages/Search"));
const Settings = lazy(() => import("./pages/Settings"));
const Profile = lazy(() => import("./pages/Profile"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Groups = lazy(() => import("./pages/Groups"));
const Calls = lazy(() => import("./pages/Calls"));
const AISettings = lazy(() => import("./pages/AISettings"));
const MessageRequests = lazy(() => import("./pages/MessageRequests"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const LoadingScreen = () => (
  <div className="min-h-screen flex items-center justify-center geometric-pattern">
    <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent"></div>
  </div>
);

const App = () => {
  // Initialize OneSignal for push notifications
  useOneSignal();

  // Cleanup expired data after page load (deferred to not block critical path)
  useEffect(() => {
    const cleanup = async () => {
      try {
        await supabase.functions.invoke("cleanup-expired-data");
      } catch (e) {
        console.log("Cleanup skipped");
      }
    };
    // Defer cleanup to after page is interactive
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => cleanup(), { timeout: 5000 });
    } else {
      setTimeout(cleanup, 3000);
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<LoadingScreen />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/profile-setup" element={<ProfileSetup />} />
              <Route path="/conversations" element={<Conversations />} />
              <Route path="/home" element={<Home />} />
              <Route path="/search" element={<Search />} />
              <Route path="/profile/:userId" element={<Profile />} />
              <Route path="/chat/:conversationId" element={<Chat />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/settings/ai" element={<AISettings />} />
              <Route path="/groups" element={<Groups />} />
              <Route path="/calls" element={<Calls />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/message-requests" element={<MessageRequests />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
