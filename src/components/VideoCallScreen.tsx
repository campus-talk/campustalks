import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { PhoneOff, Mic, MicOff, Video, VideoOff, SwitchCamera, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VideoCallScreenProps {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onEndCall: () => void;
  onToggleCamera: () => void;
  onToggleMic: () => void;
  onSwitchCamera?: () => void;
  isCameraOn: boolean;
  isMicOn: boolean;
  isVideoCall: boolean;
}

const VideoCallScreen = ({
  localStream,
  remoteStream,
  onEndCall,
  onToggleCamera,
  onToggleMic,
  onSwitchCamera,
  isCameraOn,
  isMicOn,
  isVideoCall,
}: VideoCallScreenProps) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const [isLocalExpanded, setIsLocalExpanded] = useState(false);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
    // For audio calls, use audio element
    if (remoteAudioRef.current && remoteStream && !isVideoCall) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, isVideoCall]);

  const handleSwapVideos = () => {
    setIsLocalExpanded(!isLocalExpanded);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black z-50"
    >
      {/* Main Video Display */}
      {isVideoCall ? (
        <>
          <video
            ref={isLocalExpanded ? localVideoRef : remoteVideoRef}
            autoPlay
            playsInline
            muted={isLocalExpanded}
            className="w-full h-full object-cover"
          />
          
          {/* Floating Small Video */}
          <div 
            onClick={handleSwapVideos}
            className="absolute top-4 right-4 w-32 h-48 rounded-2xl overflow-hidden border-2 border-white/30 shadow-lg bg-black cursor-pointer hover:border-white/50 transition-all"
          >
            {isLocalExpanded ? (
              remoteStream && (
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
              )
            ) : (
              isCameraOn ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-900">
                  <VideoOff className="w-8 h-8 text-white" />
                </div>
              )
            )}
            <div className="absolute bottom-2 right-2 bg-black/50 rounded-full p-1">
              <Maximize2 className="w-4 h-4 text-white" />
            </div>
          </div>
        </>
      ) : (
        <>
          <audio ref={remoteAudioRef} autoPlay />
          <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
            <div className="text-center">
              <div className="w-32 h-32 rounded-full bg-primary/30 mx-auto mb-4 flex items-center justify-center">
                <Mic className="w-16 h-16 text-white" />
              </div>
              <p className="text-white text-lg">Audio Call</p>
            </div>
          </div>
        </>
      )}

      {/* Controls */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4">
        {isVideoCall && onSwitchCamera && (
          <Button
            onClick={onSwitchCamera}
            size="lg"
            variant="secondary"
            className="rounded-full w-14 h-14 p-0"
          >
            <SwitchCamera className="w-5 h-5" />
          </Button>
        )}

        {isVideoCall && (
          <Button
            onClick={onToggleCamera}
            size="lg"
            variant={isCameraOn ? "secondary" : "destructive"}
            className="rounded-full w-14 h-14 p-0"
          >
            {isCameraOn ? (
              <Video className="w-5 h-5" />
            ) : (
              <VideoOff className="w-5 h-5" />
            )}
          </Button>
        )}
        
        <Button
          onClick={onToggleMic}
          size="lg"
          variant={isMicOn ? "secondary" : "destructive"}
          className="rounded-full w-14 h-14 p-0"
        >
          {isMicOn ? (
            <Mic className="w-5 h-5" />
          ) : (
            <MicOff className="w-5 h-5" />
          )}
        </Button>

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
