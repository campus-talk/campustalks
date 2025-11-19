import { Phone, PhoneOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

interface IncomingCallModalProps {
  isOpen: boolean;
  callerName: string;
  callerAvatar: string | null;
  onAccept: () => void;
  onDecline: () => void;
}

const IncomingCallModal = ({
  isOpen,
  callerName,
  callerAvatar,
  onAccept,
  onDecline,
}: IncomingCallModalProps) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="glass-effect rounded-3xl p-8 text-center max-w-sm w-full mx-4"
          >
            <Avatar className="w-24 h-24 mx-auto mb-6 border-4 border-primary/20">
              <AvatarImage src={callerAvatar || ""} />
              <AvatarFallback className="bg-gradient-primary text-white text-3xl">
                {callerName.charAt(0)}
              </AvatarFallback>
            </Avatar>

            <h2 className="text-2xl font-bold mb-2">{callerName}</h2>
            <p className="text-muted-foreground mb-8">Incoming video call...</p>

            <div className="flex gap-4 justify-center">
              <Button
                onClick={onDecline}
                size="lg"
                variant="destructive"
                className="rounded-full w-16 h-16 p-0"
              >
                <PhoneOff className="w-6 h-6" />
              </Button>
              <Button
                onClick={onAccept}
                size="lg"
                className="rounded-full w-16 h-16 p-0 gradient-primary hover:gradient-primary-hover"
              >
                <Phone className="w-6 h-6" />
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default IncomingCallModal;
