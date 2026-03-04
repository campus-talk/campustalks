import { memo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff, Video, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface IncomingCallData {
  callId: string;
  callerId: string;
  callerName: string;
  callerAvatar: string | null;
  channelName: string;
  isVideo: boolean;
  conversationId: string;
}

interface IncomingCallModalJitsiProps {
  incomingCall: IncomingCallData | null;
  onAccept: () => void;
  onDecline: () => void;
}

const IncomingCallModalJitsi = memo(({
  incomingCall,
  onAccept,
  onDecline,
}: IncomingCallModalJitsiProps) => {
  const hasVibratedRef = useRef(false);

  // Vibrate on mobile when call comes in
  useEffect(() => {
    if (incomingCall && !hasVibratedRef.current) {
      hasVibratedRef.current = true;
      if ('vibrate' in navigator) {
        // Vibrate pattern: vibrate 500ms, pause 200ms, repeat
        const pattern = [500, 200, 500, 200, 500, 200, 500];
        navigator.vibrate(pattern);
      }
    }

    if (!incomingCall) {
      hasVibratedRef.current = false;
      // Stop vibration when call ends
      if ('vibrate' in navigator) {
        navigator.vibrate(0);
      }
    }
  }, [incomingCall]);

  if (!incomingCall) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-gradient-to-b from-[#1a1a2e] to-[#0f0f23] flex items-center justify-center p-4"
      >
        {/* Dismiss button */}
        <button
          onClick={onDecline}
          className="absolute top-6 right-6 text-white/50 hover:text-white/80 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>

        <motion.div
          initial={{ scale: 0.8, y: 50 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.8, y: 50 }}
          className="max-w-sm w-full text-center"
        >
          {/* Pulsing ring animation */}
          <div className="relative mx-auto w-36 h-36 mb-8">
            <motion.div
              animate={{ scale: [1, 1.3, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="absolute inset-0 rounded-full bg-green-500/30"
            />
            <motion.div
              animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0, 0.4] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: 0.2 }}
              className="absolute inset-0 rounded-full bg-green-500/20"
            />
            <motion.div
              animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: 0.4 }}
              className="absolute inset-0 rounded-full bg-green-500/10"
            />
            <Avatar className="w-36 h-36 border-4 border-green-500/50 shadow-2xl shadow-green-500/20">
              <AvatarImage src={incomingCall.callerAvatar || ''} />
              <AvatarFallback className="bg-gradient-to-br from-green-500 to-emerald-600 text-white text-5xl font-bold">
                {incomingCall.callerName?.charAt(0)}
              </AvatarFallback>
            </Avatar>
          </div>

          {/* Caller info */}
          <h2 className="text-3xl font-bold text-white mb-3">
            {incomingCall.callerName}
          </h2>
          <div className="flex items-center justify-center gap-2 text-white/70 mb-12">
            {incomingCall.isVideo ? (
              <>
                <Video className="w-5 h-5" />
                <span className="text-lg">Incoming Video Call</span>
              </>
            ) : (
              <>
                <Phone className="w-5 h-5" />
                <span className="text-lg">Incoming Voice Call</span>
              </>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-center gap-16">
            {/* Decline */}
            <div className="flex flex-col items-center gap-2">
              <motion.div 
                whileHover={{ scale: 1.1 }} 
                whileTap={{ scale: 0.95 }}
              >
                <Button
                  onClick={onDecline}
                  size="lg"
                  variant="destructive"
                  className="rounded-full w-16 h-16 p-0 shadow-lg shadow-destructive/50"
                >
                  <PhoneOff className="w-7 h-7" />
                </Button>
              </motion.div>
              <span className="text-white/60 text-sm">Decline</span>
            </div>

            {/* Accept */}
            <div className="flex flex-col items-center gap-2">
              <motion.div 
                whileHover={{ scale: 1.1 }} 
                whileTap={{ scale: 0.95 }}
                animate={{ 
                  boxShadow: [
                    '0 0 0 0 rgba(34, 197, 94, 0.4)',
                    '0 0 0 15px rgba(34, 197, 94, 0)',
                  ]
                }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="rounded-full"
              >
                <Button
                  onClick={onAccept}
                  size="lg"
                  className="rounded-full w-16 h-16 p-0 bg-green-500 hover:bg-green-600 shadow-lg shadow-green-500/50"
                >
                  {incomingCall.isVideo ? (
                    <Video className="w-7 h-7" />
                  ) : (
                    <Phone className="w-7 h-7" />
                  )}
                </Button>
              </motion.div>
              <span className="text-white/60 text-sm">Accept</span>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
});

IncomingCallModalJitsi.displayName = 'IncomingCallModalJitsi';

export default IncomingCallModalJitsi;
