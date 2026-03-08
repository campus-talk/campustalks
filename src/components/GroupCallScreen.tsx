import { useEffect, useRef, useState, memo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PhoneOff, Loader2, Video, Mic, MicOff, VideoOff,
  SwitchCamera, Monitor, MonitorOff, Volume2, VolumeX,
  UserPlus, Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import AgoraRTC, {
  IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack,
  IRemoteVideoTrack, IRemoteAudioTrack, ILocalVideoTrack, IAgoraRTCRemoteUser
} from 'agora-rtc-sdk-ng';
import type { CallState, CallConfig } from '@/hooks/useAgoraCall';
import { getAgoraToken, AGORA_APP_ID } from '@/hooks/useAgoraCall';
import { supabase } from '@/integrations/supabase/client';

interface RemoteParticipant {
  uid: number | string;
  videoTrack: IRemoteVideoTrack | null;
  audioTrack: IRemoteAudioTrack | null;
  profile?: { full_name: string; avatar_url: string | null };
}

interface GroupCallScreenProps {
  callConfig: CallConfig | null;
  callState: CallState;
  isVideoCall: boolean;
  currentUserId: string;
  onEndCall: () => void;
  onInviteUsers?: (userIds: string[]) => void;
  groupId?: string | null;
  conversationId?: string;
}

AgoraRTC.setLogLevel(3);

const GroupCallScreen = memo(({
  callConfig,
  callState,
  isVideoCall,
  currentUserId,
  onEndCall,
  onInviteUsers,
  groupId,
  conversationId,
}: GroupCallScreenProps) => {
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localAudioRef = useRef<IMicrophoneAudioTrack | null>(null);
  const localVideoRef = useRef<ICameraVideoTrack | null>(null);
  const screenTrackRef = useRef<ILocalVideoTrack | null>(null);
  const localVideoContainerRef = useRef<HTMLDivElement>(null);

  const [joined, setJoined] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(isVideoCall);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [networkQuality, setNetworkQuality] = useState<'good' | 'fair' | 'poor'>('good');
  const [remoteParticipants, setRemoteParticipants] = useState<Map<string | number, RemoteParticipant>>(new Map());
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [addableUsers, setAddableUsers] = useState<{ id: string; full_name: string; avatar_url: string | null }[]>([]);
  const [selectedInvites, setSelectedInvites] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  const durationRef = useRef<NodeJS.Timeout | null>(null);
  const hasEndedRef = useRef(false);
  const controlsTimerRef = useRef<NodeJS.Timeout | null>(null);

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    if (isVideoCall) {
      controlsTimerRef.current = setTimeout(() => setShowControls(false), 4000);
    }
  }, [isVideoCall]);

  // Play local video
  useEffect(() => {
    if (!joined || !isVideoCall || !localVideoContainerRef.current) return;
    const el = localVideoContainerRef.current;
    el.innerHTML = '';
    const track = screenTrackRef.current || (isCameraOn ? localVideoRef.current : null);
    if (track) track.play(el);
  }, [joined, isVideoCall, isCameraOn, isScreenSharing]);

  const cleanupTracks = useCallback(() => {
    localAudioRef.current?.close();
    localVideoRef.current?.close();
    screenTrackRef.current?.close();
    localAudioRef.current = null;
    localVideoRef.current = null;
    screenTrackRef.current = null;
    if (callConfig?.preAcquiredStream) {
      callConfig.preAcquiredStream.getTracks().forEach(t => t.stop());
    }
  }, [callConfig?.preAcquiredStream]);

  const handleEndCallInternal = useCallback(async () => {
    if (hasEndedRef.current) return;
    hasEndedRef.current = true;
    if (durationRef.current) clearInterval(durationRef.current);
    cleanupTracks();
    await clientRef.current?.leave().catch(() => {});
    clientRef.current = null;
    onEndCall();
  }, [cleanupTracks, onEndCall]);

  // Initialize Agora
  useEffect(() => {
    if (callState !== 'accepted' || !callConfig?.channelName || !currentUserId) return;
    let cancelled = false;
    hasEndedRef.current = false;

    const init = async () => {
      try {
        setInitError(null);
        const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        clientRef.current = client;

        client.on('network-quality', (stats) => {
          const q = stats.uplinkNetworkQuality;
          if (q <= 2) setNetworkQuality('good');
          else if (q <= 4) setNetworkQuality('fair');
          else setNetworkQuality('poor');
        });

        const { token, uid } = await getAgoraToken(callConfig.channelName, isVideoCall);
        if (cancelled) return;

        await client.join(AGORA_APP_ID, callConfig.channelName, token, uid);
        if (cancelled) return;

        // Create tracks
        if (callConfig.preAcquiredStream) {
          const stream = callConfig.preAcquiredStream;
          const audioTracks = stream.getAudioTracks();
          const videoTracks = stream.getVideoTracks();
          if (audioTracks.length > 0) {
            localAudioRef.current = AgoraRTC.createCustomAudioTrack({ mediaStreamTrack: audioTracks[0] }) as any;
          }
          if (isVideoCall && videoTracks.length > 0) {
            localVideoRef.current = AgoraRTC.createCustomVideoTrack({ mediaStreamTrack: videoTracks[0] }) as any;
          }
        } else {
          localAudioRef.current = await AgoraRTC.createMicrophoneAudioTrack({
            AEC: true, ANS: true, AGC: true,
          });
          if (isVideoCall) {
            localVideoRef.current = await AgoraRTC.createCameraVideoTrack({
              encoderConfig: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: 24, bitrateMax: 800 },
              optimizationMode: 'detail',
            });
          }
        }

        const tracks: any[] = [];
        if (localAudioRef.current) tracks.push(localAudioRef.current);
        if (localVideoRef.current) tracks.push(localVideoRef.current);
        if (tracks.length > 0) await client.publish(tracks);

        // Remote user published
        client.on('user-published', async (user: IAgoraRTCRemoteUser, mediaType) => {
          await client.subscribe(user, mediaType);
          setRemoteParticipants(prev => {
            const updated = new Map(prev);
            const existing = updated.get(user.uid) || { uid: user.uid, videoTrack: null, audioTrack: null };
            if (mediaType === 'video') {
              existing.videoTrack = user.videoTrack || null;
            }
            if (mediaType === 'audio') {
              existing.audioTrack = user.audioTrack || null;
              user.audioTrack?.play();
            }
            updated.set(user.uid, existing);
            return updated;
          });
        });

        client.on('user-unpublished', (user: IAgoraRTCRemoteUser, mediaType) => {
          setRemoteParticipants(prev => {
            const updated = new Map(prev);
            const existing = updated.get(user.uid);
            if (existing) {
              if (mediaType === 'video') existing.videoTrack = null;
              if (mediaType === 'audio') existing.audioTrack = null;
              updated.set(user.uid, { ...existing });
            }
            return updated;
          });
        });

        client.on('user-left', (user: IAgoraRTCRemoteUser) => {
          setRemoteParticipants(prev => {
            const updated = new Map(prev);
            updated.delete(user.uid);
            return updated;
          });
        });

        if (!cancelled) {
          setJoined(true);
          durationRef.current = setInterval(() => setCallDuration(p => p + 1), 1000);
        }
      } catch (error: any) {
        console.error('Group call init error:', error);
        if (!cancelled) setInitError(error.message || 'Failed to connect');
      }
    };

    init();
    return () => {
      cancelled = true;
      if (durationRef.current) clearInterval(durationRef.current);
      cleanupTracks();
      clientRef.current?.leave().catch(() => {});
      clientRef.current = null;
      setJoined(false);
      setRemoteParticipants(new Map());
      setCallDuration(0);
    };
  }, [callState, callConfig?.channelName, currentUserId, isVideoCall]);

  // Fetch addable members
  const fetchAddableUsers = useCallback(async () => {
    if (!groupId) return;
    const { data: members } = await supabase
      .from('group_members')
      .select('user_id, profiles:user_id(full_name, avatar_url)')
      .eq('group_id', groupId);

    if (members) {
      // Get current call participants
      const inCallUids = new Set([currentUserId]);
      // Filter to members not in call
      const addable = members
        .filter((m: any) => !inCallUids.has(m.user_id))
        .map((m: any) => ({
          id: m.user_id,
          full_name: m.profiles?.full_name || 'User',
          avatar_url: m.profiles?.avatar_url || null,
        }));
      setAddableUsers(addable);
    }
  }, [groupId, currentUserId]);

  const handleInvite = useCallback(() => {
    if (selectedInvites.size > 0 && onInviteUsers) {
      onInviteUsers(Array.from(selectedInvites));
      setSelectedInvites(new Set());
      setShowAddMembers(false);
    }
  }, [selectedInvites, onInviteUsers]);

  // Toggles
  const toggleMic = async () => {
    if (localAudioRef.current) {
      await localAudioRef.current.setEnabled(!isMicOn);
      setIsMicOn(!isMicOn);
    }
  };

  const toggleCamera = async () => {
    if (localVideoRef.current) {
      const next = !isCameraOn;
      await localVideoRef.current.setEnabled(next);
      setIsCameraOn(next);
    }
  };

  const toggleSpeaker = () => {
    remoteParticipants.forEach(p => {
      if (p.audioTrack) {
        isSpeakerOn ? p.audioTrack.stop() : p.audioTrack.play();
      }
    });
    setIsSpeakerOn(!isSpeakerOn);
  };

  const switchCamera = async () => {
    if (localVideoRef.current) {
      const devices = await AgoraRTC.getCameras();
      if (devices.length > 1) {
        const current = localVideoRef.current.getTrackLabel();
        const next = devices.find(d => d.label !== current) || devices[0];
        await localVideoRef.current.setDevice(next.deviceId);
      }
    }
  };

  const toggleScreenShare = async () => {
    if (!clientRef.current) return;
    if (isScreenSharing && screenTrackRef.current) {
      await clientRef.current.unpublish(screenTrackRef.current);
      screenTrackRef.current.close();
      screenTrackRef.current = null;
      if (localVideoRef.current) await clientRef.current.publish(localVideoRef.current);
      setIsScreenSharing(false);
    } else {
      try {
        const screenTrack = await AgoraRTC.createScreenVideoTrack({
          encoderConfig: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: 15, bitrateMax: 2500 },
        }, 'disable');
        if (localVideoRef.current) await clientRef.current.unpublish(localVideoRef.current);
        const track = Array.isArray(screenTrack) ? screenTrack[0] : screenTrack;
        screenTrackRef.current = track;
        await clientRef.current.publish(track);
        track.on('track-ended', async () => {
          if (clientRef.current && screenTrackRef.current) {
            await clientRef.current.unpublish(screenTrackRef.current);
            screenTrackRef.current.close();
            screenTrackRef.current = null;
            if (localVideoRef.current) await clientRef.current.publish(localVideoRef.current);
            setIsScreenSharing(false);
          }
        });
        setIsScreenSharing(true);
      } catch (err) {
        console.error('Screen share error:', err);
      }
    }
  };

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  if (!callConfig) return null;

  const isWaiting = callState === 'calling' || callState === 'ringing';
  const totalParticipants = remoteParticipants.size + 1; // +1 for local
  const filteredAddable = addableUsers.filter(u =>
    u.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Grid layout calculation
  const getGridClass = () => {
    if (totalParticipants <= 1) return 'grid-cols-1 grid-rows-1';
    if (totalParticipants === 2) return 'grid-cols-1 grid-rows-2';
    if (totalParticipants <= 4) return 'grid-cols-2 grid-rows-2';
    if (totalParticipants <= 6) return 'grid-cols-2 grid-rows-3';
    if (totalParticipants <= 9) return 'grid-cols-3 grid-rows-3';
    return 'grid-cols-3 grid-rows-4';
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black z-50 flex flex-col"
      onClick={resetControlsTimer}
    >
      {/* WAITING UI */}
      <AnimatePresence>
        {isWaiting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex flex-col items-center justify-center"
            style={{ background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' }}
          >
            <div className="relative mb-8">
              <motion.div
                animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0, 0.4] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute inset-0 rounded-full border-2 border-primary/50"
                style={{ margin: '-24px' }}
              />
              <div className="w-28 h-28 rounded-full bg-primary/20 flex items-center justify-center">
                <Users className="w-14 h-14 text-white" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">{callConfig.displayName}</h2>
            <div className="flex items-center gap-2 text-white/70">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-lg">
                {callState === 'calling' ? 'Calling group...' : 'Ringing...'}
              </span>
            </div>
            <div className="mt-6 flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm">
              {isVideoCall ? <Video className="w-5 h-5 text-white" /> : <Mic className="w-5 h-5 text-white" />}
              <span className="text-white/80 text-sm">Group {isVideoCall ? 'Video' : 'Voice'} Call</span>
            </div>
            <div className="mt-16">
              <Button
                onClick={handleEndCallInternal}
                size="lg"
                variant="destructive"
                className="rounded-full w-16 h-16 p-0 shadow-lg shadow-red-500/40"
              >
                <PhoneOff className="w-7 h-7" />
              </Button>
              <p className="text-white/50 text-xs text-center mt-3">Cancel</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ACTIVE CALL - GRID VIEW */}
      {callState === 'accepted' && joined && (
        <div className="flex-1 w-full h-full relative bg-black">
          {/* Status bar */}
          <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent">
            <div className="flex items-center gap-2">
              <div className="bg-black/60 backdrop-blur-md rounded-full px-3 py-1.5 flex items-center gap-2">
                <span className="text-white text-xs font-mono">{formatDuration(callDuration)}</span>
                <div className={`w-2 h-2 rounded-full ${
                  networkQuality === 'good' ? 'bg-green-400' :
                  networkQuality === 'fair' ? 'bg-yellow-400' : 'bg-red-400'
                }`} />
              </div>
              {isScreenSharing && (
                <div className="bg-primary/80 backdrop-blur-md rounded-full px-3 py-1.5 flex items-center gap-1.5">
                  <Monitor className="w-3 h-3 text-white" />
                  <span className="text-white text-xs">Sharing</span>
                </div>
              )}
            </div>
            <div className="bg-black/60 backdrop-blur-md rounded-full px-3 py-1.5 flex items-center gap-1.5">
              <Users className="w-3 h-3 text-white" />
              <span className="text-white text-xs">{totalParticipants}</span>
            </div>
          </div>

          {isVideoCall ? (
            <div className={`w-full h-full grid ${getGridClass()} gap-1 p-1`}>
              {/* Local video tile */}
              <div className="relative bg-slate-900 rounded-lg overflow-hidden">
                <div ref={localVideoContainerRef} className="w-full h-full" />
                {!isCameraOn && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-800">
                    <Avatar className="w-16 h-16 mb-2">
                      <AvatarImage src={callConfig.avatarUrl || ''} />
                      <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-primary-foreground text-xl">
                        You
                      </AvatarFallback>
                    </Avatar>
                    <VideoOff className="w-5 h-5 text-white/40" />
                  </div>
                )}
                <div className="absolute bottom-2 left-2 bg-black/60 rounded-full px-2 py-0.5">
                  <span className="text-white text-[10px]">You</span>
                </div>
                {!isMicOn && (
                  <div className="absolute top-2 right-2 bg-red-500/80 rounded-full p-1">
                    <MicOff className="w-3 h-3 text-white" />
                  </div>
                )}
              </div>

              {/* Remote video tiles */}
              {Array.from(remoteParticipants.values()).map((participant) => (
                <RemoteVideoTile key={String(participant.uid)} participant={participant} />
              ))}

              {/* Empty slots with waiting text */}
              {totalParticipants === 1 && (
                <div className="flex items-center justify-center bg-slate-900 rounded-lg">
                  <div className="text-center">
                    <Loader2 className="w-8 h-8 text-white/30 animate-spin mx-auto mb-2" />
                    <p className="text-white/40 text-sm">Waiting for others...</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* AUDIO CALL - Circle grid */
            <div className="w-full h-full flex items-center justify-center"
              style={{ background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' }}
            >
              <div className="flex flex-wrap items-center justify-center gap-6 max-w-sm px-4">
                {/* Local user */}
                <div className="flex flex-col items-center">
                  <div className="relative">
                    <Avatar className="w-20 h-20 border-2 border-primary/40">
                      <AvatarImage src={callConfig.avatarUrl || ''} />
                      <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-primary-foreground text-xl">
                        You
                      </AvatarFallback>
                    </Avatar>
                    {!isMicOn && (
                      <div className="absolute -bottom-1 -right-1 bg-red-500 rounded-full p-1">
                        <MicOff className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </div>
                  <span className="text-white/70 text-xs mt-2">You</span>
                </div>

                {/* Remote users */}
                {Array.from(remoteParticipants.values()).map((participant) => (
                  <div key={String(participant.uid)} className="flex flex-col items-center">
                    <div className="relative">
                      <motion.div
                        animate={{ scale: [1, 1.08, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="absolute inset-0 rounded-full bg-primary/20"
                        style={{ margin: '-4px' }}
                      />
                      <Avatar className="w-20 h-20 border-2 border-white/20">
                        <AvatarFallback className="bg-gradient-to-br from-slate-600 to-slate-800 text-white text-xl">
                          {String(participant.uid).charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                    <span className="text-white/70 text-xs mt-2">User {String(participant.uid).slice(-4)}</span>
                  </div>
                ))}

                {totalParticipants === 1 && (
                  <div className="flex flex-col items-center">
                    <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center border-2 border-dashed border-white/20">
                      <Loader2 className="w-6 h-6 text-white/30 animate-spin" />
                    </div>
                    <span className="text-white/40 text-xs mt-2">Waiting...</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CONTROLS */}
          <AnimatePresence>
            {(showControls || !isVideoCall) && (
              <motion.div
                initial={{ y: 60, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 60, opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="absolute bottom-0 left-0 right-0 pb-10 pt-16 px-4 z-20"
                style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 60%, transparent 100%)' }}
              >
                <div className="flex items-center justify-center gap-3 max-w-md mx-auto flex-wrap">
                  <ControlBtn onClick={toggleSpeaker} active={isSpeakerOn}
                    icon={isSpeakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                    label={isSpeakerOn ? 'Speaker' : 'Muted'} />

                  {isVideoCall && isCameraOn && (
                    <ControlBtn onClick={switchCamera} active icon={<SwitchCamera className="w-5 h-5" />} label="Flip" />
                  )}

                  {isVideoCall && (
                    <ControlBtn onClick={toggleCamera} active={isCameraOn}
                      activeColor="bg-white/20" inactiveColor="bg-red-500/80"
                      icon={isCameraOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                      label={isCameraOn ? 'Camera' : 'Off'} />
                  )}

                  <ControlBtn onClick={toggleMic} active={isMicOn}
                    activeColor="bg-white/20" inactiveColor="bg-red-500/80"
                    icon={isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                    label={isMicOn ? 'Mute' : 'Unmute'} />

                  {isVideoCall && (
                    <ControlBtn onClick={toggleScreenShare} active={!isScreenSharing}
                      activeColor="bg-white/20" inactiveColor="bg-primary/80"
                      icon={isScreenSharing ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
                      label={isScreenSharing ? 'Stop' : 'Share'} />
                  )}

                  {/* Add members */}
                  {groupId && (
                    <ControlBtn onClick={() => { fetchAddableUsers(); setShowAddMembers(true); }}
                      active icon={<UserPlus className="w-5 h-5" />} label="Add" />
                  )}

                  {/* End call */}
                  <div className="flex flex-col items-center">
                    <Button
                      onClick={handleEndCallInternal}
                      size="lg"
                      className="rounded-full w-16 h-16 p-0 bg-red-600 hover:bg-red-700 shadow-lg shadow-red-600/40"
                    >
                      <PhoneOff className="w-7 h-7 text-white" />
                    </Button>
                    <span className="text-white/50 text-[10px] mt-1">End</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Error */}
      {initError && callState === 'accepted' && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black">
          <p className="text-red-400 text-lg mb-4">{initError}</p>
          <Button onClick={handleEndCallInternal} variant="destructive" className="rounded-full">
            <PhoneOff className="w-5 h-5 mr-2" /> End Call
          </Button>
        </div>
      )}

      {/* Loading */}
      {callState === 'accepted' && !joined && !initError && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black">
          <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
          <span className="text-white/60 text-lg">Connecting to group call...</span>
        </div>
      )}

      {/* Add Members Dialog */}
      <Dialog open={showAddMembers} onOpenChange={setShowAddMembers}>
        <DialogContent className="max-w-sm bg-slate-900 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <UserPlus className="w-5 h-5" /> Add to Call
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Search members..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-400"
            />
            <ScrollArea className="h-[250px]">
              <div className="space-y-2">
                {filteredAddable.map(user => (
                  <div
                    key={user.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800 cursor-pointer"
                    onClick={() => {
                      const s = new Set(selectedInvites);
                      s.has(user.id) ? s.delete(user.id) : s.add(user.id);
                      setSelectedInvites(s);
                    }}
                  >
                    <Checkbox checked={selectedInvites.has(user.id)} className="border-slate-500" />
                    <Avatar className="w-9 h-9">
                      <AvatarImage src={user.avatar_url || ''} />
                      <AvatarFallback className="bg-slate-700 text-white text-sm">{user.full_name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{user.full_name}</span>
                  </div>
                ))}
                {filteredAddable.length === 0 && (
                  <p className="text-slate-400 text-center py-4 text-sm">No members to add</p>
                )}
              </div>
            </ScrollArea>
            <Button
              onClick={handleInvite}
              disabled={selectedInvites.size === 0}
              className="w-full"
            >
              Invite {selectedInvites.size > 0 ? `(${selectedInvites.size})` : ''}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
});

// Remote video tile component
function RemoteVideoTile({ participant }: { participant: RemoteParticipant }) {
  const videoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (videoRef.current && participant.videoTrack) {
      videoRef.current.innerHTML = '';
      participant.videoTrack.play(videoRef.current);
    }
  }, [participant.videoTrack]);

  return (
    <div className="relative bg-slate-900 rounded-lg overflow-hidden">
      <div ref={videoRef} className="w-full h-full" />
      {!participant.videoTrack && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-800">
          <Avatar className="w-16 h-16">
            <AvatarFallback className="bg-gradient-to-br from-slate-600 to-slate-800 text-white text-xl">
              {String(participant.uid).charAt(0)}
            </AvatarFallback>
          </Avatar>
        </div>
      )}
      <div className="absolute bottom-2 left-2 bg-black/60 rounded-full px-2 py-0.5">
        <span className="text-white text-[10px]">User {String(participant.uid).slice(-4)}</span>
      </div>
    </div>
  );
}

// Control button
function ControlBtn({
  onClick, active, icon, label, activeColor = 'bg-white/20', inactiveColor = 'bg-red-500/80',
}: {
  onClick: () => void; active: boolean; icon: React.ReactNode; label: string;
  activeColor?: string; inactiveColor?: string;
}) {
  return (
    <div className="flex flex-col items-center">
      <Button onClick={onClick} size="lg"
        className={`rounded-full w-13 h-13 p-0 border-0 ${
          active ? `${activeColor} hover:bg-white/30` : `${inactiveColor} hover:opacity-80`
        } text-white`}
      >
        {icon}
      </Button>
      <span className="text-white/50 text-[10px] mt-1">{label}</span>
    </div>
  );
}

GroupCallScreen.displayName = 'GroupCallScreen';
export default GroupCallScreen;
