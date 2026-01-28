import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface IncomingCallModalJitsiProps {
  incomingCall: {
    callerId: string;
    callerName: string;
    callerAvatar: string | null;
    isVideo: boolean;
  } | null;
  onAccept: () => void;
  onDecline: () => void;
}

const IncomingCallModalJitsi = ({
  incomingCall,
  onAccept,
  onDecline,
}: IncomingCallModalJitsiProps) => {
  if (!incomingCall) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.8, y: 50 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.8, y: 50 }}
          className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl border border-white/10"
        >
          {/* Pulsing ring animation */}
          <div className="relative mx-auto w-32 h-32 mb-6">
            <motion.div
              animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute inset-0 rounded-full bg-primary/30"
            />
            <motion.div
              animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0, 0.3] }}
              transition={{ duration: 2, repeat: Infinity, delay: 0.3 }}
              className="absolute inset-0 rounded-full bg-primary/20"
            />
            <Avatar className="w-32 h-32 border-4 border-primary/50 shadow-xl">
              <AvatarImage src={incomingCall.callerAvatar || ''} />
              <AvatarFallback className="bg-primary text-white text-4xl">
                {incomingCall.callerName?.charAt(0)}
              </AvatarFallback>
            </Avatar>
          </div>

          <h2 className="text-2xl font-bold text-white mb-2">
            {incomingCall.callerName}
          </h2>
          <p className="text-white/70 mb-8 flex items-center justify-center gap-2">
            {incomingCall.isVideo ? (
              <>
                <Video className="w-5 h-5" />
                Incoming Video Call
              </>
            ) : (
              <>
                <Phone className="w-5 h-5" />
                Incoming Voice Call
              </>
            )}
          </p>

          <div className="flex items-center justify-center gap-8">
            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
              <Button
                onClick={onDecline}
                size="lg"
                variant="destructive"
                className="rounded-full w-16 h-16 p-0 shadow-lg shadow-destructive/50"
              >
                <PhoneOff className="w-7 h-7" />
              </Button>
            </motion.div>

            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
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
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default IncomingCallModalJitsi;
