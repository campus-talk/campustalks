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
}

interface JitsiApi {
  executeCommand: (command: string, ...args: any[]) => void;
  addEventListener: (event: string, handler: (...args: any[]) => void) => void;
  removeEventListener: (event: string, handler: (...args: any[]) => void) => void;
  dispose: () => void;
}

declare global {
  interface Window {
    JitsiMeetExternalAPI: new (domain: string, options: any) => JitsiApi;
  }
}

export const useJitsiCall = (currentUserId: string) => {
  const [isInCall, setIsInCall] = useState(false);
  const [isVideoCall, setIsVideoCall] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [callConfig, setCallConfig] = useState<JitsiCallConfig | null>(null);
  const [incomingCall, setIncomingCall] = useState<{
    callerId: string;
    callerName: string;
    callerAvatar: string | null;
    roomName: string;
    isVideo: boolean;
    conversationId?: string;
  } | null>(null);
  
  const apiRef = useRef<JitsiApi | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const callStartTimeRef = useRef<number | null>(null);
  const incomingRingtone = useRef<HTMLAudioElement | null>(null);
  const outgoingRingtone = useRef<HTMLAudioElement | null>(null);
  const callTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
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

  // Load Jitsi script
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://meet.jit.si/external_api.js';
    script.async = true;
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

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
            // This is an incoming call notification
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
  }, [currentUserId]);

  const clearCallTimeout = () => {
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }
  };

  const generateRoomName = (otherUserId: string, conversationId?: string) => {
    // Create unique room name based on conversation
    if (conversationId) {
      return `campustalks_${conversationId}`.replace(/-/g, '').substring(0, 30);
    }
    const ids = [currentUserId, otherUserId].sort();
    return `campustalks_${ids.join('_')}`.replace(/-/g, '').substring(0, 40);
  };

  const startCall = useCallback(async (
    otherUserId: string, 
    isVideo: boolean = true, 
    conversationId?: string,
    isGroup: boolean = false,
    displayName: string = 'User'
  ) => {
    if (!window.JitsiMeetExternalAPI) {
      toast({
        variant: 'destructive',
        title: 'Jitsi not loaded',
        description: 'Please wait and try again',
      });
      return;
    }

    // Play outgoing ringtone
    outgoingRingtone.current?.play().catch(console.log);

    const roomName = generateRoomName(otherUserId, conversationId);
    
    // Notify other user via push notification
    try {
      const { data: callerProfile } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', currentUserId)
        .single();

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
      await supabase.functions.invoke('send-push-notification', {
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

      setCallConfig({
        roomName,
        displayName: callerProfile?.full_name || displayName,
        avatarUrl: callerProfile?.avatar_url || undefined,
        isVideoCall: isVideo,
        conversationId,
        isGroup,
      });
      
      setIsVideoCall(isVideo);
      setIsCameraOn(isVideo);
      setIsMicOn(true);
      setIsInCall(true);
      callStartTimeRef.current = Date.now();

      // Set timeout for unanswered calls
      callTimeoutRef.current = setTimeout(() => {
        outgoingRingtone.current?.pause();
        if (outgoingRingtone.current) outgoingRingtone.current.currentTime = 0;
        toast({
          title: 'No answer',
          description: 'The call was not answered',
        });
      }, 35000);

    } catch (error) {
      console.error('Error starting call:', error);
      toast({
        variant: 'destructive',
        title: 'Call failed',
        description: 'Could not start the call',
      });
    }
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

    incomingRingtone.current?.pause();
    if (incomingRingtone.current) incomingRingtone.current.currentTime = 0;

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
    });

    setIsVideoCall(incomingCall.isVideo);
    setIsCameraOn(incomingCall.isVideo);
    setIsMicOn(true);
    setIsInCall(true);
    setIncomingCall(null);
    callStartTimeRef.current = Date.now();
  }, [incomingCall, currentUserId]);

  const declineCall = useCallback(() => {
    incomingRingtone.current?.pause();
    if (incomingRingtone.current) incomingRingtone.current.currentTime = 0;
    setIncomingCall(null);
  }, []);

  const endCall = useCallback(async () => {
    clearCallTimeout();
    
    // Stop ringtones
    outgoingRingtone.current?.pause();
    incomingRingtone.current?.pause();
    if (outgoingRingtone.current) outgoingRingtone.current.currentTime = 0;
    if (incomingRingtone.current) incomingRingtone.current.currentTime = 0;

    // Dispose Jitsi API
    if (apiRef.current) {
      try {
        apiRef.current.dispose();
      } catch (e) {
        console.log('Jitsi dispose error:', e);
      }
      apiRef.current = null;
    }

    // Log call duration
    if (callStartTimeRef.current && callConfig?.conversationId) {
      const durationSeconds = Math.floor((Date.now() - callStartTimeRef.current) / 1000);
      // Update the most recent call log
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

    setIsInCall(false);
    setCallConfig(null);
    callStartTimeRef.current = null;
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

  const switchCamera = useCallback(() => {
    // Jitsi handles camera switching internally via its UI
    // For mobile, we can trigger the flip camera command
    if (apiRef.current) {
      apiRef.current.executeCommand('toggleFilmStrip');
    }
  }, []);

  // Initialize Jitsi when call starts
  const initializeJitsi = useCallback((container: HTMLDivElement) => {
    if (!callConfig || !window.JitsiMeetExternalAPI) return;

    containerRef.current = container;

    // Stop ringtones when call connects
    outgoingRingtone.current?.pause();
    if (outgoingRingtone.current) outgoingRingtone.current.currentTime = 0;
    clearCallTimeout();

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
        startWithAudioMuted: false,
        startWithVideoMuted: !callConfig.isVideoCall,
        prejoinPageEnabled: false,
        disableDeepLinking: true,
        enableWelcomePage: false,
        enableClosePage: false,
        disableThirdPartyRequests: true,
        // Low bandwidth optimizations
        resolution: 720,
        constraints: {
          video: {
            height: { ideal: 720, max: 720, min: 180 },
            width: { ideal: 1280, max: 1280, min: 320 },
          },
        },
        enableLayerSuspension: true,
        channelLastN: 4,
        p2p: {
          enabled: true,
          stunServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ],
        },
      },
      interfaceConfigOverwrite: {
        TOOLBAR_BUTTONS: [
          'microphone', 'camera', 'hangup', 'chat', 'raisehand',
          'participants-pane', 'tileview', 'select-background', 'fullscreen'
        ],
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        DEFAULT_BACKGROUND: '#1a1a2e',
        DISABLE_VIDEO_BACKGROUND: false,
        MOBILE_APP_PROMO: false,
        HIDE_INVITE_MORE_HEADER: true,
        DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
        FILM_STRIP_MAX_HEIGHT: 120,
        VERTICAL_FILMSTRIP: true,
      },
    };

    try {
      const api = new window.JitsiMeetExternalAPI('meet.jit.si', options);
      apiRef.current = api;

      api.addEventListener('videoConferenceJoined', () => {
        console.log('Joined Jitsi conference');
        clearCallTimeout();
      });

      api.addEventListener('videoConferenceLeft', () => {
        console.log('Left Jitsi conference');
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

    } catch (error) {
      console.error('Jitsi initialization error:', error);
      toast({
        variant: 'destructive',
        title: 'Call failed',
        description: 'Could not initialize video call',
      });
      endCall();
    }
  }, [callConfig, endCall, toast]);

  return {
    // State
    isInCall,
    isVideoCall,
    isMicOn,
    isCameraOn,
    incomingCall,
    callConfig,
    
    // Actions
    startCall,
    startAudioCall,
    acceptCall,
    declineCall,
    endCall,
    toggleMic,
    toggleCamera,
    switchCamera,
    initializeJitsi,
    
    // For backwards compatibility
    localStream: null,
    remoteStream: null,
    isFrontCamera: true,
  };
};
