import { useEffect, useRef, memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  PhoneOff, 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  Monitor,
  MonitorOff,
  Users,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { CallState } from '@/hooks/useJitsiCall';

interface JitsiCallScreenProps {
  callConfig: {
    roomName: string;
    displayName: string;
    avatarUrl?: string;
    isVideoCall: boolean;
    isGroup?: boolean;
  } | null;
  callState: CallState;
  isMicOn: boolean;
  isCameraOn: boolean;
  isVideoCall: boolean;
  isScreenSharing: boolean;
  formattedDuration: string;
  onEndCall: () => void;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onInvite?: () => void;
  onInitialize: (container: HTMLDivElement) => void;
}

const JitsiCallScreen = memo(({
  callConfig,
  callState,
  isMicOn,
  isCameraOn,
  isVideoCall,
  isScreenSharing,
  formattedDuration,
  onEndCall,
  onToggleMic,
  onToggleCamera,
  onToggleScreenShare,
  onInvite,
  onInitialize,
}: JitsiCallScreenProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const [showControls, setShowControls] = useState(true);

  // Initialize Jitsi ONLY when call is accepted
  useEffect(() => {
    if (containerRef.current && callConfig && callState === 'accepted' && !initializedRef.current) {
      initializedRef.current = true;
      console.log('🎥 JitsiCallScreen: Initializing Jitsi (call accepted)');
      setTimeout(() => {
        if (containerRef.current) {
          onInitialize(containerRef.current);
        }
      }, 100);
    }

    // Reset flag when call ends
    if (callState === 'idle' || callState === 'ended') {
      initializedRef.current = false;
    }
  }, [callConfig, callState, onInitialize]);

  // Auto-hide controls after 5 seconds when connected
  useEffect(() => {
    if (callState === 'accepted') {
      const timer = setTimeout(() => setShowControls(false), 5000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [callState, showControls]);

  if (!callConfig) return null;

  // Show waiting UI for calling/ringing states
  const isWaitingForAnswer = callState === 'calling' || callState === 'ringing';

  const getCallStatusText = () => {
    switch (callState) {
      case 'calling': return 'Calling...';
      case 'ringing': return 'Ringing...';
      case 'accepted': return formattedDuration || 'Connecting...';
      default: return '';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-[#0f0f23] z-50 flex flex-col"
      onClick={() => setShowControls(true)}
    >
      {/* Waiting UI - Shown before call is accepted */}
      <AnimatePresence>
        {isWaitingForAnswer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gradient-to-b from-[#1a1a2e] to-[#0f0f23]"
          >
            {/* Pulsing avatar */}
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

            {/* User name and status */}
            <h2 className="text-2xl font-bold text-white mb-2">
              {callConfig.displayName}
            </h2>
            <div className="flex items-center gap-2 text-white/70">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-lg">{getCallStatusText()}</span>
            </div>

            {/* Call type indicator */}
            <div className="mt-6 flex items-center gap-2 px-4 py-2 rounded-full bg-white/10">
              {isVideoCall ? (
                <Video className="w-5 h-5 text-white" />
              ) : (
                <Mic className="w-5 h-5 text-white" />
              )}
              <span className="text-white/80 text-sm">
                {isVideoCall ? 'Video Call' : 'Voice Call'}
              </span>
            </div>

            {/* End call button during waiting */}
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

      {/* Jitsi Container - Only visible after accepted */}
      <div 
        ref={containerRef}
        className={`flex-1 w-full transition-opacity duration-300 ${isWaitingForAnswer ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        style={{ minHeight: '70vh' }}
      />

      {/* Custom Controls Overlay - Only after accepted */}
      <AnimatePresence>
        {(showControls && callState === 'accepted') && (
          <motion.div 
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            transition={{ type: 'spring', damping: 25 }}
            className="absolute bottom-0 left-0 right-0 pb-10 pt-20 px-4 bg-gradient-to-t from-black/95 via-black/70 to-transparent"
          >
            {/* Call duration */}
            <div className="text-center mb-6">
              <span className="text-white/80 text-sm font-medium bg-white/10 px-3 py-1 rounded-full">
                {formattedDuration}
              </span>
            </div>

            {/* Control buttons */}
            <div className="flex items-center justify-center gap-4 max-w-md mx-auto">
              {/* Screen share */}
              <Button
                onClick={onToggleScreenShare}
                size="lg"
                variant="ghost"
                className={`rounded-full w-14 h-14 p-0 ${
                  isScreenSharing 
                    ? 'bg-primary text-white' 
                    : 'bg-white/15 hover:bg-white/25 text-white border-0 backdrop-blur-sm'
                }`}
                title="Share Screen"
              >
                {isScreenSharing ? <MonitorOff className="w-6 h-6" /> : <Monitor className="w-6 h-6" />}
              </Button>

              {/* Camera toggle - video calls only */}
              {isVideoCall && (
                <Button
                  onClick={onToggleCamera}
                  size="lg"
                  variant="ghost"
                  className={`rounded-full w-14 h-14 p-0 ${
                    isCameraOn 
                      ? 'bg-white/15 hover:bg-white/25 text-white border-0 backdrop-blur-sm' 
                      : 'bg-destructive hover:bg-destructive/90 text-white'
                  }`}
                >
                  {isCameraOn ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
                </Button>
              )}
              
              {/* Mic toggle */}
              <Button
                onClick={onToggleMic}
                size="lg"
                variant="ghost"
                className={`rounded-full w-14 h-14 p-0 ${
                  isMicOn 
                    ? 'bg-white/15 hover:bg-white/25 text-white border-0 backdrop-blur-sm' 
                    : 'bg-destructive hover:bg-destructive/90 text-white'
                }`}
              >
                {isMicOn ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
              </Button>

              {/* End call */}
              <Button
                onClick={onEndCall}
                size="lg"
                variant="destructive"
                className="rounded-full w-16 h-16 p-0 shadow-lg shadow-destructive/40"
              >
                <PhoneOff className="w-7 h-7" />
              </Button>

              {/* Invite users - group calls */}
              {callConfig.isGroup && onInvite && (
                <Button
                  onClick={onInvite}
                  size="lg"
                  variant="ghost"
                  className="rounded-full w-14 h-14 p-0 bg-white/15 hover:bg-white/25 text-white border-0 backdrop-blur-sm"
                  title="Invite Users"
                >
                  <Users className="w-6 h-6" />
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top bar - call info */}
      <motion.div 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="absolute top-4 left-4 right-4 flex items-center justify-between z-30 pointer-events-none"
      >
        <div className="bg-black/50 backdrop-blur-sm rounded-full px-4 py-2">
          <span className="text-white text-sm font-medium">
            {isVideoCall ? '📹' : '🔊'} {callConfig.displayName}
          </span>
        </div>

        {isScreenSharing && (
          <div className="bg-primary/90 backdrop-blur-sm rounded-full px-4 py-2">
            <span className="text-white text-sm font-medium flex items-center gap-2">
              <Monitor className="w-4 h-4" />
              Sharing Screen
            </span>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
});

JitsiCallScreen.displayName = 'JitsiCallScreen';

export default JitsiCallScreen;
