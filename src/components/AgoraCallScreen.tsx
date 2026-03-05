import { useEffect, useRef, useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PhoneOff, Loader2, Video, Mic, MicOff, VideoOff, SwitchCamera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import AgoraRTC, { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack, IRemoteVideoTrack, IRemoteAudioTrack } from 'agora-rtc-sdk-ng';
import type { CallState, CallConfig } from '@/hooks/useAgoraCall';
import { getAgoraToken, AGORA_APP_ID } from '@/hooks/useAgoraCall';

interface AgoraCallScreenProps {
  callConfig: CallConfig | null;
  callState: CallState;
  isVideoCall: boolean;
  currentUserId: string;
  onEndCall: () => void;
}

const AgoraCallScreen = memo(({
  callConfig,
  callState,
  isVideoCall,
  currentUserId,
  onEndCall,
}: AgoraCallScreenProps) => {
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localAudioTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const localVideoTrackRef = useRef<ICameraVideoTrack | null>(null);
  const remoteVideoTrackRef = useRef<IRemoteVideoTrack | null>(null);
  const remoteAudioTrackRef = useRef<IRemoteAudioTrack | null>(null);

  const localVideoContainerRef = useRef<HTMLDivElement>(null);
  const remoteVideoContainerRef = useRef<HTMLDivElement>(null);

  const [joined, setJoined] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(isVideoCall);
  const [remoteUserJoined, setRemoteUserJoined] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const durationRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize Agora when call is accepted
  useEffect(() => {
    if (callState !== 'accepted' || !callConfig?.channelName || !currentUserId) return;

    let cancelled = false;

    const initAgora = async () => {
      try {
        setInitError(null);

        const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        clientRef.current = client;

        // Get token
        const { token, uid } = await getAgoraToken(callConfig.channelName, isVideoCall);
        if (cancelled) return;

        // Join channel
        await client.join(AGORA_APP_ID, callConfig.channelName, token, uid);
        if (cancelled) return;

        // Create local tracks from pre-acquired stream if available
        if (callConfig.preAcquiredStream) {
          const stream = callConfig.preAcquiredStream;
          const audioTracks = stream.getAudioTracks();
          const videoTracks = stream.getVideoTracks();

          if (audioTracks.length > 0) {
            const audioTrack = AgoraRTC.createCustomAudioTrack({ mediaStreamTrack: audioTracks[0] });
            localAudioTrackRef.current = audioTrack as any;
          }

          if (isVideoCall && videoTracks.length > 0) {
            const videoTrack = AgoraRTC.createCustomVideoTrack({ mediaStreamTrack: videoTracks[0] });
            localVideoTrackRef.current = videoTrack as any;
          }
        } else {
          // Fallback: create tracks directly (may fail without user gesture)
          const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
          localAudioTrackRef.current = audioTrack;

          if (isVideoCall) {
            const videoTrack = await AgoraRTC.createCameraVideoTrack();
            localVideoTrackRef.current = videoTrack;
          }
        }

        const tracksToPublish: any[] = [];
        if (localAudioTrackRef.current) tracksToPublish.push(localAudioTrackRef.current);
        if (localVideoTrackRef.current) tracksToPublish.push(localVideoTrackRef.current);

        if (tracksToPublish.length > 0) {
          await client.publish(tracksToPublish);
        }

        if (isVideoCall && localVideoTrackRef.current && localVideoContainerRef.current) {
          localVideoTrackRef.current.play(localVideoContainerRef.current);
        }

        // Listen for remote users
        client.on('user-published', async (user, mediaType) => {
          await client.subscribe(user, mediaType);
          if (mediaType === 'video') {
            remoteVideoTrackRef.current = user.videoTrack || null;
            setRemoteUserJoined(true);
            if (remoteVideoContainerRef.current && user.videoTrack) {
              user.videoTrack.play(remoteVideoContainerRef.current);
            }
          }
          if (mediaType === 'audio') {
            remoteAudioTrackRef.current = user.audioTrack || null;
            user.audioTrack?.play();
          }
        });

        client.on('user-unpublished', (user, mediaType) => {
          if (mediaType === 'video') {
            setRemoteUserJoined(false);
            remoteVideoTrackRef.current = null;
          }
        });

        client.on('user-left', () => {
          setRemoteUserJoined(false);
          remoteVideoTrackRef.current = null;
          remoteAudioTrackRef.current = null;
        });

        if (!cancelled) {
          setJoined(true);
          // Start duration timer
          durationRef.current = setInterval(() => {
            setCallDuration(prev => prev + 1);
          }, 1000);
        }
      } catch (error: any) {
        console.error('Agora init error:', error);
        if (!cancelled) {
          setInitError(error.message || 'Failed to connect');
        }
      }
    };

    initAgora();

    return () => {
      cancelled = true;
      if (durationRef.current) clearInterval(durationRef.current);

      // Cleanup tracks
      localAudioTrackRef.current?.close();
      localVideoTrackRef.current?.close();
      localAudioTrackRef.current = null;
      localVideoTrackRef.current = null;

      // Stop pre-acquired stream tracks
      if (callConfig?.preAcquiredStream) {
        callConfig.preAcquiredStream.getTracks().forEach(t => t.stop());
      }

      // Leave channel
      clientRef.current?.leave().catch(() => {});
      clientRef.current = null;

      setJoined(false);
      setRemoteUserJoined(false);
      setCallDuration(0);
    };
  }, [callState, callConfig?.channelName, currentUserId, isVideoCall]);

  const toggleMic = async () => {
    if (localAudioTrackRef.current) {
      await localAudioTrackRef.current.setEnabled(!isMicOn);
      setIsMicOn(!isMicOn);
    }
  };

  const toggleCamera = async () => {
    if (localVideoTrackRef.current) {
      await localVideoTrackRef.current.setEnabled(!isCameraOn);
      setIsCameraOn(!isCameraOn);
    }
  };

  const switchCamera = async () => {
    if (localVideoTrackRef.current) {
      // @ts-ignore - switchDevice exists on camera tracks
      const devices = await AgoraRTC.getCameras();
      if (devices.length > 1) {
        const currentDevice = localVideoTrackRef.current.getTrackLabel();
        const nextDevice = devices.find(d => d.label !== currentDevice) || devices[0];
        await localVideoTrackRef.current.setDevice(nextDevice.deviceId);
      }
    }
  };

  const handleEndCall = async () => {
    if (durationRef.current) clearInterval(durationRef.current);
    localAudioTrackRef.current?.close();
    localVideoTrackRef.current?.close();
    localAudioTrackRef.current = null;
    localVideoTrackRef.current = null;
    await clientRef.current?.leave().catch(() => {});
    clientRef.current = null;
    onEndCall();
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!callConfig) return null;

  const isWaitingForAnswer = callState === 'calling' || callState === 'ringing';

  const getCallStatusText = () => {
    switch (callState) {
      case 'calling': return 'Calling...';
      case 'ringing': return 'Ringing...';
      case 'accepted': return joined ? '' : 'Connecting...';
      default: return '';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-background z-50 flex flex-col"
    >
      {/* Waiting/Ringing UI */}
      <AnimatePresence>
        {isWaitingForAnswer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gradient-to-b from-muted to-background"
          >
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
                <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-primary-foreground text-4xl font-bold">
                  {callConfig.displayName?.charAt(0)}
                </AvatarFallback>
              </Avatar>
            </div>

            <h2 className="text-2xl font-bold text-foreground mb-2">{callConfig.displayName}</h2>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-lg">{getCallStatusText()}</span>
            </div>

            <div className="mt-6 flex items-center gap-2 px-4 py-2 rounded-full bg-muted">
              {isVideoCall ? <Video className="w-5 h-5 text-foreground" /> : <Mic className="w-5 h-5 text-foreground" />}
              <span className="text-muted-foreground text-sm">
                {isVideoCall ? 'Video Call' : 'Voice Call'}
              </span>
            </div>

            <div className="mt-12">
              <Button
                onClick={handleEndCall}
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

      {/* Active Call UI */}
      {callState === 'accepted' && joined && (
        <div className="flex-1 w-full h-full relative bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
          {isVideoCall ? (
            <>
              {/* Remote video (full screen) */}
              <div
                ref={remoteVideoContainerRef}
                className="w-full h-full"
              >
                {!remoteUserJoined && (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="text-center">
                      <div className="w-24 h-24 rounded-full bg-primary/30 mx-auto mb-4 flex items-center justify-center animate-pulse">
                        <Video className="w-12 h-12 text-white" />
                      </div>
                      <p className="text-white text-lg font-medium">Waiting for other participant...</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Local video (small, top-right) */}
              <div
                ref={localVideoContainerRef}
                className="absolute top-4 right-4 w-28 h-40 sm:w-32 sm:h-48 rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl bg-black"
                style={{ transform: 'scaleX(-1)' }}
              >
                {!isCameraOn && (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900" style={{ transform: 'scaleX(-1)' }}>
                    <VideoOff className="w-8 h-8 text-white/50" />
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Audio call UI */
            <div className="w-full h-full flex items-center justify-center">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-center"
              >
                <div className="w-32 h-32 rounded-full bg-gradient-to-br from-primary/40 to-accent/40 mx-auto mb-4 flex items-center justify-center shadow-2xl">
                  <Avatar className="w-28 h-28">
                    <AvatarImage src={callConfig.avatarUrl || ''} />
                    <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-primary-foreground text-3xl font-bold">
                      {callConfig.displayName?.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <p className="text-white text-xl font-medium">{callConfig.displayName}</p>
                <p className="text-white/60 text-sm mt-2">{formatDuration(callDuration)}</p>
              </motion.div>
            </div>
          )}

          {/* Call duration badge */}
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="absolute top-4 left-4 bg-black/40 backdrop-blur-sm rounded-full px-4 py-2"
          >
            <span className="text-white text-sm font-medium">
              {formatDuration(callDuration)}
            </span>
          </motion.div>

          {/* Controls */}
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="absolute bottom-0 left-0 right-0 pb-10 pt-8 px-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent"
          >
            <div className="flex items-center justify-center gap-5 max-w-sm mx-auto">
              {isVideoCall && (
                <Button
                  onClick={switchCamera}
                  size="lg"
                  className="rounded-full w-14 h-14 p-0 bg-white/20 hover:bg-white/30 border-0 backdrop-blur-sm"
                >
                  <SwitchCamera className="w-6 h-6 text-white" />
                </Button>
              )}

              {isVideoCall && (
                <Button
                  onClick={toggleCamera}
                  size="lg"
                  variant={isCameraOn ? "secondary" : "destructive"}
                  className={`rounded-full w-14 h-14 p-0 ${isCameraOn ? 'bg-white/20 hover:bg-white/30 border-0 backdrop-blur-sm' : ''}`}
                >
                  {isCameraOn ? <Video className="w-6 h-6 text-white" /> : <VideoOff className="w-6 h-6" />}
                </Button>
              )}

              <Button
                onClick={toggleMic}
                size="lg"
                variant={isMicOn ? "secondary" : "destructive"}
                className={`rounded-full w-14 h-14 p-0 ${isMicOn ? 'bg-white/20 hover:bg-white/30 border-0 backdrop-blur-sm' : ''}`}
              >
                {isMicOn ? <Mic className="w-6 h-6 text-white" /> : <MicOff className="w-6 h-6" />}
              </Button>

              <Button
                onClick={handleEndCall}
                size="lg"
                variant="destructive"
                className="rounded-full w-16 h-16 p-0 shadow-lg shadow-destructive/40"
              >
                <PhoneOff className="w-7 h-7" />
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Error state */}
      {initError && callState === 'accepted' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background">
          <p className="text-destructive text-lg mb-4">{initError}</p>
          <Button onClick={handleEndCall} variant="destructive" className="rounded-full">
            <PhoneOff className="w-5 h-5 mr-2" />
            End Call
          </Button>
        </div>
      )}

      {/* Loading overlay */}
      {callState === 'accepted' && !joined && !initError && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background">
          <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
          <span className="text-muted-foreground text-lg">Connecting...</span>
        </div>
      )}
    </motion.div>
  );
});

AgoraCallScreen.displayName = 'AgoraCallScreen';

export default AgoraCallScreen;
