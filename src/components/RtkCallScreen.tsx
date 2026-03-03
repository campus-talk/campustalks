import { useEffect, memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PhoneOff, Loader2, Video, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { CallState, CallConfig } from '@/hooks/useRealtimeKitCall';
import { getRtkToken } from '@/hooks/useRealtimeKitCall';
import { useRealtimeKitClient, RealtimeKitProvider } from '@cloudflare/realtimekit-react';
import { RtkMeeting } from '@cloudflare/realtimekit-react-ui';

interface RtkCallScreenProps {
  callConfig: CallConfig | null;
  callState: CallState;
  isVideoCall: boolean;
  currentUserId: string;
  onEndCall: () => void;
}

/** Inner component that renders the actual RTK meeting UI */
const RtkMeetingView = memo(({ meeting, onEndCall }: { meeting: any; onEndCall: () => void }) => {
  useEffect(() => {
    if (!meeting) return;

    const handleRoomLeft = () => {
      onEndCall();
    };

    meeting.self?.on?.('roomLeft', handleRoomLeft);
    
    return () => {
      meeting.self?.off?.('roomLeft', handleRoomLeft);
    };
  }, [meeting, onEndCall]);

  if (!meeting) return null;

  return (
    <RealtimeKitProvider value={meeting}>
      <RtkMeeting
        meeting={meeting}
        mode="fill"
        showSetupScreen={false}
      />
    </RealtimeKitProvider>
  );
});

RtkMeetingView.displayName = 'RtkMeetingView';

const RtkCallScreen = memo(({
  callConfig,
  callState,
  isVideoCall,
  currentUserId,
  onEndCall,
}: RtkCallScreenProps) => {
  const [meeting, initMeeting] = useRealtimeKitClient();
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

        // Initialize the meeting with the authToken
        await initMeeting({
          authToken,
          defaults: {
            audio: true,
            video: isVideoCall,
          },
        });

        if (!cancelled) {
          setUikitReady(true);
        }
      } catch (error: any) {
        console.error('RTK init error:', error);
        if (!cancelled) {
          setInitError(error.message || 'Failed to connect');
        }
      }
    };

    initRtk();

    return () => {
      cancelled = true;
      // Leave room on cleanup
      if (meeting) {
        try {
          meeting.leaveRoom?.();
        } catch (e) {
          console.log('RTK cleanup:', e);
        }
      }
      setUikitReady(false);
      setInitError(null);
    };
  }, [callState, callConfig?.roomName, currentUserId, callConfig?.displayName, isVideoCall]);

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
      className="fixed inset-0 bg-background z-50 flex flex-col"
    >
      {/* Waiting/Ringing UI */}
      <AnimatePresence>
        {isWaitingForAnswer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gradient-to-b from-muted to-background"
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
                <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-primary-foreground text-4xl font-bold">
                  {callConfig.displayName?.charAt(0)}
                </AvatarFallback>
              </Avatar>
            </div>

            <h2 className="text-2xl font-bold text-foreground mb-2">{callConfig.displayName}</h2>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-lg">{getCallStatusText()}</span>
            </div>

            <div className="mt-6 flex items-center gap-2 px-4 py-2 rounded-full bg-muted">
              {isVideoCall ? <Video className="w-5 h-5 text-foreground" /> : <Mic className="w-5 h-5 text-foreground" />}
              <span className="text-muted-foreground text-sm">
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

      {/* RTK Meeting - shows after accepted and initialized */}
      {callState === 'accepted' && uikitReady && meeting && (
        <div className="flex-1 w-full h-full">
          <RtkMeetingView meeting={meeting} onEndCall={onEndCall} />
        </div>
      )}

      {/* Error state */}
      {initError && callState === 'accepted' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background">
          <p className="text-destructive text-lg mb-4">{initError}</p>
          <Button onClick={onEndCall} variant="destructive" className="rounded-full">
            <PhoneOff className="w-5 h-5 mr-2" />
            End Call
          </Button>
        </div>
      )}

      {/* Loading overlay while RTK initializes */}
      {callState === 'accepted' && !uikitReady && !initError && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background">
          <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
          <span className="text-muted-foreground text-lg">Connecting...</span>
        </div>
      )}
    </motion.div>
  );
});

RtkCallScreen.displayName = 'RtkCallScreen';

export default RtkCallScreen;
