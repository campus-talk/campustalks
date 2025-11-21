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

      // Store the call reference
      currentCallRef.current = call;
    });

    return () => {
      peer.destroy();
    };
  }, [currentUserId]);

  const startCall = async (remoteUserId: string, videoEnabled = true) => {
    try {
      setIsVideoCall(videoEnabled);
      setIsCameraOn(videoEnabled);
      setIsMicOn(true);

      // Get local media stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoEnabled,
        audio: true,
      });
      setLocalStream(stream);

      // Call the remote peer
      const call = peerRef.current?.call(remoteUserId, stream);
      if (!call) return;

      currentCallRef.current = call;

      call.on("stream", (remoteStream) => {
        console.log("Received remote stream");
        setRemoteStream(remoteStream);
      });

      call.on("close", () => {
        endCall();
      });
    } catch (error) {
      console.error("Error starting call:", error);
    }
  };

  const startAudioCall = async (remoteUserId: string) => {
    await startCall(remoteUserId, false);
  };

  const acceptCall = async () => {
    if (!currentCallRef.current) return;

    try {
      setIsVideoCall(true);
      setIsCameraOn(true);
      setIsMicOn(true);

      // Get local media stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
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

  const toggleMic = () => {
    if (!localStream) return;

    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMicOn(audioTrack.enabled);
    }
  };

  const endCall = () => {
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
    isCameraOn,
    isMicOn,
    isVideoCall,
    localStream,
    remoteStream,
    incomingCall,
    isInCall: !!localStream || !!remoteStream,
  };
};
