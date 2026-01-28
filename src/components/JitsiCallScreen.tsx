import { useEffect, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PhoneOff, Mic, MicOff, Video, VideoOff, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface JitsiCallScreenProps {
  callConfig: {
    roomName: string;
    displayName: string;
    avatarUrl?: string;
    isVideoCall: boolean;
  } | null;
  isMicOn: boolean;
  isCameraOn: boolean;
  isVideoCall: boolean;
  onEndCall: () => void;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onInitialize: (container: HTMLDivElement) => void;
}

const JitsiCallScreen = memo(({
  callConfig,
  isMicOn,
  isCameraOn,
  isVideoCall,
  onEndCall,
  onToggleMic,
  onToggleCamera,
  onInitialize,
}: JitsiCallScreenProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (containerRef.current && callConfig && !initializedRef.current) {
      initializedRef.current = true;
      // Small delay to ensure container is ready
      setTimeout(() => {
        if (containerRef.current) {
          onInitialize(containerRef.current);
        }
      }, 100);
    }

    return () => {
      initializedRef.current = false;
    };
  }, [callConfig, onInitialize]);

  if (!callConfig) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-background z-50 flex flex-col"
    >
      {/* Jitsi Container */}
      <div 
        ref={containerRef}
        className="flex-1 w-full bg-slate-900"
        style={{ minHeight: '70vh' }}
      />

      {/* Custom Controls Overlay */}
      <motion.div 
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="absolute bottom-0 left-0 right-0 pb-10 pt-8 px-4 bg-gradient-to-t from-black/90 via-black/60 to-transparent"
      >
        <div className="flex items-center justify-center gap-5 max-w-sm mx-auto">
          {isVideoCall && (
            <Button
              onClick={onToggleCamera}
              size="lg"
              variant={isCameraOn ? "secondary" : "destructive"}
              className={`rounded-full w-14 h-14 p-0 ${isCameraOn ? 'bg-white/20 hover:bg-white/30 border-0 backdrop-blur-sm' : ''}`}
            >
              {isCameraOn ? (
                <Video className="w-6 h-6 text-white" />
              ) : (
                <VideoOff className="w-6 h-6" />
              )}
            </Button>
          )}
          
          <Button
            onClick={onToggleMic}
            size="lg"
            variant={isMicOn ? "secondary" : "destructive"}
            className={`rounded-full w-14 h-14 p-0 ${isMicOn ? 'bg-white/20 hover:bg-white/30 border-0 backdrop-blur-sm' : ''}`}
          >
            {isMicOn ? (
              <Mic className="w-6 h-6 text-white" />
            ) : (
              <MicOff className="w-6 h-6" />
            )}
          </Button>

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

      {/* Call Info Badge */}
      <motion.div 
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="absolute top-4 left-4 bg-black/40 backdrop-blur-sm rounded-full px-4 py-2 z-10"
      >
        <span className="text-white text-sm font-medium">
          {isVideoCall ? "Video Call" : "Audio Call"} • {callConfig.displayName}
        </span>
      </motion.div>
    </motion.div>
  );
});

JitsiCallScreen.displayName = 'JitsiCallScreen';

export default JitsiCallScreen;
