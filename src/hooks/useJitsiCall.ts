import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// Call state machine - DB is source of truth
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

interface JitsiCallConfig {
  roomName: string;
  displayName: string;
  avatarUrl?: string;
  isVideoCall: boolean;
  conversationId?: string;
  isGroup?: boolean;
  callId?: string;
}

interface JitsiApi {
  executeCommand: (command: string, ...args: any[]) => void;
  addEventListener: (event: string, handler: (...args: any[]) => void) => void;
  removeEventListener: (event: string, handler: (...args: any[]) => void) => void;
  dispose: () => void;
  getNumberOfParticipants: () => number;
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

declare global {
  interface Window {
    JitsiMeetExternalAPI: new (domain: string, options: any) => JitsiApi;
  }
}

export const useJitsiCall = (currentUserId: string) => {
  // Local UI state
  const [callState, setCallState] = useState<CallState>('idle');
  const [isInCall, setIsInCall] = useState(false);
  const [isVideoCall, setIsVideoCall] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [callConfig, setCallConfig] = useState<JitsiCallConfig | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  
  // Refs
  const apiRef = useRef<JitsiApi | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const callStartTimeRef = useRef<number | null>(null);
  const incomingRingtone = useRef<HTMLAudioElement | null>(null);
  const outgoingRingtone = useRef<HTMLAudioElement | null>(null);
  const callTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const activeCallIdRef = useRef<string | null>(null);
  const subscriptionRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  
  const { toast } = useToast();

  // ==========================================
  // AUDIO: Initialize ringtones
  // ==========================================
  useEffect(() => {
    incomingRingtone.current = new Audio('/ringtones/incoming-call.mp3');
    outgoingRingtone.current = new Audio('/ringtones/outgoing-call.mp3');
    incomingRingtone.current.loop = true;
    outgoingRingtone.current.loop = true;
    
    // Preload
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

  // ==========================================
  // UTILS
  // ==========================================
  const clearCallTimeout = useCallback(() => {
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }
  }, []);

  const generateRoomName = useCallback((conversationId: string) => {
    return `campustalks_${conversationId}`.replace(/-/g, '').substring(0, 30);
  }, []);

  // ==========================================
  // CALL DURATION TIMER
  // ==========================================
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
  // REALTIME: Listen for incoming calls & state changes
  // ==========================================
  useEffect(() => {
    if (!currentUserId) return;

    // Subscribe to active_calls for incoming calls
    const channel = supabase
      .channel(`call_signaling:${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'active_calls',
        },
        async (payload) => {
          const call = payload.new as ActiveCall;
          
          // Skip if I'm the caller or call isn't for me
          if (call.initiated_by === currentUserId) return;
          if (call.receiver_id && call.receiver_id !== currentUserId) return;
          if (!call.is_active || call.call_state !== 'calling') return;

          // Check if I'm a participant in this conversation
          const { data: participant } = await supabase
            .from('conversation_participants')
            .select('user_id')
            .eq('conversation_id', call.conversation_id)
            .eq('user_id', currentUserId)
            .single();

          if (!participant) return;

          // Get caller info
          const { data: callerProfile } = await supabase
            .from('profiles')
            .select('full_name, avatar_url')
            .eq('id', call.initiated_by)
            .single();

          console.log('📞 INCOMING CALL DETECTED:', call.id);
          
          // Show incoming call UI
          setIncomingCall({
            callId: call.id,
            callerId: call.initiated_by,
            callerName: callerProfile?.full_name || 'Unknown',
            callerAvatar: callerProfile?.avatar_url || null,
            roomName: call.room_name,
            isVideo: call.call_type === 'video',
            conversationId: call.conversation_id,
          });

          // Play incoming ringtone
          playIncomingRingtone();

          // Update call state to 'ringing'
          await supabase
            .from('active_calls')
            .update({ call_state: 'ringing' })
            .eq('id', call.id);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'active_calls',
        },
        (payload) => {
          const call = payload.new as ActiveCall;
          
          console.log('📞 CALL STATE UPDATE:', call.call_state, call.id);

          // Handle state changes for CALLER
          if (call.initiated_by === currentUserId) {
            switch (call.call_state) {
              case 'ringing':
                // Receiver acknowledged - keep ringing
                setCallState('ringing');
                break;
              case 'accepted':
                // Receiver accepted - CONNECT TO JITSI
                console.log('✅ Call accepted - connecting to Jitsi');
                stopAllRingtones();
                clearCallTimeout();
                setCallState('accepted');
                // Jitsi will initialize via initializeJitsi callback
                break;
              case 'rejected':
                console.log('❌ Call rejected');
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
              // Caller ended or timed out
              stopAllRingtones();
              setIncomingCall(null);
              if (activeCallIdRef.current === call.id) {
                setCallState('idle');
                setIsInCall(false);
                setCallConfig(null);
              }
            }
          }
        }
      )
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
  // START CALL (Caller initiates)
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

    // ⚡ INSTANT UI - Show calling screen immediately
    setCallState('calling');
    setIsVideoCall(isVideo);
    setIsCameraOn(isVideo);
    setIsMicOn(true);
    setIsInCall(true);
    setCallDuration(0);
    setIsScreenSharing(false);

    // Get my profile for display
    const { data: myProfile } = await supabase
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', currentUserId)
      .single();

    // Get other user's profile for UI
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

    // Play outgoing ringtone
    playOutgoingRingtone();

    try {
      // Create active call record in DB - THIS IS THE SIGNAL
      const { data: activeCall, error } = await supabase
        .from('active_calls')
        .insert({
          conversation_id: conversationId,
          room_name: roomName,
          call_type: isVideo ? 'video' : 'audio',
          initiated_by: currentUserId,
          receiver_id: isGroup ? null : otherUserId, // null for group calls
          call_state: 'calling',
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      console.log('📞 CALL CREATED:', activeCall.id);
      activeCallIdRef.current = activeCall.id;
      setCallConfig(prev => prev ? { ...prev, callId: activeCall.id } : null);

      // Add self as participant
      await supabase.from('call_participants').insert({
        call_id: activeCall.id,
        user_id: currentUserId,
      });

      // Also send push notification as backup (for backgrounded apps)
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

      // Log the call
      await supabase.from('call_logs').insert({
        caller_id: currentUserId,
        receiver_id: otherUserId,
        conversation_id: conversationId,
        call_type: isVideo ? 'video' : 'audio',
        call_status: 'initiated',
      });

      // Set timeout for unanswered call (35 seconds)
      callTimeoutRef.current = setTimeout(async () => {
        console.log('⏱️ Call timeout - marking as missed');
        stopAllRingtones();
        
        // Update DB state to missed
        await supabase
          .from('active_calls')
          .update({ call_state: 'missed', is_active: false })
          .eq('id', activeCall.id);

        // Update call log
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
  // ACCEPT CALL (Receiver accepts)
  // ==========================================
  const acceptCall = useCallback(async () => {
    if (!incomingCall) return;

    console.log('✅ Accepting call:', incomingCall.callId);
    stopAllRingtones();

    // Get my profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', currentUserId)
      .single();

    // Update local state
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

    // Update DB - THIS SIGNALS CALLER TO CONNECT
    await supabase
      .from('active_calls')
      .update({ call_state: 'accepted' })
      .eq('id', incomingCall.callId);

    // Add self as participant
    await supabase.from('call_participants').insert({
      call_id: incomingCall.callId,
      user_id: currentUserId,
    });

    setIncomingCall(null);
  }, [incomingCall, currentUserId, stopAllRingtones]);

  // ==========================================
  // DECLINE CALL (Receiver declines)
  // ==========================================
  const declineCall = useCallback(async () => {
    if (!incomingCall) return;

    console.log('❌ Declining call:', incomingCall.callId);
    stopAllRingtones();

    // Update DB - THIS SIGNALS CALLER
    await supabase
      .from('active_calls')
      .update({ call_state: 'rejected', is_active: false })
      .eq('id', incomingCall.callId);

    setIncomingCall(null);
  }, [incomingCall, stopAllRingtones]);

  // ==========================================
  // JOIN ONGOING CALL (For group calls)
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
    console.log('📞 Ending call');
    clearCallTimeout();
    stopAllRingtones();

    // Stop duration timer
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    // Dispose Jitsi
    if (apiRef.current) {
      try {
        apiRef.current.dispose();
      } catch (e) {
        console.log('Jitsi dispose error:', e);
      }
      apiRef.current = null;
    }

    // Update DB
    if (activeCallIdRef.current) {
      // Mark participant as left
      await supabase
        .from('call_participants')
        .update({ left_at: new Date().toISOString() })
        .eq('call_id', activeCallIdRef.current)
        .eq('user_id', currentUserId);

      // Check remaining participants
      const { data: remaining } = await supabase
        .from('call_participants')
        .select('id')
        .eq('call_id', activeCallIdRef.current)
        .is('left_at', null);

      // If no one left, end the call
      if (!remaining || remaining.length === 0) {
        await supabase
          .from('active_calls')
          .update({ call_state: 'ended', is_active: false })
          .eq('id', activeCallIdRef.current);
      }

      // Update call log
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

    // Reset state
    setCallState('idle');
    setIsInCall(false);
    setCallConfig(null);
    setCallDuration(0);
    setIsScreenSharing(false);
    callStartTimeRef.current = null;
    activeCallIdRef.current = null;
  }, [callConfig, currentUserId, clearCallTimeout, stopAllRingtones]);

  // ==========================================
  // JITSI CONTROLS
  // ==========================================
  const toggleMic = useCallback(() => {
    if (apiRef.current) {
      apiRef.current.executeCommand('toggleAudio');
      setIsMicOn(prev => !prev);
    }
  }, []);

  const toggleCamera = useCallback(() => {
    if (apiRef.current) {
      apiRef.current.executeCommand('toggleVideo');
      setIsCameraOn(prev => !prev);
    }
  }, []);

  const toggleScreenShare = useCallback(() => {
    if (apiRef.current) {
      apiRef.current.executeCommand('toggleShareScreen');
    }
  }, []);

  const switchCamera = useCallback(() => {
    if (apiRef.current) {
      apiRef.current.executeCommand('toggleCamera');
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

  // ==========================================
  // INITIALIZE JITSI (Only after accepted!)
  // ==========================================
  const initializeJitsi = useCallback((container: HTMLDivElement) => {
    // CRITICAL: Only initialize after call is accepted
    if (!callConfig || callState !== 'accepted') {
      console.log('⚠️ Cannot init Jitsi - call not accepted yet');
      return;
    }

    if (!window.JitsiMeetExternalAPI) {
      // Poll for Jitsi
      const check = setInterval(() => {
        if (window.JitsiMeetExternalAPI) {
          clearInterval(check);
          initializeJitsi(container);
        }
      }, 100);
      setTimeout(() => clearInterval(check), 5000);
      return;
    }

    if (apiRef.current) return; // Already initialized
    containerRef.current = container;

    console.log('🎥 Initializing Jitsi for room:', callConfig.roomName);

    const options = {
      roomName: callConfig.roomName,
      parentNode: container,
      width: '100%',
      height: '100%',
      userInfo: {
        displayName: callConfig.displayName,
        avatarURL: callConfig.avatarUrl,
      },
      configOverwrite: {
        // Disable lobby/prejoin - direct connect
        enableLobby: false,
        lobbyModeEnabled: false,
        prejoinPageEnabled: false,
        enableWelcomePage: false,
        enableClosePage: false,
        requireDisplayName: false,
        disableModeratorIndicator: true,
        enableInsecureRoomNameWarning: false,
        
        // Audio/video
        startWithAudioMuted: !isMicOn,
        startWithVideoMuted: !callConfig.isVideoCall || !isCameraOn,
        
        // Quality
        resolution: 720,
        constraints: {
          video: { height: { ideal: 720, max: 720, min: 180 }, width: { ideal: 1280, max: 1280, min: 320 } },
        },
        enableLayerSuspension: true,
        channelLastN: 4,
        
        // P2P
        p2p: {
          enabled: true,
          stunServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ],
        },
        
        // Disable extras
        disableDeepLinking: true,
        disableThirdPartyRequests: true,
        disableInviteFunctions: true,
        disablePolls: true,
        disableReactions: true,
        hideConferenceSubject: true,
        hideConferenceTimer: true,
        disableJoinLeaveNotifications: true,
        notifications: [],
      },
      interfaceConfigOverwrite: {
        TOOLBAR_BUTTONS: [],
        TOOLBAR_ALWAYS_VISIBLE: false,
        INITIAL_TOOLBAR_TIMEOUT: 0,
        TOOLBAR_TIMEOUT: 0,
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        SHOW_BRAND_WATERMARK: false,
        SHOW_POWERED_BY: false,
        MOBILE_APP_PROMO: false,
        HIDE_INVITE_MORE_HEADER: true,
        DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
        SETTINGS_SECTIONS: [],
        VIDEO_LAYOUT_FIT: 'both',
        DISABLE_DOMINANT_SPEAKER_INDICATOR: true,
        DISABLE_FEEDBACK: true,
      },
    };

    try {
      const api = new window.JitsiMeetExternalAPI('meet.jit.si', options);
      apiRef.current = api;

      api.addEventListener('videoConferenceJoined', () => {
        console.log('✅ Jitsi: Conference joined');
        callStartTimeRef.current = Date.now();
      });

      api.addEventListener('videoConferenceLeft', () => {
        console.log('📞 Jitsi: Conference left');
        endCall();
      });

      api.addEventListener('readyToClose', () => endCall());

      api.addEventListener('audioMuteStatusChanged', ({ muted }: { muted: boolean }) => {
        setIsMicOn(!muted);
      });

      api.addEventListener('videoMuteStatusChanged', ({ muted }: { muted: boolean }) => {
        setIsCameraOn(!muted);
      });

      api.addEventListener('screenSharingStatusChanged', ({ on }: { on: boolean }) => {
        setIsScreenSharing(on);
        if (activeCallIdRef.current) {
          supabase
            .from('call_participants')
            .update({ is_screen_sharing: on })
            .eq('call_id', activeCallIdRef.current)
            .eq('user_id', currentUserId)
            .then(() => {});
        }
      });

      api.addEventListener('participantLeft', () => {
        try {
          const count = api.getNumberOfParticipants?.() || 1;
          if (count <= 1) {
            toast({ title: 'Call ended', description: 'The other participant left' });
            endCall();
          }
        } catch (e) {}
      });

    } catch (error) {
      console.error('Jitsi initialization error:', error);
      toast({ variant: 'destructive', title: 'Call failed', description: 'Could not connect' });
      endCall();
    }
  }, [callConfig, callState, isMicOn, isCameraOn, endCall, toast, currentUserId]);

  // Format duration
  const formatDuration = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  return {
    // State
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
    
    // Actions
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
    initializeJitsi,
    
    // Compatibility
    localStream: null,
    remoteStream: null,
    isFrontCamera: true,
    participants: [],
    jitsiReady: typeof window !== 'undefined' && !!window.JitsiMeetExternalAPI,
  };
};
