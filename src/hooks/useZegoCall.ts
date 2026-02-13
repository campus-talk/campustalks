import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type CallState = 'idle' | 'calling' | 'ringing' | 'accepted' | 'rejected' | 'ended' | 'missed';

interface ActiveCall {
  id: string;
  conversation_id: string;
  room_name: string;
  call_type: string;
  initiated_by: string;
  receiver_id: string | null;
  call_state: CallState;
  is_active: boolean;
  participant_count: number;
}

interface ZegoCallConfig {
  roomName: string;
  displayName: string;
  avatarUrl?: string;
  isVideoCall: boolean;
  conversationId?: string;
  isGroup?: boolean;
  callId?: string;
}

interface IncomingCallData {
  callId: string;
  callerId: string;
  callerName: string;
  callerAvatar: string | null;
  roomName: string;
  isVideo: boolean;
  conversationId: string;
}

const ZEGO_APP_ID = 884450076;
const ZEGO_SERVER = 'wss://webliveroom884450076-api.coolzcloud.com/ws';

let zegoEngine: any = null;
let zegoTokenCache: { token: string; expiry: number } | null = null;

async function getZegoToken(): Promise<string> {
  // Return cached token if still valid (with 5min buffer)
  if (zegoTokenCache && zegoTokenCache.expiry > Date.now() + 300000) {
    return zegoTokenCache.token;
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');

  const { data, error } = await supabase.functions.invoke('generate-zego-token', {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (error || !data?.token) throw new Error('Token generation failed');

  zegoTokenCache = {
    token: data.token,
    expiry: Date.now() + 82800000, // ~23 hours
  };

  return data.token;
}

async function getEngine(): Promise<any> {
  if (zegoEngine) return zegoEngine;

  const { ZegoExpressEngine } = await import('zego-express-engine-webrtc');
  zegoEngine = new ZegoExpressEngine(ZEGO_APP_ID, ZEGO_SERVER);
  return zegoEngine;
}

export const useZegoCall = (currentUserId: string) => {
  const [callState, setCallState] = useState<CallState>('idle');
  const [isInCall, setIsInCall] = useState(false);
  const [isVideoCall, setIsVideoCall] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [callConfig, setCallConfig] = useState<ZegoCallConfig | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

  const callStartTimeRef = useRef<number | null>(null);
  const incomingRingtone = useRef<HTMLAudioElement | null>(null);
  const outgoingRingtone = useRef<HTMLAudioElement | null>(null);
  const callTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const activeCallIdRef = useRef<string | null>(null);
  const subscriptionRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  const { toast } = useToast();

  // Audio ringtones
  useEffect(() => {
    incomingRingtone.current = new Audio('/ringtones/incoming-call.mp3');
    outgoingRingtone.current = new Audio('/ringtones/outgoing-call.mp3');
    incomingRingtone.current.loop = true;
    outgoingRingtone.current.loop = true;
    incomingRingtone.current.load();
    outgoingRingtone.current.load();

    return () => {
      incomingRingtone.current?.pause();
      outgoingRingtone.current?.pause();
    };
  }, []);

  const playOutgoingRingtone = useCallback(() => {
    outgoingRingtone.current?.play().catch(() => {});
  }, []);

  const playIncomingRingtone = useCallback(() => {
    incomingRingtone.current?.play().catch(() => {});
  }, []);

  const stopAllRingtones = useCallback(() => {
    outgoingRingtone.current?.pause();
    incomingRingtone.current?.pause();
    if (outgoingRingtone.current) outgoingRingtone.current.currentTime = 0;
    if (incomingRingtone.current) incomingRingtone.current.currentTime = 0;
  }, []);

  const clearCallTimeout = useCallback(() => {
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }
  }, []);

  const generateRoomName = useCallback((conversationId: string) => {
    return `ct_${conversationId}`.replace(/-/g, '').substring(0, 30);
  }, []);

  // Call duration timer
  useEffect(() => {
    if (callState === 'accepted' && !durationIntervalRef.current) {
      callStartTimeRef.current = Date.now();
      durationIntervalRef.current = setInterval(() => {
        if (callStartTimeRef.current) {
          setCallDuration(Math.floor((Date.now() - callStartTimeRef.current) / 1000));
        }
      }, 1000);
    }
    if (callState !== 'accepted' && durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    };
  }, [callState]);

  // ==========================================
  // ZEGO ENGINE: Setup event listeners
  // ==========================================
  const setupZegoListeners = useCallback(async () => {
    const engine = await getEngine();

    engine.on('roomStreamUpdate', async (_roomID: string, updateType: string, streamList: any[]) => {
      if (updateType === 'ADD') {
        for (const stream of streamList) {
          try {
            const remoteStream = await engine.startPlayingStream(stream.streamID);
            setRemoteStreams(prev => {
              const next = new Map(prev);
              next.set(stream.streamID, remoteStream);
              return next;
            });
          } catch (e) {
            console.error('Failed to play remote stream:', e);
          }
        }
      } else if (updateType === 'DELETE') {
        for (const stream of streamList) {
          engine.stopPlayingStream(stream.streamID);
          setRemoteStreams(prev => {
            const next = new Map(prev);
            next.delete(stream.streamID);
            return next;
          });
        }
      }
    });

    engine.on('roomStateChanged', (_roomID: string, reason: string, _errorCode: number) => {
      if (reason === 'LOGOUT' || reason === 'KICK_OUT') {
        console.log('📞 Zego room disconnected:', reason);
      }
    });

    engine.on('publisherStateUpdate', (result: any) => {
      console.log('📞 Publisher state:', result.state);
    });

    engine.on('playerStateUpdate', (result: any) => {
      console.log('📞 Player state:', result.state);
    });
  }, []);

  // ==========================================
  // CONNECT TO ZEGO ROOM
  // ==========================================
  const connectToZegoRoom = useCallback(async (roomName: string, isVideo: boolean) => {
    try {
      const engine = await getEngine();
      await setupZegoListeners();

      const token = await getZegoToken();

      // Login to room
      await engine.loginRoom(roomName, token, {
        userID: currentUserId,
        userName: callConfig?.displayName || 'User',
      }, { userUpdate: true });

      // Create and publish local stream
      const stream = await engine.createStream({
        camera: {
          audio: true,
          video: isVideo,
          videoQuality: 4, // 720p
          width: 1280,
          height: 720,
          frameRate: 30,
        },
      });

      localStreamRef.current = stream;
      setLocalStream(stream);

      const streamID = `${currentUserId}_main`;
      await engine.startPublishingStream(streamID, stream);

      console.log('✅ Zego: Connected and publishing');
    } catch (error) {
      console.error('Zego connection error:', error);
      toast({ variant: 'destructive', title: 'Call failed', description: 'Could not connect to call' });
    }
  }, [currentUserId, callConfig, setupZegoListeners, toast]);

  // ==========================================
  // REALTIME: Listen for incoming calls
  // ==========================================
  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel(`call_signaling:${currentUserId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'active_calls',
      }, async (payload) => {
        const call = payload.new as ActiveCall;
        if (call.initiated_by === currentUserId) return;
        if (call.receiver_id && call.receiver_id !== currentUserId) return;
        if (!call.is_active || call.call_state !== 'calling') return;

        const { data: participant } = await supabase
          .from('conversation_participants')
          .select('user_id')
          .eq('conversation_id', call.conversation_id)
          .eq('user_id', currentUserId)
          .single();

        if (!participant) return;

        const { data: callerProfile } = await supabase
          .from('profiles')
          .select('full_name, avatar_url')
          .eq('id', call.initiated_by)
          .single();

        setIncomingCall({
          callId: call.id,
          callerId: call.initiated_by,
          callerName: callerProfile?.full_name || 'Unknown',
          callerAvatar: callerProfile?.avatar_url || null,
          roomName: call.room_name,
          isVideo: call.call_type === 'video',
          conversationId: call.conversation_id,
        });

        playIncomingRingtone();

        await supabase
          .from('active_calls')
          .update({ call_state: 'ringing' })
          .eq('id', call.id);
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'active_calls',
      }, (payload) => {
        const call = payload.new as ActiveCall;

        // Handle state changes for CALLER
        if (call.initiated_by === currentUserId) {
          switch (call.call_state) {
            case 'ringing':
              setCallState('ringing');
              break;
            case 'accepted':
              console.log('✅ Call accepted - connecting to Zego');
              stopAllRingtones();
              clearCallTimeout();
              setCallState('accepted');
              break;
            case 'rejected':
              stopAllRingtones();
              clearCallTimeout();
              setCallState('idle');
              setIsInCall(false);
              setCallConfig(null);
              toast({ title: 'Call rejected', description: 'The call was declined' });
              break;
            case 'ended':
            case 'missed':
              stopAllRingtones();
              clearCallTimeout();
              setCallState('idle');
              setIsInCall(false);
              setCallConfig(null);
              break;
          }
        }

        // Handle state changes for RECEIVER
        if (call.receiver_id === currentUserId || call.initiated_by !== currentUserId) {
          if (call.call_state === 'ended' || call.call_state === 'missed') {
            stopAllRingtones();
            setIncomingCall(null);
            if (activeCallIdRef.current === call.id) {
              setCallState('idle');
              setIsInCall(false);
              setCallConfig(null);
            }
          }
        }
      })
      .subscribe();

    subscriptionRef.current = channel;

    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
    };
  }, [currentUserId, playIncomingRingtone, stopAllRingtones, clearCallTimeout, toast]);

  // ==========================================
  // CONNECT when call state becomes accepted
  // ==========================================
  useEffect(() => {
    if (callState === 'accepted' && callConfig?.roomName) {
      connectToZegoRoom(callConfig.roomName, callConfig.isVideoCall);
    }
  }, [callState, callConfig?.roomName, callConfig?.isVideoCall, connectToZegoRoom]);

  // ==========================================
  // START CALL
  // ==========================================
  const startCall = useCallback(async (
    otherUserId: string,
    isVideo: boolean = true,
    conversationId?: string,
    isGroup: boolean = false,
    displayName: string = 'User'
  ) => {
    if (!conversationId) {
      toast({ variant: 'destructive', title: 'Error', description: 'No conversation ID' });
      return;
    }

    const roomName = generateRoomName(conversationId);

    setCallState('calling');
    setIsVideoCall(isVideo);
    setIsCameraOn(isVideo);
    setIsMicOn(true);
    setIsInCall(true);
    setCallDuration(0);
    setIsScreenSharing(false);

    const { data: myProfile } = await supabase
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', currentUserId)
      .single();

    const { data: otherProfile } = await supabase
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', otherUserId)
      .single();

    setCallConfig({
      roomName,
      displayName: myProfile?.full_name || displayName,
      avatarUrl: otherProfile?.avatar_url || undefined,
      isVideoCall: isVideo,
      conversationId,
      isGroup,
    });

    playOutgoingRingtone();

    try {
      const { data: activeCall, error } = await supabase
        .from('active_calls')
        .insert({
          conversation_id: conversationId,
          room_name: roomName,
          call_type: isVideo ? 'video' : 'audio',
          initiated_by: currentUserId,
          receiver_id: isGroup ? null : otherUserId,
          call_state: 'calling',
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      activeCallIdRef.current = activeCall.id;
      setCallConfig(prev => prev ? { ...prev, callId: activeCall.id } : null);

      await supabase.from('call_participants').insert({
        call_id: activeCall.id,
        user_id: currentUserId,
      });

      // Push notification backup
      supabase.functions.invoke('send-push-notification', {
        body: {
          type: 'call',
          recipientIds: [otherUserId],
          senderId: currentUserId,
          senderName: myProfile?.full_name || 'Someone',
          callType: isVideo ? 'video' : 'audio',
          conversationId,
        },
      }).catch(() => {});

      // Log call
      await supabase.from('call_logs').insert({
        caller_id: currentUserId,
        receiver_id: otherUserId,
        conversation_id: conversationId,
        call_type: isVideo ? 'video' : 'audio',
        call_status: 'initiated',
      });

      // 35s timeout
      callTimeoutRef.current = setTimeout(async () => {
        stopAllRingtones();
        await supabase
          .from('active_calls')
          .update({ call_state: 'missed', is_active: false })
          .eq('id', activeCall.id);

        await supabase
          .from('call_logs')
          .update({ call_status: 'missed' })
          .eq('conversation_id', conversationId)
          .eq('caller_id', currentUserId)
          .order('created_at', { ascending: false })
          .limit(1);

        setCallState('idle');
        setIsInCall(false);
        setCallConfig(null);
        toast({ title: 'No answer', description: 'The call was not answered' });
      }, 35000);
    } catch (error) {
      console.error('Error starting call:', error);
      stopAllRingtones();
      setCallState('idle');
      setIsInCall(false);
      setCallConfig(null);
      toast({ variant: 'destructive', title: 'Call failed', description: 'Could not start call' });
    }
  }, [currentUserId, generateRoomName, playOutgoingRingtone, stopAllRingtones, toast]);

  const startAudioCall = useCallback(async (
    otherUserId: string,
    conversationId?: string,
    isGroup: boolean = false
  ) => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', currentUserId)
      .single();
    await startCall(otherUserId, false, conversationId, isGroup, profile?.full_name || 'User');
  }, [startCall, currentUserId]);

  // ==========================================
  // ACCEPT CALL
  // ==========================================
  const acceptCall = useCallback(async () => {
    if (!incomingCall) return;

    stopAllRingtones();

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', currentUserId)
      .single();

    setCallState('accepted');
    setIsVideoCall(incomingCall.isVideo);
    setIsCameraOn(incomingCall.isVideo);
    setIsMicOn(true);
    setIsInCall(true);
    setCallDuration(0);
    activeCallIdRef.current = incomingCall.callId;

    setCallConfig({
      roomName: incomingCall.roomName,
      displayName: profile?.full_name || 'User',
      avatarUrl: profile?.avatar_url || undefined,
      isVideoCall: incomingCall.isVideo,
      conversationId: incomingCall.conversationId,
      isGroup: false,
      callId: incomingCall.callId,
    });

    await supabase
      .from('active_calls')
      .update({ call_state: 'accepted' })
      .eq('id', incomingCall.callId);

    await supabase.from('call_participants').insert({
      call_id: incomingCall.callId,
      user_id: currentUserId,
    });

    setIncomingCall(null);
  }, [incomingCall, currentUserId, stopAllRingtones]);

  // ==========================================
  // DECLINE CALL
  // ==========================================
  const declineCall = useCallback(async () => {
    if (!incomingCall) return;
    stopAllRingtones();

    await supabase
      .from('active_calls')
      .update({ call_state: 'rejected', is_active: false })
      .eq('id', incomingCall.callId);

    setIncomingCall(null);
  }, [incomingCall, stopAllRingtones]);

  // ==========================================
  // JOIN ONGOING CALL
  // ==========================================
  const joinCall = useCallback(async (
    roomName: string,
    isVideo: boolean,
    conversationId: string,
    callId?: string
  ) => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', currentUserId)
      .single();

    setCallState('accepted');
    setIsVideoCall(isVideo);
    setIsCameraOn(isVideo);
    setIsMicOn(true);
    setIsInCall(true);
    setCallDuration(0);

    if (callId) {
      activeCallIdRef.current = callId;
      await supabase.from('call_participants').insert({
        call_id: callId,
        user_id: currentUserId,
      });
    }

    setCallConfig({
      roomName,
      displayName: profile?.full_name || 'User',
      avatarUrl: profile?.avatar_url || undefined,
      isVideoCall: isVideo,
      conversationId,
      isGroup: true,
      callId,
    });
  }, [currentUserId]);

  // ==========================================
  // END CALL
  // ==========================================
  const endCall = useCallback(async () => {
    clearCallTimeout();
    stopAllRingtones();

    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    // Stop local streams
    if (localStreamRef.current) {
      const tracks = localStreamRef.current.getTracks();
      tracks.forEach(track => track.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    }

    if (screenStreamRef.current) {
      const tracks = screenStreamRef.current.getTracks();
      tracks.forEach(track => track.stop());
      screenStreamRef.current = null;
    }

    // Cleanup Zego
    try {
      const engine = await getEngine();
      engine.stopPublishingStream(`${currentUserId}_main`);
      engine.stopPublishingStream(`${currentUserId}_screen`);
      
      // Stop all remote streams
      remoteStreams.forEach((_stream, streamID) => {
        engine.stopPlayingStream(streamID);
      });
      setRemoteStreams(new Map());

      if (callConfig?.roomName) {
        await engine.logoutRoom(callConfig.roomName);
      }
    } catch (e) {
      console.log('Zego cleanup error:', e);
    }

    // Update DB
    if (activeCallIdRef.current) {
      await supabase
        .from('call_participants')
        .update({ left_at: new Date().toISOString() })
        .eq('call_id', activeCallIdRef.current)
        .eq('user_id', currentUserId);

      const { data: remaining } = await supabase
        .from('call_participants')
        .select('id')
        .eq('call_id', activeCallIdRef.current)
        .is('left_at', null);

      if (!remaining || remaining.length === 0) {
        await supabase
          .from('active_calls')
          .update({ call_state: 'ended', is_active: false })
          .eq('id', activeCallIdRef.current);
      }

      if (callStartTimeRef.current && callConfig?.conversationId) {
        const durationSeconds = Math.floor((Date.now() - callStartTimeRef.current) / 1000);
        await supabase
          .from('call_logs')
          .update({
            call_status: 'ended',
            duration_seconds: durationSeconds,
            ended_at: new Date().toISOString(),
          })
          .eq('conversation_id', callConfig.conversationId)
          .eq('caller_id', currentUserId)
          .order('created_at', { ascending: false })
          .limit(1);
      }
    }

    setCallState('idle');
    setIsInCall(false);
    setCallConfig(null);
    setCallDuration(0);
    setIsScreenSharing(false);
    callStartTimeRef.current = null;
    activeCallIdRef.current = null;
  }, [callConfig, currentUserId, clearCallTimeout, stopAllRingtones, remoteStreams]);

  // ==========================================
  // CONTROLS
  // ==========================================
  const toggleMic = useCallback(async () => {
    try {
      const engine = await getEngine();
      const newState = !isMicOn;
      engine.muteMicrophone(!newState);
      setIsMicOn(newState);
    } catch (e) {
      console.error('Toggle mic error:', e);
    }
  }, [isMicOn]);

  const toggleCamera = useCallback(async () => {
    try {
      const engine = await getEngine();
      const newState = !isCameraOn;
      if (localStreamRef.current) {
        await engine.mutePublishStreamVideo(localStreamRef.current, !newState);
      }
      setIsCameraOn(newState);
    } catch (e) {
      console.error('Toggle camera error:', e);
    }
  }, [isCameraOn]);

  const toggleScreenShare = useCallback(async () => {
    try {
      const engine = await getEngine();
      if (isScreenSharing) {
        // Stop screen sharing
        engine.stopPublishingStream(`${currentUserId}_screen`);
        if (screenStreamRef.current) {
          screenStreamRef.current.getTracks().forEach(t => t.stop());
          screenStreamRef.current = null;
        }
        setIsScreenSharing(false);
      } else {
        // Start screen sharing
        const screenStream = await engine.createStream({ screen: { audio: true, video: true } });
        screenStreamRef.current = screenStream;
        await engine.startPublishingStream(`${currentUserId}_screen`, screenStream);
        setIsScreenSharing(true);
      }

      if (activeCallIdRef.current) {
        supabase
          .from('call_participants')
          .update({ is_screen_sharing: !isScreenSharing })
          .eq('call_id', activeCallIdRef.current)
          .eq('user_id', currentUserId)
          .then(() => {});
      }
    } catch (e) {
      console.error('Screen share error:', e);
      toast({ variant: 'destructive', title: 'Screen share failed' });
    }
  }, [isScreenSharing, currentUserId, toast]);

  const switchCamera = useCallback(async () => {
    try {
      const engine = await getEngine();
      const devices = await engine.enumDevices();
      const videoDevices = devices?.cameras || [];
      if (videoDevices.length > 1) {
        // Cycle through cameras
        // ZegoExpressEngine handles this internally
        if (localStreamRef.current) {
          await engine.useVideoDevice(localStreamRef.current, videoDevices[1].deviceID);
        }
      }
    } catch (e) {
      console.error('Switch camera error:', e);
    }
  }, []);

  const inviteToCall = useCallback(async (userIds: string[]) => {
    if (!callConfig?.conversationId || !callConfig.roomName) return;

    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', currentUserId)
      .single();

    for (const userId of userIds) {
      await supabase.from('notifications').insert({
        user_id: userId,
        type: callConfig.isVideoCall ? 'incoming_call' : 'call',
        title: `${callerProfile?.full_name} invited you to a ${callConfig.isVideoCall ? 'video' : 'voice'} call`,
        body: 'Tap to join',
        sender_id: currentUserId,
        conversation_id: callConfig.conversationId,
      });

      supabase.functions.invoke('send-push-notification', {
        body: {
          type: 'call',
          recipientIds: [userId],
          senderId: currentUserId,
          senderName: callerProfile?.full_name || 'Someone',
          callType: callConfig.isVideoCall ? 'video' : 'audio',
          conversationId: callConfig.conversationId,
        },
      }).catch(() => {});
    }

    toast({ title: 'Invitation sent', description: `Invited ${userIds.length} user(s)` });
  }, [callConfig, currentUserId, toast]);

  // Format duration
  const formatDuration = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  return {
    callState,
    isInCall,
    isVideoCall,
    isMicOn,
    isCameraOn,
    isScreenSharing,
    incomingCall,
    callConfig,
    callDuration,
    formattedDuration: formatDuration(callDuration),
    localStream,
    remoteStreams,

    startCall,
    startAudioCall,
    joinCall,
    acceptCall,
    declineCall,
    endCall,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
    switchCamera,
    inviteToCall,

    // Compatibility (no longer needed but kept for interface)
    remoteStream: remoteStreams.size > 0 ? Array.from(remoteStreams.values())[0] : null,
    isFrontCamera: true,
    participants: [],
  };
};
