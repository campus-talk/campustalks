import { useEffect, useRef, useState } from "react";
import Peer, { MediaConnection } from "peerjs";
import { supabase } from "@/integrations/supabase/client";

interface CallNotification {
  callerId: string;
  callerName: string;
  callerAvatar: string | null;
}

export const usePeerConnection = (currentUserId: string) => {
  const peerRef = useRef<Peer | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [incomingCall, setIncomingCall] = useState<CallNotification | null>(null);
  const currentCallRef = useRef<MediaConnection | null>(null);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoCall, setIsVideoCall] = useState(true);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const incomingRingtone = useRef<HTMLAudioElement | null>(null);
  const outgoingRingtone = useRef<HTMLAudioElement | null>(null);
  const callTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const CALL_TIMEOUT_MS = 35000; // 35 seconds timeout

  // Initialize ringtones
  useEffect(() => {
    incomingRingtone.current = new Audio('/ringtones/incoming-call.mp3');
    outgoingRingtone.current = new Audio('/ringtones/outgoing-call.mp3');
    incomingRingtone.current.loop = true;
    outgoingRingtone.current.loop = true;

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    return () => {
      incomingRingtone.current?.pause();
      outgoingRingtone.current?.pause();
    };
  }, []);

  useEffect(() => {
    if (!currentUserId) return;

    // Initialize PeerJS
    const peer = new Peer(currentUserId);
    peerRef.current = peer;

    peer.on("open", (id) => {
      console.log("Peer ID:", id);
    });

    // Handle incoming calls
    peer.on("call", async (call) => {
      console.log("Incoming call from:", call.peer);
      
      // Play incoming ringtone
      incomingRingtone.current?.play().catch(e => console.log("Ringtone play failed:", e));

      // Check if it's a video or audio call from metadata
      const isVideo = call.metadata?.isVideoCall !== false;
      setIsVideoCall(isVideo);
      
      // Fetch caller info
      const { data: callerProfile } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", call.peer)
        .single();

      setIncomingCall({
        callerId: call.peer,
        callerName: callerProfile?.full_name || "Unknown",
        callerAvatar: callerProfile?.avatar_url || null,
      });

      // Show notification if permission granted
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`Incoming call from ${callerProfile?.full_name || "Unknown"}`, {
          icon: callerProfile?.avatar_url || undefined,
          tag: 'incoming-call',
        });
      }

      // Store the call reference
      currentCallRef.current = call;
    });

    return () => {
      peer.destroy();
    };
  }, [currentUserId]);

  const clearCallTimeout = () => {
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }
  };

  const startCall = async (remoteUserId: string, videoEnabled = true) => {
    try {
      // Play outgoing ringtone
      outgoingRingtone.current?.play().catch(e => console.log("Ringtone play failed:", e));

      setIsVideoCall(videoEnabled);
      setIsCameraOn(videoEnabled);
      setIsMicOn(true);

      // Set call timeout - auto end if not answered within 35 seconds
      clearCallTimeout();
      callTimeoutRef.current = setTimeout(() => {
        console.log("Call timeout - no answer");
        outgoingRingtone.current?.pause();
        if (outgoingRingtone.current) outgoingRingtone.current.currentTime = 0;
        endCall();
      }, CALL_TIMEOUT_MS);

      // Get local media stream with highest quality
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoEnabled ? {
          width: { min: 640, ideal: 1920, max: 1920 },
          height: { min: 480, ideal: 1080, max: 1080 },
          facingMode: facingMode,
          frameRate: { min: 24, ideal: 60, max: 60 }
        } : false,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 2
        },
      });
      setLocalStream(stream);

      // Call the remote peer with metadata about call type
      const call = peerRef.current?.call(remoteUserId, stream, {
        metadata: { isVideoCall: videoEnabled }
      });
      if (!call) return;

      currentCallRef.current = call;

      call.on("stream", (remoteStream) => {
        console.log("Received remote stream");
        // Clear timeout and stop outgoing ringtone when call connects
        clearCallTimeout();
        outgoingRingtone.current?.pause();
        if (outgoingRingtone.current) outgoingRingtone.current.currentTime = 0;
        setRemoteStream(remoteStream);
      });

      call.on("close", () => {
        clearCallTimeout();
        endCall();
      });
    } catch (error) {
      console.error("Error starting call:", error);
      clearCallTimeout();
    }
  };

  const startAudioCall = async (remoteUserId: string) => {
    await startCall(remoteUserId, false);
  };

  const acceptCall = async () => {
    if (!currentCallRef.current) return;

    // Stop incoming ringtone
    incomingRingtone.current?.pause();
    if (incomingRingtone.current) incomingRingtone.current.currentTime = 0;

    try {
      const callIsVideo = currentCallRef.current.metadata?.isVideoCall !== false;
      setIsCameraOn(callIsVideo);
      setIsMicOn(true);

      // Get local media stream based on call type with highest quality
      const stream = await navigator.mediaDevices.getUserMedia({
        video: callIsVideo ? {
          width: { min: 640, ideal: 1920, max: 1920 },
          height: { min: 480, ideal: 1080, max: 1080 },
          facingMode: facingMode,
          frameRate: { min: 24, ideal: 60, max: 60 }
        } : false,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 2
        },
      });
      setLocalStream(stream);

      // Answer the call
      currentCallRef.current.answer(stream);

      currentCallRef.current.on("stream", (remoteStream) => {
        console.log("Received remote stream");
        setRemoteStream(remoteStream);
      });

      currentCallRef.current.on("close", () => {
        endCall();
      });

      setIncomingCall(null);
    } catch (error) {
      console.error("Error accepting call:", error);
    }
  };

  const declineCall = () => {
    // Stop incoming ringtone
    incomingRingtone.current?.pause();
    if (incomingRingtone.current) incomingRingtone.current.currentTime = 0;

    currentCallRef.current?.close();
    currentCallRef.current = null;
    setIncomingCall(null);
  };

  const toggleCamera = async () => {
    if (!localStream) return;

    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsCameraOn(videoTrack.enabled);
    }
  };

  const switchCamera = async () => {
    if (!localStream || !isVideoCall) return;

    try {
      const newFacingMode = facingMode === "user" ? "environment" : "user";
      
      // Stop current video track
      localStream.getVideoTracks().forEach(track => track.stop());

      // Get new stream with switched camera at highest quality
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { min: 640, ideal: 1920, max: 1920 },
          height: { min: 480, ideal: 1080, max: 1080 },
          facingMode: newFacingMode,
          frameRate: { min: 24, ideal: 60, max: 60 }
        },
        audio: false
      });

      // Replace video track
      const newVideoTrack = newStream.getVideoTracks()[0];
      const sender = currentCallRef.current?.peerConnection
        ?.getSenders()
        .find(s => s.track?.kind === 'video');
      
      if (sender) {
        await sender.replaceTrack(newVideoTrack);
      }

      // Update local stream
      const audioTrack = localStream.getAudioTracks()[0];
      const updatedStream = new MediaStream([newVideoTrack, audioTrack]);
      setLocalStream(updatedStream);
      setFacingMode(newFacingMode);
    } catch (error) {
      console.error("Error switching camera:", error);
    }
  };

  const toggleMic = () => {
    if (!localStream) return;

    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMicOn(audioTrack.enabled);
    }
  };

  const endCall = () => {
    // Clear call timeout
    clearCallTimeout();

    // Stop all ringtones
    incomingRingtone.current?.pause();
    outgoingRingtone.current?.pause();
    if (incomingRingtone.current) incomingRingtone.current.currentTime = 0;
    if (outgoingRingtone.current) outgoingRingtone.current.currentTime = 0;

    // Stop all tracks
    localStream?.getTracks().forEach((track) => track.stop());
    remoteStream?.getTracks().forEach((track) => track.stop());

    // Close connection
    currentCallRef.current?.close();
    currentCallRef.current = null;

    setLocalStream(null);
    setRemoteStream(null);
    setIsCameraOn(true);
    setIsMicOn(true);
    setIsVideoCall(true);
  };

  return {
    startCall,
    startAudioCall,
    acceptCall,
    declineCall,
    endCall,
    toggleCamera,
    toggleMic,
    switchCamera,
    isCameraOn,
    isMicOn,
    isVideoCall,
    localStream,
    remoteStream,
    incomingCall,
    isInCall: !!localStream || !!remoteStream,
  };
};
