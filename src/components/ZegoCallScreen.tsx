import { useEffect, useRef, memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PhoneOff, Loader2, Video, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { CallState, ZegoCallConfig } from '@/hooks/useZegoCall';
import { ZEGO_APP_ID, getZegoToken } from '@/hooks/useZegoCall';

interface ZegoCallScreenProps {
  callConfig: ZegoCallConfig | null;
  callState: CallState;
  isVideoCall: boolean;
  currentUserId: string;
  onEndCall: () => void;
}

const ZegoCallScreen = memo(({
  callConfig,
  callState,
  isVideoCall,
  currentUserId,
  onEndCall,
}: ZegoCallScreenProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const zegoInstanceRef = useRef<any>(null);
  const [uikitReady, setUikitReady] = useState(false);

  // Initialize UIKit when call is accepted
  useEffect(() => {
    if (callState !== 'accepted' || !callConfig?.roomName || !currentUserId) return;

    let cancelled = false;

    const initUIKit = async () => {
      try {
        const { ZegoUIKitPrebuilt } = await import('@zegocloud/zego-uikit-prebuilt');

        if (cancelled) return;

        // Get server-generated token
        const token04 = await getZegoToken();

        if (cancelled) return;

        const kitToken = ZegoUIKitPrebuilt.generateKitTokenForProduction(
          ZEGO_APP_ID,
          token04,
          callConfig.roomName,
          currentUserId,
          callConfig.displayName || 'User'
        );

        if (cancelled || !containerRef.current) return;

        const zp = ZegoUIKitPrebuilt.create(kitToken);
        zegoInstanceRef.current = zp;

        const scenario = callConfig.isGroup
          ? ZegoUIKitPrebuilt.GroupCall
          : ZegoUIKitPrebuilt.OneONoneCall;

        zp.joinRoom({
          container: containerRef.current,
          scenario: { mode: scenario },
          turnOnMicrophoneWhenJoining: true,
          turnOnCameraWhenJoining: isVideoCall,
          showPreJoinView: false,
          showScreenSharingButton: true,
          showUserList: true,
          maxUsers: callConfig.isGroup ? 30 : 2,
          layout: 'Auto',
          showLayoutButton: true,
          onLeaveRoom: () => {
            onEndCall();
          },
          onUserLeave: (users: any[]) => {
            // If 1-on-1 call and the other user left, end call
            if (!callConfig.isGroup && users.length > 0) {
              onEndCall();
            }
          },
        });

        setUikitReady(true);
      } catch (error) {
        console.error('UIKit init error:', error);
      }
    };

    initUIKit();

    return () => {
      cancelled = true;
      if (zegoInstanceRef.current) {
        try {
          zegoInstanceRef.current.destroy();
        } catch (e) {
          console.log('UIKit cleanup:', e);
        }
        zegoInstanceRef.current = null;
      }
      setUikitReady(false);
    };
  }, [callState, callConfig?.roomName, currentUserId, callConfig?.displayName, callConfig?.isGroup, callConfig?.isVideoCall, isVideoCall, onEndCall]);

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

      {/* UIKit Container - shows after accepted */}
      <div
        ref={containerRef}
        className="flex-1 w-full h-full"
        style={{
          display: callState === 'accepted' ? 'block' : 'none',
        }}
      />

      {/* Loading overlay while UIKit initializes */}
      {callState === 'accepted' && !uikitReady && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0f0f23]">
          <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
          <span className="text-white/70 text-lg">Connecting...</span>
        </div>
      )}
    </motion.div>
  );
});

ZegoCallScreen.displayName = 'ZegoCallScreen';

export default ZegoCallScreen;
