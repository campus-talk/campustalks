import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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

interface IncomingCall {
  callerId: string;
  callerName: string;
  callerAvatar: string | null;
  roomName: string;
  isVideo: boolean;
  conversationId?: string;
  callId?: string;
}

interface CallParticipant {
  id: string;
  user_id: string;
  full_name?: string;
  avatar_url?: string;
}

declare global {
  interface Window {
    JitsiMeetExternalAPI: new (domain: string, options: any) => JitsiApi;
  }
}

export type CallState = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended';

export const useJitsiCall = (currentUserId: string) => {
  // Call state - INSTANT UI
  const [callState, setCallState] = useState<CallState>('idle');
  const [isInCall, setIsInCall] = useState(false);
  const [isVideoCall, setIsVideoCall] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [callConfig, setCallConfig] = useState<JitsiCallConfig | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [participants, setParticipants] = useState<CallParticipant[]>([]);
  const [callDuration, setCallDuration] = useState(0);
  const [jitsiReady, setJitsiReady] = useState(false);
  
  // Refs
  const apiRef = useRef<JitsiApi | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const callStartTimeRef = useRef<number | null>(null);
  const incomingRingtone = useRef<HTMLAudioElement | null>(null);
  const outgoingRingtone = useRef<HTMLAudioElement | null>(null);
  const callTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const activeCallIdRef = useRef<string | null>(null);
  
  const { toast } = useToast();

  // Initialize ringtones
  useEffect(() => {
    incomingRingtone.current = new Audio('/ringtones/incoming-call.mp3');
    outgoingRingtone.current = new Audio('/ringtones/outgoing-call.mp3');
    incomingRingtone.current.loop = true;
    outgoingRingtone.current.loop = true;

    return () => {
      incomingRingtone.current?.pause();
      outgoingRingtone.current?.pause();
    };
  }, []);

  // Check if Jitsi is preloaded (loaded in AppShell)
  useEffect(() => {
    const checkJitsiReady = () => {
      if (window.JitsiMeetExternalAPI) {
        setJitsiReady(true);
        return true;
      }
      return false;
    };

    // Check immediately
    if (checkJitsiReady()) return;

    // Poll for Jitsi availability (in case preload is still loading)
    const interval = setInterval(() => {
      if (checkJitsiReady()) {
        clearInterval(interval);
      }
    }, 100);

    // Fallback: load script if not available after 2 seconds
    const fallbackTimeout = setTimeout(() => {
      if (!window.JitsiMeetExternalAPI) {
        const existingScript = document.getElementById('jitsi-api-script');
        if (!existingScript) {
          const script = document.createElement('script');
          script.id = 'jitsi-api-script';
          script.src = 'https://meet.jit.si/external_api.js';
          script.async = true;
          script.onload = () => setJitsiReady(true);
          document.head.appendChild(script);
        }
      }
    }, 2000);

    return () => {
      clearInterval(interval);
      clearTimeout(fallbackTimeout);
    };
  }, []);

  // Call duration timer
  useEffect(() => {
    if (callState === 'connected' && !durationIntervalRef.current) {
      callStartTimeRef.current = Date.now();
      durationIntervalRef.current = setInterval(() => {
        if (callStartTimeRef.current) {
          setCallDuration(Math.floor((Date.now() - callStartTimeRef.current) / 1000));
        }
      }, 1000);
    }

    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    };
  }, [callState]);

  // Listen for incoming calls via realtime
  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel(`incoming_calls:${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${currentUserId}`,
        },
        async (payload) => {
          const notification = payload.new as any;
          if (notification.type === 'incoming_call' || notification.type === 'call') {
            // Don't show if already in a call
            if (isInCall) return;

            incomingRingtone.current?.play().catch(console.log);
            
            const { data: callerProfile } = await supabase
              .from('profiles')
              .select('full_name, avatar_url')
              .eq('id', notification.sender_id)
              .single();

            setIncomingCall({
              callerId: notification.sender_id,
              callerName: callerProfile?.full_name || 'Unknown',
              callerAvatar: callerProfile?.avatar_url,
              roomName: notification.conversation_id || `call_${notification.sender_id}_${currentUserId}`,
              isVideo: notification.type === 'incoming_call',
              conversationId: notification.conversation_id,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, isInCall]);

  const clearCallTimeout = () => {
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }
  };

  const stopRingtones = () => {
    outgoingRingtone.current?.pause();
    incomingRingtone.current?.pause();
    if (outgoingRingtone.current) outgoingRingtone.current.currentTime = 0;
    if (incomingRingtone.current) incomingRingtone.current.currentTime = 0;
  };

  const generateRoomName = (otherUserId: string, conversationId?: string) => {
    if (conversationId) {
      return `campustalks_${conversationId}`.replace(/-/g, '').substring(0, 30);
    }
    const ids = [currentUserId, otherUserId].sort();
    return `campustalks_${ids.join('_')}`.replace(/-/g, '').substring(0, 40);
  };

  // OPTIMISTIC CALL START - UI shows immediately
  const startCall = useCallback(async (
    otherUserId: string, 
    isVideo: boolean = true, 
    conversationId?: string,
    isGroup: boolean = false,
    displayName: string = 'User'
  ) => {
    // INSTANT UI - Show call screen immediately
    const roomName = generateRoomName(otherUserId, conversationId);
    
    // Get caller profile first for better UX
    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', currentUserId)
      .single();

    // INSTANT STATE CHANGE
    setCallState('calling');
    setIsVideoCall(isVideo);
    setIsCameraOn(isVideo);
    setIsMicOn(true);
    setIsInCall(true);
    setCallDuration(0);
    
    setCallConfig({
      roomName,
      displayName: callerProfile?.full_name || displayName,
      avatarUrl: callerProfile?.avatar_url || undefined,
      isVideoCall: isVideo,
      conversationId,
      isGroup,
    });

    // Play outgoing ringtone
    outgoingRingtone.current?.play().catch(console.log);

    // Background tasks - don't block UI
    try {
      // Create active call record
      const { data: activeCall } = await supabase
        .from('active_calls')
        .insert({
          conversation_id: conversationId,
          room_name: roomName,
          call_type: isVideo ? 'video' : 'audio',
          initiated_by: currentUserId,
        })
        .select()
        .single();

      if (activeCall) {
        activeCallIdRef.current = activeCall.id;
        setCallConfig(prev => prev ? { ...prev, callId: activeCall.id } : null);

        // Add self as participant
        await supabase.from('call_participants').insert({
          call_id: activeCall.id,
          user_id: currentUserId,
        });
      }

      // Send call notification
      await supabase.from('notifications').insert({
        user_id: otherUserId,
        type: isVideo ? 'incoming_call' : 'call',
        title: `${isVideo ? 'Video' : 'Voice'} call from ${callerProfile?.full_name}`,
        body: 'Tap to answer',
        sender_id: currentUserId,
        conversation_id: conversationId || roomName,
      });

      // Send push notification
      supabase.functions.invoke('send-push-notification', {
        body: {
          type: 'call',
          recipientIds: [otherUserId],
          senderId: currentUserId,
          senderName: callerProfile?.full_name || 'Someone',
          callType: isVideo ? 'video' : 'audio',
          conversationId: conversationId,
        },
      }).catch(console.log);

      // Log call
      await supabase.from('call_logs').insert({
        caller_id: currentUserId,
        receiver_id: otherUserId,
        conversation_id: conversationId,
        call_type: isVideo ? 'video' : 'audio',
        call_status: 'initiated',
      });

      // Set timeout for unanswered calls
      callTimeoutRef.current = setTimeout(() => {
        if (callState === 'calling' || callState === 'ringing') {
          stopRingtones();
          toast({
            title: 'No answer',
            description: 'The call was not answered',
          });
          endCall();
        }
      }, 35000);

    } catch (error) {
      console.error('Error starting call:', error);
      // Don't end call on notification errors - Jitsi can still work
    }
  }, [currentUserId, toast, callState]);

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

  const acceptCall = useCallback(async () => {
    if (!incomingCall) return;

    stopRingtones();
    setCallState('connecting');

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', currentUserId)
      .single();

    setCallConfig({
      roomName: incomingCall.roomName,
      displayName: profile?.full_name || 'User',
      avatarUrl: profile?.avatar_url || undefined,
      isVideoCall: incomingCall.isVideo,
      conversationId: incomingCall.conversationId,
      isGroup: false,
      callId: incomingCall.callId,
    });

    setIsVideoCall(incomingCall.isVideo);
    setIsCameraOn(incomingCall.isVideo);
    setIsMicOn(true);
    setIsInCall(true);
    setIncomingCall(null);
    setCallDuration(0);

    // Join active call if exists
    if (incomingCall.conversationId) {
      const { data: activeCall } = await supabase
        .from('active_calls')
        .select('id')
        .eq('conversation_id', incomingCall.conversationId)
        .eq('is_active', true)
        .single();

      if (activeCall) {
        activeCallIdRef.current = activeCall.id;
        await supabase.from('call_participants').insert({
          call_id: activeCall.id,
          user_id: currentUserId,
        });
      }
    }
  }, [incomingCall, currentUserId]);

  const declineCall = useCallback(() => {
    stopRingtones();
    setIncomingCall(null);
  }, []);

  // Join an existing active call (used when clicking "Join ongoing call" banner)
  const joinCall = useCallback(async (
    roomName: string,
    isVideo: boolean,
    conversationId: string,
    callId?: string
  ) => {
    // Get current user's profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', currentUserId)
      .single();

    // INSTANT STATE CHANGE - Show call screen immediately
    setCallState('connecting');
    setIsVideoCall(isVideo);
    setIsCameraOn(isVideo);
    setIsMicOn(true);
    setIsInCall(true);
    setCallDuration(0);

    setCallConfig({
      roomName,
      displayName: profile?.full_name || 'User',
      avatarUrl: profile?.avatar_url || undefined,
      isVideoCall: isVideo,
      conversationId,
      isGroup: true,
      callId,
    });

    // Join as participant
    if (callId) {
      activeCallIdRef.current = callId;
      await supabase.from('call_participants').insert({
        call_id: callId,
        user_id: currentUserId,
      });
    }
  }, [currentUserId]);

  const endCall = useCallback(async () => {
    clearCallTimeout();
    stopRingtones();

    // Clear duration timer
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    // Dispose Jitsi API
    if (apiRef.current) {
      try {
        apiRef.current.dispose();
      } catch (e) {
        console.log('Jitsi dispose error:', e);
      }
      apiRef.current = null;
    }

    // Update active call
    if (activeCallIdRef.current) {
      // Remove self from participants
      await supabase
        .from('call_participants')
        .update({ left_at: new Date().toISOString() })
        .eq('call_id', activeCallIdRef.current)
        .eq('user_id', currentUserId);

      // Check if any participants remain
      const { data: remainingParticipants } = await supabase
        .from('call_participants')
        .select('id')
        .eq('call_id', activeCallIdRef.current)
        .is('left_at', null);

      // If no one left, mark call as inactive
      if (!remainingParticipants || remainingParticipants.length === 0) {
        await supabase
          .from('active_calls')
          .update({ is_active: false })
          .eq('id', activeCallIdRef.current);
      }
    }

    // Log call duration
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

    // Reset state
    setCallState('idle');
    setIsInCall(false);
    setCallConfig(null);
    setCallDuration(0);
    setParticipants([]);
    setIsScreenSharing(false);
    callStartTimeRef.current = null;
    activeCallIdRef.current = null;
  }, [callConfig, currentUserId]);

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
      // State will be updated by event listener
    }
  }, []);

  const switchCamera = useCallback(() => {
    // Jitsi handles camera switching internally
    if (apiRef.current) {
      apiRef.current.executeCommand('toggleCamera');
    }
  }, []);

  // Invite additional users to the call
  const inviteToCall = useCallback(async (userIds: string[]) => {
    if (!callConfig?.conversationId || !callConfig.roomName) return;

    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', currentUserId)
      .single();

    // Send notifications to invited users
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
      }).catch(console.log);
    }

    toast({
      title: 'Invitation sent',
      description: `Invited ${userIds.length} user(s) to the call`,
    });
  }, [callConfig, currentUserId, toast]);

  // Initialize Jitsi when call starts - Jitsi is INVISIBLE infrastructure
  const initializeJitsi = useCallback((container: HTMLDivElement) => {
    if (!callConfig || !jitsiReady || !window.JitsiMeetExternalAPI) {
      return;
    }

    containerRef.current = container;

    // Jitsi config - COMPLETELY HIDE DEFAULT UI + DISABLE LOBBY/MODERATOR
    const options = {
      roomName: callConfig.roomName,
      parentNode: container,
      width: '100%',
      height: '100%',
      userInfo: {
        displayName: callConfig.displayName,
        avatarURL: callConfig.avatarUrl,
      },
      jwt: undefined, // No JWT = no auth required
      configOverwrite: {
        // CRITICAL: Disable lobby and moderator requirements
        enableLobby: false,
        lobbyModeEnabled: false,
        prejoinPageEnabled: false,
        enableWelcomePage: false,
        enableClosePage: false,
        requireDisplayName: false,
        
        // Disable all auth/moderator features
        disableModeratorIndicator: true,
        enableInsecureRoomNameWarning: false,
        enableNoisyMicDetection: false,
        
        // Start state
        startWithAudioMuted: !isMicOn,
        startWithVideoMuted: !callConfig.isVideoCall || !isCameraOn,
        
        // Auto-join without any prompts
        disableInitialGUM: false,
        startSilent: false,
        
        // Disable UI elements completely
        disableDeepLinking: true,
        disableThirdPartyRequests: true,
        disableInviteFunctions: true,
        disablePolls: true,
        disableReactions: true,
        disableReactionsModeration: true,
        disableSelfView: false,
        disableSelfViewSettings: true,
        
        // Quality settings for low bandwidth
        resolution: 720,
        constraints: {
          video: {
            height: { ideal: 720, max: 720, min: 180 },
            width: { ideal: 1280, max: 1280, min: 320 },
          },
        },
        enableLayerSuspension: true,
        channelLastN: 4,
        
        // P2P for 1-on-1 calls (faster, lower latency)
        p2p: {
          enabled: true,
          stunServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ],
        },
        
        // Disable all notifications
        disableJoinLeaveNotifications: true,
        notifications: [],
        
        // Other UI hiding
        hideConferenceSubject: true,
        hideConferenceTimer: true,
        hideRecordingLabel: true,
        hideLobbyButton: true,
        hideDisplayName: false,
        
        // Disable all extras
        enableCalendarIntegration: false,
        enableEmailInStats: false,
        disableSpeakerStatsSearch: true,
        speakerStatsOrder: [],
      },
      interfaceConfigOverwrite: {
        // HIDE ALL TOOLBAR BUTTONS - We use custom controls ONLY
        TOOLBAR_BUTTONS: [],
        TOOLBAR_ALWAYS_VISIBLE: false,
        INITIAL_TOOLBAR_TIMEOUT: 0,
        TOOLBAR_TIMEOUT: 0,
        
        // Hide all Jitsi branding/UI elements
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        SHOW_BRAND_WATERMARK: false,
        BRAND_WATERMARK_LINK: '',
        SHOW_POWERED_BY: false,
        SHOW_PROMOTIONAL_CLOSE_PAGE: false,
        SHOW_CHROME_EXTENSION_BANNER: false,
        
        // UI settings
        DEFAULT_BACKGROUND: '#0f0f23',
        DISABLE_VIDEO_BACKGROUND: false,
        MOBILE_APP_PROMO: false,
        HIDE_INVITE_MORE_HEADER: true,
        DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
        DISABLE_PRESENCE_STATUS: true,
        DISABLE_FOCUS_INDICATOR: true,
        
        // Hide filmstrip controls
        FILM_STRIP_MAX_HEIGHT: 100,
        VERTICAL_FILMSTRIP: false,
        filmStripOnly: false,
        
        // Disable settings access
        SETTINGS_SECTIONS: [],
        
        // Video layout
        VIDEO_LAYOUT_FIT: 'both',
        TILE_VIEW_MAX_COLUMNS: 2,
        
        // Disable all indicators
        DISABLE_DOMINANT_SPEAKER_INDICATOR: true,
        DISABLE_TRANSCRIPTION_SUBTITLES: true,
        DISABLE_RINGING: true,
        
        // No feedback
        ENABLE_FEEDBACK_ANIMATION: false,
        DISABLE_FEEDBACK: true,
      },
    };

    try {
      const api = new window.JitsiMeetExternalAPI('meet.jit.si', options);
      apiRef.current = api;

      // Stop ringtone and update state when connected
      api.addEventListener('videoConferenceJoined', () => {
        console.log('Jitsi: Conference joined');
        stopRingtones();
        clearCallTimeout();
        setCallState('connected');
        callStartTimeRef.current = Date.now();
      });

      api.addEventListener('videoConferenceLeft', () => {
        console.log('Jitsi: Conference left');
        endCall();
      });

      api.addEventListener('readyToClose', () => {
        endCall();
      });

      api.addEventListener('audioMuteStatusChanged', ({ muted }: { muted: boolean }) => {
        setIsMicOn(!muted);
      });

      api.addEventListener('videoMuteStatusChanged', ({ muted }: { muted: boolean }) => {
        setIsCameraOn(!muted);
      });

      api.addEventListener('screenSharingStatusChanged', ({ on }: { on: boolean }) => {
        setIsScreenSharing(on);
        
        // Update DB if we have call ID
        if (activeCallIdRef.current) {
          supabase
            .from('call_participants')
            .update({ is_screen_sharing: on })
            .eq('call_id', activeCallIdRef.current)
            .eq('user_id', currentUserId)
            .then(() => {});
        }
      });

      api.addEventListener('participantJoined', () => {
        // Another participant joined - update state
        setCallState('connected');
        stopRingtones();
        clearCallTimeout();
      });

      api.addEventListener('participantLeft', () => {
        // Check if alone
        const count = api.getNumberOfParticipants?.() || 1;
        if (count <= 1) {
          toast({
            title: 'Call ended',
            description: 'The other participant left the call',
          });
          endCall();
        }
      });

      // Update state to connecting
      setCallState('connecting');

    } catch (error) {
      console.error('Jitsi initialization error:', error);
      toast({
        variant: 'destructive',
        title: 'Call failed',
        description: 'Could not initialize video call',
      });
      endCall();
    }
  }, [callConfig, jitsiReady, isMicOn, isCameraOn, endCall, toast, currentUserId]);

  // Format call duration
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
    participants,
    jitsiReady,
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
    
    // For backwards compatibility
    localStream: null,
    remoteStream: null,
    isFrontCamera: true,
  };
};
