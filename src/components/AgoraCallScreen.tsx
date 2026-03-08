import { useEffect, useRef, useState, memo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PhoneOff, Loader2, Video, Mic, MicOff, VideoOff,
  SwitchCamera, Monitor, MonitorOff, Volume2, VolumeX,
  Maximize2, Minimize2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import AgoraRTC, {
  IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack,
  IRemoteVideoTrack, IRemoteAudioTrack, ILocalVideoTrack
} from 'agora-rtc-sdk-ng';
import type { CallState, CallConfig } from '@/hooks/useAgoraCall';
import { getAgoraToken, AGORA_APP_ID } from '@/hooks/useAgoraCall';

interface AgoraCallScreenProps {
  callConfig: CallConfig | null;
  callState: CallState;
  isVideoCall: boolean;
  currentUserId: string;
  onEndCall: () => void;
}

// Enable Agora optimizations
AgoraRTC.setLogLevel(3); // warnings only

const AgoraCallScreen = memo(({
  callConfig,
  callState,
  isVideoCall,
  currentUserId,
  onEndCall,
}: AgoraCallScreenProps) => {
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localAudioRef = useRef<IMicrophoneAudioTrack | null>(null);
  const localVideoRef = useRef<ICameraVideoTrack | null>(null);
  const remoteVideoRef = useRef<IRemoteVideoTrack | null>(null);
  const remoteAudioRef = useRef<IRemoteAudioTrack | null>(null);
  const screenTrackRef = useRef<ILocalVideoTrack | null>(null);

  const fullscreenRef = useRef<HTMLDivElement>(null);
  const pipRef = useRef<HTMLDivElement>(null);

  const [joined, setJoined] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(isVideoCall);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [remoteJoined, setRemoteJoined] = useState(false);
  const [isLocalFullScreen, setIsLocalFullScreen] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [networkQuality, setNetworkQuality] = useState<'good' | 'fair' | 'poor'>('good');

  const durationRef = useRef<NodeJS.Timeout | null>(null);
  const hasEndedRef = useRef(false);
  const controlsTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-hide controls after 4s on video calls
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    if (isVideoCall) {
      controlsTimerRef.current = setTimeout(() => setShowControls(false), 4000);
    }
  }, [isVideoCall]);

  // Play local & remote videos into correct containers
  const renderVideos = useCallback(() => {
    const fullEl = fullscreenRef.current;
    const pipEl = pipRef.current;
    if (!fullEl || !pipEl) return;

    // Clear
    fullEl.innerHTML = '';
    pipEl.innerHTML = '';

    const localTrack = screenTrackRef.current || (isCameraOn ? localVideoRef.current : null);
    const remoteTrack = remoteVideoRef.current;

    if (isLocalFullScreen) {
      if (localTrack) localTrack.play(fullEl);
      if (remoteTrack) remoteTrack.play(pipEl);
    } else {
      if (remoteTrack) remoteTrack.play(fullEl);
      if (localTrack) localTrack.play(pipEl);
    }
  }, [isLocalFullScreen, isCameraOn]);

  // Re-render on state change
  useEffect(() => {
    if (joined && isVideoCall) renderVideos();
  }, [joined, isVideoCall, isLocalFullScreen, isCameraOn, remoteJoined, isScreenSharing, renderVideos]);

  // Cleanup helper
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

  // Initialize Agora when call is accepted
  useEffect(() => {
    if (callState !== 'accepted' || !callConfig?.channelName || !currentUserId) return;

    let cancelled = false;
    hasEndedRef.current = false;

    const init = async () => {
      try {
        setInitError(null);
        const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        clientRef.current = client;

        // Network quality monitoring
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
              encoderConfig: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: 30,
                bitrateMax: 1500,
              },
              optimizationMode: 'detail',
            });
          }
        }

        // Publish
        const tracks: any[] = [];
        if (localAudioRef.current) tracks.push(localAudioRef.current);
        if (localVideoRef.current) tracks.push(localVideoRef.current);
        if (tracks.length > 0) await client.publish(tracks);

        // Remote user published
        client.on('user-published', async (user, mediaType) => {
          await client.subscribe(user, mediaType);
          if (mediaType === 'video') {
            remoteVideoRef.current = user.videoTrack || null;
            setRemoteJoined(true);
          }
          if (mediaType === 'audio') {
            remoteAudioRef.current = user.audioTrack || null;
            user.audioTrack?.play();
          }
        });

        client.on('user-unpublished', (_user, mediaType) => {
          if (mediaType === 'video') {
            remoteVideoRef.current = null;
            setRemoteJoined(prev => prev); // trigger re-render
          }
        });

        // Auto-end when remote leaves
        client.on('user-left', () => {
          setRemoteJoined(false);
          remoteVideoRef.current = null;
          remoteAudioRef.current = null;
          handleEndCallInternal();
        });

        if (!cancelled) {
          setJoined(true);
          durationRef.current = setInterval(() => setCallDuration(p => p + 1), 1000);
          // Initial render of local video
          setTimeout(() => renderVideos(), 200);
        }
      } catch (error: any) {
        console.error('Agora init error:', error);
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
      setRemoteJoined(false);
      setCallDuration(0);
    };
  }, [callState, callConfig?.channelName, currentUserId, isVideoCall]);

  // Toggle functions
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
    if (remoteAudioRef.current) {
      if (isSpeakerOn) {
        remoteAudioRef.current.stop();
      } else {
        remoteAudioRef.current.play();
      }
      setIsSpeakerOn(!isSpeakerOn);
    }
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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black z-50 flex flex-col"
      onClick={resetControlsTimer}
    >
      {/* ===== WAITING / RINGING UI ===== */}
      <AnimatePresence>
        {isWaiting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex flex-col items-center justify-center"
            style={{ background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' }}
          >
            {/* Pulsing rings */}
            <div className="relative mb-8">
              <motion.div
                animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0, 0.4] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute inset-0 rounded-full border-2 border-primary/50"
                style={{ margin: '-24px' }}
              />
              <motion.div
                animate={{ scale: [1, 1.5, 1], opacity: [0.2, 0, 0.2] }}
                transition={{ duration: 2, repeat: Infinity, delay: 0.4 }}
                className="absolute inset-0 rounded-full border border-primary/30"
                style={{ margin: '-48px' }}
              />
              <Avatar className="w-32 h-32 border-4 border-primary/60 shadow-2xl ring-4 ring-primary/20">
                <AvatarImage src={callConfig.avatarUrl || ''} />
                <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-primary-foreground text-4xl font-bold">
                  {callConfig.displayName?.charAt(0)}
                </AvatarFallback>
              </Avatar>
            </div>

            <h2 className="text-2xl font-bold text-white mb-2">{callConfig.displayName}</h2>
            <div className="flex items-center gap-2 text-white/70">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-lg">
                {callState === 'calling' ? 'Calling...' : 'Ringing...'}
              </span>
            </div>

            <div className="mt-6 flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm">
              {isVideoCall ? <Video className="w-5 h-5 text-white" /> : <Mic className="w-5 h-5 text-white" />}
              <span className="text-white/80 text-sm">{isVideoCall ? 'Video Call' : 'Voice Call'}</span>
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

      {/* ===== ACTIVE CALL UI ===== */}
      {callState === 'accepted' && joined && (
        <div className="flex-1 w-full h-full relative bg-black">
          {isVideoCall ? (
            <>
              {/* Fullscreen video container */}
              <div
                ref={fullscreenRef}
                className="w-full h-full bg-black"
              >
                {/* Placeholder when no video */}
                {!remoteJoined && !isLocalFullScreen && (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
                    <div className="text-center">
                      <motion.div
                        animate={{ scale: [1, 1.05, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="w-28 h-28 rounded-full bg-white/10 mx-auto mb-4 flex items-center justify-center"
                      >
                        <Avatar className="w-24 h-24">
                          <AvatarImage src={callConfig.avatarUrl || ''} />
                          <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-primary-foreground text-3xl">
                            {callConfig.displayName?.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                      </motion.div>
                      <p className="text-white/60 text-sm">Waiting for video...</p>
                    </div>
                  </div>
                )}
              </div>

              {/* PiP video - tap to swap */}
              <motion.div
                onClick={() => setIsLocalFullScreen(p => !p)}
                whileTap={{ scale: 0.92 }}
                drag
                dragConstraints={{ top: 0, left: 0, right: 200, bottom: 400 }}
                ref={pipRef}
                className="absolute top-4 right-4 w-[110px] h-[155px] sm:w-[130px] sm:h-[185px] rounded-2xl overflow-hidden border-2 border-white/30 shadow-2xl bg-slate-900 cursor-pointer z-20"
              >
                {/* Camera off placeholder for PiP */}
                {!isCameraOn && !isLocalFullScreen && (
                  <div className="w-full h-full flex items-center justify-center bg-slate-800">
                    <VideoOff className="w-6 h-6 text-white/40" />
                  </div>
                )}
                {isLocalFullScreen && !remoteJoined && (
                  <div className="w-full h-full flex items-center justify-center bg-slate-800">
                    <p className="text-white/40 text-[10px] text-center px-1">No video</p>
                  </div>
                )}
                {/* Swap icon */}
                <div className="absolute bottom-1 right-1 bg-black/60 rounded-full p-1">
                  {isLocalFullScreen ? <Minimize2 className="w-3 h-3 text-white/70" /> : <Maximize2 className="w-3 h-3 text-white/70" />}
                </div>
              </motion.div>
            </>
          ) : (
            /* ===== AUDIO CALL UI ===== */
            <div className="w-full h-full flex items-center justify-center"
              style={{ background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' }}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-center"
              >
                <div className="relative mb-6">
                  {remoteJoined && (
                    <motion.div
                      animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.1, 0.3] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="absolute inset-0 rounded-full bg-primary/30"
                      style={{ margin: '-16px' }}
                    />
                  )}
                  <Avatar className="w-32 h-32 border-4 border-primary/40 shadow-2xl mx-auto">
                    <AvatarImage src={callConfig.avatarUrl || ''} />
                    <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-primary-foreground text-3xl font-bold">
                      {callConfig.displayName?.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <p className="text-white text-xl font-semibold">{callConfig.displayName}</p>
                <p className="text-white/50 text-sm mt-2 font-mono">{formatDuration(callDuration)}</p>
                {!remoteJoined && (
                  <p className="text-white/30 text-xs mt-3 animate-pulse">Connecting audio...</p>
                )}
              </motion.div>
            </div>
          )}

          {/* Network quality indicator */}
          <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
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

          {/* ===== CONTROLS ===== */}
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
                  {/* Speaker toggle */}
                  <ControlButton
                    onClick={toggleSpeaker}
                    active={isSpeakerOn}
                    icon={isSpeakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                    label={isSpeakerOn ? 'Speaker' : 'Muted'}
                  />

                  {/* Camera switch */}
                  {isVideoCall && isCameraOn && (
                    <ControlButton
                      onClick={switchCamera}
                      active={true}
                      icon={<SwitchCamera className="w-5 h-5" />}
                      label="Flip"
                    />
                  )}

                  {/* Camera toggle */}
                  {isVideoCall && (
                    <ControlButton
                      onClick={toggleCamera}
                      active={isCameraOn}
                      activeColor="bg-white/20"
                      inactiveColor="bg-red-500/80"
                      icon={isCameraOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                      label={isCameraOn ? 'Camera' : 'Camera Off'}
                    />
                  )}

                  {/* Mic toggle */}
                  <ControlButton
                    onClick={toggleMic}
                    active={isMicOn}
                    activeColor="bg-white/20"
                    inactiveColor="bg-red-500/80"
                    icon={isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                    label={isMicOn ? 'Mute' : 'Unmute'}
                  />

                  {/* Screen share */}
                  {isVideoCall && (
                    <ControlButton
                      onClick={toggleScreenShare}
                      active={!isScreenSharing}
                      activeColor="bg-white/20"
                      inactiveColor="bg-primary/80"
                      icon={isScreenSharing ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
                      label={isScreenSharing ? 'Stop' : 'Share'}
                    />
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
          <span className="text-white/60 text-lg">Connecting...</span>
        </div>
      )}
    </motion.div>
  );
});

// Reusable control button
function ControlButton({
  onClick,
  active,
  icon,
  label,
  activeColor = 'bg-white/20',
  inactiveColor = 'bg-red-500/80',
}: {
  onClick: () => void;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  activeColor?: string;
  inactiveColor?: string;
}) {
  return (
    <div className="flex flex-col items-center">
      <Button
        onClick={onClick}
        size="lg"
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

AgoraCallScreen.displayName = 'AgoraCallScreen';

export default AgoraCallScreen;
