import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PhoneOff, Mic, MicOff, Video, VideoOff, SwitchCamera, Maximize2, Minimize2, UserPlus, X, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Participant {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

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
  onAddParticipant?: (userId: string) => void;
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
  onAddParticipant,
}: VideoCallScreenProps) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const [isLocalExpanded, setIsLocalExpanded] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Participant[]>([]);
  const [searching, setSearching] = useState(false);
  const { toast } = useToast();

  // Set local video stream
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, isLocalExpanded]);

  // Set remote video stream
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
    // For audio calls, use audio element
    if (remoteAudioRef.current && remoteStream && !isVideoCall) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, isVideoCall, isLocalExpanded]);

  const handleSwapVideos = () => {
    setIsLocalExpanded(prev => !prev);
  };

  const searchUsers = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const { data: currentUser } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .neq("id", currentUser.user?.id || "")
        .or(`full_name.ilike.%${query}%,username.ilike.%${query}%`)
        .limit(10);

      if (error) throw error;
      setSearchResults(data || []);
    } catch (error: any) {
      console.error("Search error:", error);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      searchUsers(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleAddMember = (user: Participant) => {
    if (onAddParticipant) {
      onAddParticipant(user.id);
      toast({
        title: "Calling...",
        description: `Calling ${user.full_name} to join the call`,
      });
    }
    setShowAddMember(false);
    setSearchQuery("");
    setSearchResults([]);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 z-50"
    >
      {/* Main Video Display */}
      {isVideoCall ? (
        <>
          {/* Large Video - Shows remote by default, local when expanded */}
          <div className="w-full h-full relative">
            {isLocalExpanded ? (
              // Show local video large
              isCameraOn ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  style={{ transform: 'none' }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                  <VideoOff className="w-16 h-16 text-white/50" />
                </div>
              )
            ) : (
              // Show remote video large
              remoteStream ? (
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                  style={{ transform: 'none' }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 via-accent/10 to-primary/5">
                  <div className="text-center">
                    <div className="w-24 h-24 rounded-full bg-primary/30 mx-auto mb-4 flex items-center justify-center animate-pulse">
                      <Video className="w-12 h-12 text-white" />
                    </div>
                    <p className="text-white text-lg font-medium">Connecting...</p>
                  </div>
                </div>
              )
            )}
          </div>
          
          {/* Floating Small Video - Clickable to swap */}
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={handleSwapVideos}
            className="absolute top-4 right-4 w-28 h-40 sm:w-32 sm:h-48 rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl bg-black cursor-pointer hover:border-primary/50 transition-all active:scale-95"
          >
            {isLocalExpanded ? (
              // Show remote video small when local is expanded
              remoteStream ? (
                <video
                  ref={!isLocalExpanded ? undefined : remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                  style={{ transform: 'none' }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-700 to-slate-800">
                  <div className="animate-pulse">
                    <Video className="w-8 h-8 text-white/50" />
                  </div>
                </div>
              )
            ) : (
              // Show local video small by default
              isCameraOn ? (
                <video
                  ref={!isLocalExpanded ? localVideoRef : undefined}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  style={{ transform: 'none' }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                  <VideoOff className="w-8 h-8 text-white/50" />
                </div>
              )
            )}
            <div className="absolute bottom-2 right-2 bg-black/60 rounded-full p-1.5 backdrop-blur-sm">
              {isLocalExpanded ? (
                <Minimize2 className="w-3 h-3 text-white" />
              ) : (
                <Maximize2 className="w-3 h-3 text-white" />
              )}
            </div>
            <div className="absolute top-2 left-2 bg-black/60 rounded-full px-2 py-0.5 backdrop-blur-sm">
              <span className="text-[10px] text-white font-medium">
                {isLocalExpanded ? "Remote" : "You"}
              </span>
            </div>
          </motion.div>
        </>
      ) : (
        <>
          <audio ref={remoteAudioRef} autoPlay />
          <div className="w-full h-full bg-gradient-to-br from-primary/20 via-accent/10 to-primary/5 flex items-center justify-center">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center"
            >
              <div className="w-32 h-32 rounded-full bg-gradient-to-br from-primary/40 to-accent/40 mx-auto mb-4 flex items-center justify-center shadow-2xl">
                <Mic className="w-16 h-16 text-white" />
              </div>
              <p className="text-white text-xl font-medium">Audio Call</p>
              <p className="text-white/60 text-sm mt-2">Connected</p>
            </motion.div>
          </div>
        </>
      )}

      {/* Call Info Badge */}
      <motion.div 
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="absolute top-4 left-4 bg-black/40 backdrop-blur-sm rounded-full px-3 py-1.5"
      >
        <span className="text-white text-sm font-medium">
          {isVideoCall ? "Video Call" : "Audio Call"}
        </span>
      </motion.div>

      {/* Add Member Modal */}
      <AnimatePresence>
        {showAddMember && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm z-10 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-card rounded-2xl p-6 w-full max-w-sm shadow-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-foreground">Add to Call</h3>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowAddMember(false)}
                  className="rounded-full"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
              
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  autoFocus
                />
              </div>

              <div className="max-h-64 overflow-y-auto space-y-2">
                {searching ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2" />
                    Searching...
                  </div>
                ) : searchResults.length > 0 ? (
                  searchResults.map((user) => (
                    <motion.button
                      key={user.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={() => handleAddMember(user)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors"
                    >
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={user.avatar_url || ""} />
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {user.full_name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-foreground">{user.full_name}</span>
                      <UserPlus className="w-4 h-4 text-primary ml-auto" />
                    </motion.button>
                  ))
                ) : searchQuery.length >= 2 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No users found
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    Type at least 2 characters to search
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls - Fixed at bottom center for mobile */}
      <motion.div 
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="fixed bottom-0 left-0 right-0 pb-8 pt-6 px-4 bg-gradient-to-t from-black/60 to-transparent"
      >
        <div className="flex items-center justify-center gap-4 max-w-sm mx-auto">
          {/* Add Member Button - Mobile Friendly */}
          <Button
            onClick={() => setShowAddMember(true)}
            size="lg"
            className="rounded-full w-12 h-12 p-0 bg-white/20 hover:bg-white/30 border-0 backdrop-blur-sm"
          >
            <UserPlus className="w-5 h-5 text-white" />
          </Button>

          {isVideoCall && onSwitchCamera && (
            <Button
              onClick={onSwitchCamera}
              size="lg"
              variant="secondary"
              className="rounded-full w-12 h-12 p-0 bg-white/20 hover:bg-white/30 border-0 backdrop-blur-sm"
            >
              <SwitchCamera className="w-5 h-5 text-white" />
            </Button>
          )}

          {isVideoCall && (
            <Button
              onClick={onToggleCamera}
              size="lg"
              variant={isCameraOn ? "secondary" : "destructive"}
              className={`rounded-full w-12 h-12 p-0 ${isCameraOn ? 'bg-white/20 hover:bg-white/30 border-0 backdrop-blur-sm' : ''}`}
            >
              {isCameraOn ? (
                <Video className="w-5 h-5 text-white" />
              ) : (
                <VideoOff className="w-5 h-5" />
              )}
            </Button>
          )}
          
          <Button
            onClick={onToggleMic}
            size="lg"
            variant={isMicOn ? "secondary" : "destructive"}
            className={`rounded-full w-12 h-12 p-0 ${isMicOn ? 'bg-white/20 hover:bg-white/30 border-0 backdrop-blur-sm' : ''}`}
          >
            {isMicOn ? (
              <Mic className="w-5 h-5 text-white" />
            ) : (
              <MicOff className="w-5 h-5" />
            )}
          </Button>

          <Button
            onClick={onEndCall}
            size="lg"
            variant="destructive"
            className="rounded-full w-14 h-14 p-0 shadow-lg shadow-destructive/30"
          >
            <PhoneOff className="w-6 h-6" />
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default VideoCallScreen;
