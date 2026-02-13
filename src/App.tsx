import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import { useOneSignal } from "@/hooks/useOneSignal";
import { supabase } from "@/integrations/supabase/client";

// ZegoCloud SDK is imported dynamically when calls are initiated

// Persistent shell for main tabs - NOT lazy loaded
import AppShell from "@/components/layout/AppShell";
import ConversationsTab from "@/components/tabs/ConversationsTab";
import GroupsTab from "@/components/tabs/GroupsTab";
import CallsTab from "@/components/tabs/CallsTab";
import SettingsTab from "@/components/tabs/SettingsTab";

// Lazy load ONLY deep/secondary pages
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const ProfileSetup = lazy(() => import("./pages/ProfileSetup"));
const Home = lazy(() => import("./pages/Home"));
const Chat = lazy(() => import("./pages/Chat"));
const Search = lazy(() => import("./pages/Search"));
const Profile = lazy(() => import("./pages/Profile"));
const Notifications = lazy(() => import("./pages/Notifications"));
const AISettings = lazy(() => import("./pages/AISettings"));
const MessageRequests = lazy(() => import("./pages/MessageRequests"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

// Minimal loading fallback - only for lazy routes, not full screen
const LazyLoadFallback = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
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
          <Routes>
            {/* Public routes - lazy loaded with minimal fallback */}
            <Route path="/" element={<Suspense fallback={<LazyLoadFallback />}><Index /></Suspense>} />
            <Route path="/auth" element={<Suspense fallback={<LazyLoadFallback />}><Auth /></Suspense>} />
            <Route path="/profile-setup" element={<Suspense fallback={<LazyLoadFallback />}><ProfileSetup /></Suspense>} />
            <Route path="/home" element={<Suspense fallback={<LazyLoadFallback />}><Home /></Suspense>} />

            {/* Main app shell with persistent tabs - NO lazy loading, NO Suspense */}
            <Route element={<AppShell />}>
              <Route path="/conversations" element={<ConversationsTab />} />
              <Route path="/groups" element={<GroupsTab />} />
              <Route path="/calls" element={<CallsTab />} />
              <Route path="/settings" element={<SettingsTab />} />
            </Route>

            {/* Deep routes - lazy loaded */}
            <Route path="/chat/:conversationId" element={<Suspense fallback={<LazyLoadFallback />}><Chat /></Suspense>} />
            <Route path="/search" element={<Suspense fallback={<LazyLoadFallback />}><Search /></Suspense>} />
            <Route path="/profile/:userId" element={<Suspense fallback={<LazyLoadFallback />}><Profile /></Suspense>} />
            <Route path="/settings/ai" element={<Suspense fallback={<LazyLoadFallback />}><AISettings /></Suspense>} />
            <Route path="/notifications" element={<Suspense fallback={<LazyLoadFallback />}><Notifications /></Suspense>} />
            <Route path="/message-requests" element={<Suspense fallback={<LazyLoadFallback />}><MessageRequests /></Suspense>} />
            
            {/* Catch-all */}
            <Route path="*" element={<Suspense fallback={<LazyLoadFallback />}><NotFound /></Suspense>} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
