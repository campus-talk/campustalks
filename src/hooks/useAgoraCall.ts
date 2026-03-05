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

export interface CallConfig {
  channelName: string;
  displayName: string;
  avatarUrl?: string;
  isVideoCall: boolean;
  conversationId?: string;
  isGroup?: boolean;
  callId?: string;
  token?: string;
  uid?: number;
  preAcquiredStream?: MediaStream;
}

export interface IncomingCallData {
  callId: string;
  callerId: string;
  callerName: string;
  callerAvatar: string | null;
  channelName: string;
  isVideo: boolean;
  conversationId: string;
}

const AGORA_APP_ID = '7fbe9dab88334b8181c19874a3ad0931';

export { AGORA_APP_ID };

async function getAgoraToken(channelName: string, isVideoCall: boolean): Promise<{ token: string; uid: number }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');

  const { data, error } = await supabase.functions.invoke('generate-agora-token', {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: { channelName, isVideoCall },
  });

  if (error || !data?.token) {
    console.error('Agora token error:', error, data);
    throw new Error('Token generation failed');
  }
  return { token: data.token, uid: data.uid };
}

export { getAgoraToken };

export const useAgoraCall = (currentUserId: string) => {
  const [callState, setCallState] = useState<CallState>('idle');
  const [isInCall, setIsInCall] = useState(false);
  const [isVideoCall, setIsVideoCall] = useState(true);
  const [callConfig, setCallConfig] = useState<CallConfig | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);
  const [callDuration, setCallDuration] = useState(0);

  const callStartTimeRef = useRef<number | null>(null);
  const incomingRingtone = useRef<HTMLAudioElement | null>(null);
  const outgoingRingtone = useRef<HTMLAudioElement | null>(null);
  const callTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const activeCallIdRef = useRef<string | null>(null);
  const subscriptionRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

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

  const generateChannelName = useCallback((conversationId: string) => {
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

  // Realtime: Listen for incoming calls
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
          channelName: call.room_name,
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

        if (call.initiated_by === currentUserId) {
          switch (call.call_state) {
            case 'ringing':
              setCallState('ringing');
              break;
            case 'accepted':
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

  // START CALL
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

    const channelName = generateChannelName(conversationId);

    // Pre-acquire media stream from user gesture context
    let preAcquiredStream: MediaStream | undefined;
    try {
      preAcquiredStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isVideo,
      });
    } catch (mediaErr) {
      console.error('Media access denied:', mediaErr);
      toast({ variant: 'destructive', title: 'Permission denied', description: 'Camera/microphone access is required for calls' });
      return;
    }

    setCallState('calling');
    setIsVideoCall(isVideo);
    setIsInCall(true);
    setCallDuration(0);

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
      channelName,
      displayName: myProfile?.full_name || displayName,
      avatarUrl: otherProfile?.avatar_url || undefined,
      isVideoCall: isVideo,
      conversationId,
      isGroup,
      preAcquiredStream,
    });

    playOutgoingRingtone();

    try {
      const { data: activeCall, error } = await supabase
        .from('active_calls')
        .insert({
          conversation_id: conversationId,
          room_name: channelName,
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

      await supabase.from('call_logs').insert({
        caller_id: currentUserId,
        receiver_id: otherUserId,
        conversation_id: conversationId,
        call_type: isVideo ? 'video' : 'audio',
        call_status: 'initiated',
      });

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
  }, [currentUserId, generateChannelName, playOutgoingRingtone, stopAllRingtones, toast]);

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

  // ACCEPT CALL
  const acceptCall = useCallback(async () => {
    if (!incomingCall) return;

    stopAllRingtones();

    // Pre-acquire media stream from user gesture context
    let preAcquiredStream: MediaStream | undefined;
    try {
      preAcquiredStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: incomingCall.isVideo,
      });
    } catch (mediaErr) {
      console.error('Media access denied:', mediaErr);
      toast({ variant: 'destructive', title: 'Permission denied', description: 'Camera/microphone access is required for calls' });
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', currentUserId)
      .single();

    setCallState('accepted');
    setIsVideoCall(incomingCall.isVideo);
    setIsInCall(true);
    setCallDuration(0);
    activeCallIdRef.current = incomingCall.callId;

    setCallConfig({
      channelName: incomingCall.channelName,
      displayName: profile?.full_name || 'User',
      avatarUrl: profile?.avatar_url || undefined,
      isVideoCall: incomingCall.isVideo,
      conversationId: incomingCall.conversationId,
      isGroup: false,
      callId: incomingCall.callId,
      preAcquiredStream,
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

  // DECLINE CALL
  const declineCall = useCallback(async () => {
    if (!incomingCall) return;
    stopAllRingtones();

    await supabase
      .from('active_calls')
      .update({ call_state: 'rejected', is_active: false })
      .eq('id', incomingCall.callId);

    setIncomingCall(null);
  }, [incomingCall, stopAllRingtones]);

  // JOIN ONGOING CALL
  const joinCall = useCallback(async (
    channelName: string,
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
      channelName,
      displayName: profile?.full_name || 'User',
      avatarUrl: profile?.avatar_url || undefined,
      isVideoCall: isVideo,
      conversationId,
      isGroup: true,
      callId,
    });
  }, [currentUserId]);

  // END CALL
  const endCall = useCallback(async () => {
    clearCallTimeout();
    stopAllRingtones();

    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

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
    callStartTimeRef.current = null;
    activeCallIdRef.current = null;
  }, [callConfig, currentUserId, clearCallTimeout, stopAllRingtones]);

  const inviteToCall = useCallback(async (userIds: string[]) => {
    if (!callConfig?.conversationId || !callConfig.channelName) return;

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

  const formatDuration = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  return {
    callState,
    isInCall,
    isVideoCall,
    incomingCall,
    callConfig,
    callDuration,
    formattedDuration: formatDuration(callDuration),
    currentUserId,

    startCall,
    startAudioCall,
    joinCall,
    acceptCall,
    declineCall,
    endCall,
    inviteToCall,
  };
};
