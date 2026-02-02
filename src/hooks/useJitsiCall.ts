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
  const endCallRef = useRef<() => void>(() => {});
  
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

  // OPTIMISTIC CALL START - UI shows IMMEDIATELY, no blocking
  const startCall = useCallback((
    otherUserId: string, 
    isVideo: boolean = true, 
    conversationId?: string,
    isGroup: boolean = false,
    displayName: string = 'User'
  ) => {
    // Generate room name synchronously
    const roomName = generateRoomName(otherUserId, conversationId);
    
    // ⚡ INSTANT STATE CHANGE - NO AWAITS BEFORE THIS
    setCallState('calling');
    setIsVideoCall(isVideo);
    setIsCameraOn(isVideo);
    setIsMicOn(true);
    setIsInCall(true);
    setCallDuration(0);
    setIsScreenSharing(false);
    
    // Set config immediately with placeholder name
    setCallConfig({
      roomName,
      displayName: displayName || 'User',
      avatarUrl: undefined,
      isVideoCall: isVideo,
      conversationId,
      isGroup,
    });

    // Play outgoing ringtone immediately
    outgoingRingtone.current?.play().catch(() => {});

    // 🔄 BACKGROUND: All async operations happen AFTER UI is shown
    (async () => {
      try {
        // Get caller profile (for notification, not for UI)
        const { data: callerProfile } = await supabase
          .from('profiles')
          .select('full_name, avatar_url')
          .eq('id', currentUserId)
          .single();

        // Update config with real profile data (optional enhancement)
        if (callerProfile) {
          setCallConfig(prev => prev ? {
            ...prev,
            displayName: callerProfile.full_name || displayName,
            avatarUrl: callerProfile.avatar_url || undefined,
          } : null);
        }

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

        // Send call notification to recipient
        await supabase.from('notifications').insert({
          user_id: otherUserId,
          type: isVideo ? 'incoming_call' : 'call',
          title: `${isVideo ? 'Video' : 'Voice'} call from ${callerProfile?.full_name || 'Someone'}`,
          body: 'Tap to answer',
          sender_id: currentUserId,
          conversation_id: conversationId || roomName,
        });

        // Send push notification (fire and forget)
        supabase.functions.invoke('send-push-notification', {
          body: {
            type: 'call',
            recipientIds: [otherUserId],
            senderId: currentUserId,
            senderName: callerProfile?.full_name || 'Someone',
            callType: isVideo ? 'video' : 'audio',
            conversationId: conversationId,
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

      } catch (error) {
        console.error('Background call setup error (non-critical):', error);
        // Don't end call on background errors - Jitsi can still work
      }
    })();

    // Set timeout for unanswered calls (35 seconds)
    callTimeoutRef.current = setTimeout(() => {
      stopRingtones();
      toast({
        title: 'No answer',
        description: 'The call was not answered',
      });
      // Use ref to avoid circular dependency
      endCallRef.current();
    }, 35000);

  }, [currentUserId, toast]);

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

  // Keep ref in sync with endCall
  useEffect(() => {
    endCallRef.current = endCall;
  }, [endCall]);

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
    if (!callConfig || !window.JitsiMeetExternalAPI) {
      // If Jitsi not ready, poll and retry
      if (!window.JitsiMeetExternalAPI) {
        const checkAndInit = setInterval(() => {
          if (window.JitsiMeetExternalAPI) {
            clearInterval(checkAndInit);
            initializeJitsi(container);
          }
        }, 100);
        setTimeout(() => clearInterval(checkAndInit), 5000); // Stop after 5s
        return;
      }
      return;
    }

    // Prevent double initialization
    if (apiRef.current) return;
    containerRef.current = container;

    // Jitsi config - COMPLETELY HIDE DEFAULT UI + DISABLE ALL LOBBY/MODERATOR
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
        // ⚡ CRITICAL: Disable ALL lobby and moderator requirements
        enableLobby: false,
        lobbyModeEnabled: false,
        'lobby.enabled': false,
        prejoinPageEnabled: false,
        prejoinConfig: { enabled: false },
        enableWelcomePage: false,
        enableClosePage: false,
        requireDisplayName: false,
        
        // Disable ALL auth/moderator features  
        disableModeratorIndicator: true,
        enableInsecureRoomNameWarning: false,
        enableNoisyMicDetection: false,
        
        // ⚡ AUTO-JOIN: No prompts, no waiting rooms
        disableInitialGUM: false,
        startSilent: false,
        
        // Audio/Video start state
        startWithAudioMuted: !isMicOn,
        startWithVideoMuted: !callConfig.isVideoCall || !isCameraOn,
        
        // Disable ALL UI elements
        disableDeepLinking: true,
        disableThirdPartyRequests: true,
        disableInviteFunctions: true,
        disablePolls: true,
        disableReactions: true,
        disableReactionsModeration: true,
        disableSelfView: false,
        disableSelfViewSettings: true,
        
        // Quality settings for mobile/low bandwidth
        resolution: 720,
        constraints: {
          video: {
            height: { ideal: 720, max: 720, min: 180 },
            width: { ideal: 1280, max: 1280, min: 320 },
          },
        },
        enableLayerSuspension: true,
        channelLastN: 4,
        
        // P2P for 1-on-1 calls (faster connection)
        p2p: {
          enabled: true,
          stunServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ],
        },
        
        // Disable ALL notifications from Jitsi
        disableJoinLeaveNotifications: true,
        notifications: [],
        
        // Hide conference info
        hideConferenceSubject: true,
        hideConferenceTimer: true,
        hideRecordingLabel: true,
        hideLobbyButton: true,
        hideDisplayName: false,
        
        // Disable extras
        enableCalendarIntegration: false,
        enableEmailInStats: false,
        disableSpeakerStatsSearch: true,
        speakerStatsOrder: [],
        
        // Extra lobby disabling
        hiddenPremeetingButtons: ['microphone', 'camera', 'select-background', 'invite', 'settings'],
        securityUi: { hideLobbyButton: true, disableLobbyPassword: true },
      },
      interfaceConfigOverwrite: {
        // ⚡ HIDE ALL TOOLBAR BUTTONS - Custom controls ONLY
        TOOLBAR_BUTTONS: [],
        TOOLBAR_ALWAYS_VISIBLE: false,
        INITIAL_TOOLBAR_TIMEOUT: 0,
        TOOLBAR_TIMEOUT: 0,
        
        // Hide ALL Jitsi branding/UI
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        SHOW_BRAND_WATERMARK: false,
        BRAND_WATERMARK_LINK: '',
        SHOW_POWERED_BY: false,
        SHOW_PROMOTIONAL_CLOSE_PAGE: false,
        SHOW_CHROME_EXTENSION_BANNER: false,
        
        // Background
        DEFAULT_BACKGROUND: '#0f0f23',
        DISABLE_VIDEO_BACKGROUND: false,
        MOBILE_APP_PROMO: false,
        HIDE_INVITE_MORE_HEADER: true,
        DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
        DISABLE_PRESENCE_STATUS: true,
        DISABLE_FOCUS_INDICATOR: true,
        
        // Filmstrip
        FILM_STRIP_MAX_HEIGHT: 120,
        VERTICAL_FILMSTRIP: false,
        filmStripOnly: false,
        
        // Disable settings
        SETTINGS_SECTIONS: [],
        
        // Video layout
        VIDEO_LAYOUT_FIT: 'both',
        TILE_VIEW_MAX_COLUMNS: 2,
        
        // Disable indicators
        DISABLE_DOMINANT_SPEAKER_INDICATOR: true,
        DISABLE_TRANSCRIPTION_SUBTITLES: true,
        DISABLE_RINGING: true,
        
        // No feedback
        ENABLE_FEEDBACK_ANIMATION: false,
        DISABLE_FEEDBACK: true,
        
        // Auto-hide elements
        AUTO_PIN_LATEST_SCREEN_SHARE: true,
        HIDE_KICK_BUTTON_FOR_GUESTS: true,
      },
    };

    try {
      const api = new window.JitsiMeetExternalAPI('meet.jit.si', options);
      apiRef.current = api;

      // ⚡ Conference joined - stop ringtone, update state
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
        // Another participant joined
        setCallState('connected');
        stopRingtones();
        clearCallTimeout();
      });

      api.addEventListener('participantLeft', () => {
        // Check if alone
        try {
          const count = api.getNumberOfParticipants?.() || 1;
          if (count <= 1) {
            toast({
              title: 'Call ended',
              description: 'The other participant left the call',
            });
            endCall();
          }
        } catch (e) {
          // Ignore errors during cleanup
        }
      });

      // Update state to connecting (Jitsi is initializing)
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
  }, [callConfig, isMicOn, isCameraOn, endCall, toast, currentUserId]);

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
