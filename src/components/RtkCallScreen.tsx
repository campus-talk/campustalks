import { useEffect, useRef, memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PhoneOff, Loader2, Video, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { CallState, CallConfig } from '@/hooks/useRealtimeKitCall';
import { getRtkToken } from '@/hooks/useRealtimeKitCall';

interface RtkCallScreenProps {
  callConfig: CallConfig | null;
  callState: CallState;
  isVideoCall: boolean;
  currentUserId: string;
  onEndCall: () => void;
}

const RtkCallScreen = memo(({
  callConfig,
  callState,
  isVideoCall,
  currentUserId,
  onEndCall,
}: RtkCallScreenProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const meetingRef = useRef<any>(null);
  const [uikitReady, setUikitReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  // Initialize RTK when call is accepted
  useEffect(() => {
    if (callState !== 'accepted' || !callConfig?.roomName || !currentUserId) return;

    let cancelled = false;

    const initRtk = async () => {
      try {
        setInitError(null);
        
        // Get RTK auth token from our edge function
        const { authToken } = await getRtkToken(
          callConfig.roomName,
          callConfig.displayName || 'User',
          isVideoCall
        );

        if (cancelled) return;

        // Dynamically import RTK React SDK
        const { useRealtimeKitClient } = await import('@cloudflare/realtimekit-react');
        const { RtkMeeting } = await import('@cloudflare/realtimekit-react-ui');

        if (cancelled || !containerRef.current) return;

        // For non-React hook usage, we use the web SDK directly
        const RealtimeKitClient = (await import('@cloudflare/realtimekit-react')).default;
        
        // Initialize meeting with authToken
        // Since we can't use hooks outside React components, we use the imperative API
        const meetingInstance = await (window as any).__rtkInit?.(authToken);
        
        if (meetingInstance) {
          meetingRef.current = meetingInstance;
          setUikitReady(true);
        }
      } catch (error: any) {
        console.error('RTK init error:', error);
        setInitError(error.message || 'Failed to connect');
      }
    };

    initRtk();

    return () => {
      cancelled = true;
      if (meetingRef.current) {
        try {
          meetingRef.current.leaveRoom?.();
        } catch (e) {
          console.log('RTK cleanup:', e);
        }
        meetingRef.current = null;
      }
      setUikitReady(false);
      setInitError(null);
    };
  }, [callState, callConfig?.roomName, currentUserId, callConfig?.displayName, isVideoCall, onEndCall]);

  if (!callConfig) return null;

  const isWaitingForAnswer = callState === 'calling' || callState === 'ringing';

  const getCallStatusText = () => {
    switch (callState) {
      case 'calling': return 'Calling...';
      case 'ringing': return 'Ringing...';
      case 'accepted': return uikitReady ? '' : 'Connecting...';
      default: return '';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-[#0f0f23] z-50 flex flex-col"
    >
      {/* Waiting/Ringing UI */}
      <AnimatePresence>
        {isWaitingForAnswer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gradient-to-b from-[#1a1a2e] to-[#0f0f23]"
          >
            <div className="relative mb-8">
              <motion.div
                animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute inset-0 rounded-full bg-primary/40"
                style={{ margin: '-20px' }}
              />
              <motion.div
                animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0, 0.3] }}
                transition={{ duration: 2, repeat: Infinity, delay: 0.3 }}
                className="absolute inset-0 rounded-full bg-primary/25"
                style={{ margin: '-40px' }}
              />
              <Avatar className="w-32 h-32 border-4 border-primary/50 shadow-2xl">
                <AvatarImage src={callConfig.avatarUrl || ''} />
                <AvatarFallback className="bg-gradient-to-br from-primary to-purple-600 text-white text-4xl font-bold">
                  {callConfig.displayName?.charAt(0)}
                </AvatarFallback>
              </Avatar>
            </div>

            <h2 className="text-2xl font-bold text-white mb-2">{callConfig.displayName}</h2>
            <div className="flex items-center gap-2 text-white/70">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-lg">{getCallStatusText()}</span>
            </div>

            <div className="mt-6 flex items-center gap-2 px-4 py-2 rounded-full bg-white/10">
              {isVideoCall ? <Video className="w-5 h-5 text-white" /> : <Mic className="w-5 h-5 text-white" />}
              <span className="text-white/80 text-sm">
                {isVideoCall ? 'Video Call' : 'Voice Call'}
              </span>
            </div>

            <div className="mt-12">
              <Button
                onClick={onEndCall}
                size="lg"
                variant="destructive"
                className="rounded-full w-16 h-16 p-0 shadow-lg shadow-destructive/40"
              >
                <PhoneOff className="w-7 h-7" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* RTK Meeting Container - shows after accepted */}
      <div
        ref={containerRef}
        id="rtk-meeting-container"
        className="flex-1 w-full h-full"
        style={{
          display: callState === 'accepted' ? 'block' : 'none',
        }}
      />

      {/* Error state */}
      {initError && callState === 'accepted' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0f0f23]">
          <p className="text-destructive text-lg mb-4">{initError}</p>
          <Button onClick={onEndCall} variant="destructive" className="rounded-full">
            <PhoneOff className="w-5 h-5 mr-2" />
            End Call
          </Button>
        </div>
      )}

      {/* Loading overlay while RTK initializes */}
      {callState === 'accepted' && !uikitReady && !initError && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0f0f23]">
          <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
          <span className="text-white/70 text-lg">Connecting...</span>
        </div>
      )}
    </motion.div>
  );
});

RtkCallScreen.displayName = 'RtkCallScreen';

export default RtkCallScreen;
