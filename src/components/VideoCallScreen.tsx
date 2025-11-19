import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VideoCallScreenProps {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onEndCall: () => void;
}

const VideoCallScreen = ({
  localStream,
  remoteStream,
  onEndCall,
}: VideoCallScreenProps) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black z-50"
    >
      {/* Remote Video (Full Screen) */}
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        className="w-full h-full object-cover"
      />

      {/* Local Video (Floating) */}
      <div className="absolute top-4 right-4 w-32 h-48 rounded-2xl overflow-hidden border-2 border-white/30 shadow-lg">
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
      </div>

      {/* Controls */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
        <Button
          onClick={onEndCall}
          size="lg"
          variant="destructive"
          className="rounded-full w-16 h-16 p-0"
        >
          <PhoneOff className="w-6 h-6" />
        </Button>
      </div>
    </motion.div>
  );
};

export default VideoCallScreen;
