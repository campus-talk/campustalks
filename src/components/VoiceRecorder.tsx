import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, Square, Send, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";

interface VoiceRecorderProps {
  onSend: (blob: Blob, duration: number) => void;
  disabled?: boolean;
}

const VoiceRecorder = ({ onSend, disabled }: VoiceRecorderProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedDuration, setRecordedDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecordingCleanup();
    };
  }, []);

  const stopRecordingCleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      chunksRef.current = [];
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size > 0) {
          setRecordedBlob(blob);
          // Use functional update to capture the latest recordingDuration
          setRecordingDuration(prev => {
            setRecordedDuration(prev);
            return prev;
          });
        }
        stopRecordingCleanup();
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingDuration(0);
      setRecordedBlob(null);

      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Microphone access denied:", err);
    }
  }, [recordingDuration]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const handleSend = useCallback(() => {
    if (recordedBlob) {
      onSend(recordedBlob, recordedDuration);
      setRecordedBlob(null);
      setRecordedDuration(0);
      setRecordingDuration(0);
    }
  }, [recordedBlob, recordedDuration, onSend]);

  const handleDiscard = useCallback(() => {
    setRecordedBlob(null);
    setRecordedDuration(0);
    setRecordingDuration(0);
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // Show send/discard after recording
  if (recordedBlob) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex items-center gap-2"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleDiscard}
          className="h-11 w-11 rounded-full text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2 bg-muted/50 rounded-full px-4 py-2">
          <div className="w-2 h-2 rounded-full bg-primary" />
          <span className="text-sm font-medium text-foreground">
            {formatTime(recordedDuration)}
          </span>
        </div>
        <Button
          type="button"
          onClick={handleSend}
          className="h-12 w-12 rounded-full gradient-primary hover:opacity-90 text-white shadow-lg"
          size="icon"
        >
          <Send className="w-5 h-5" />
        </Button>
      </motion.div>
    );
  }

  // Recording state
  if (isRecording) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex items-center gap-3 flex-1"
      >
        <div className="flex items-center gap-2 flex-1 bg-destructive/10 rounded-full px-4 py-2">
          <motion.div
            animate={{ scale: [1, 1.3, 1] }}
            transition={{ repeat: Infinity, duration: 1 }}
            className="w-3 h-3 rounded-full bg-destructive"
          />
          <span className="text-sm font-medium text-destructive">
            {formatTime(recordingDuration)}
          </span>
          {/* Simple waveform animation */}
          <div className="flex items-center gap-[2px] ml-2">
            {Array.from({ length: 20 }).map((_, i) => (
              <motion.div
                key={i}
                animate={{
                  height: [4, Math.random() * 16 + 4, 4],
                }}
                transition={{
                  repeat: Infinity,
                  duration: 0.5 + Math.random() * 0.5,
                  delay: i * 0.05,
                }}
                className="w-[2px] rounded-full bg-destructive/60"
                style={{ height: 4 }}
              />
            ))}
          </div>
        </div>
        <Button
          type="button"
          onClick={stopRecording}
          className="h-12 w-12 rounded-full bg-destructive hover:bg-destructive/90 text-white shadow-lg flex-shrink-0"
          size="icon"
        >
          <Square className="w-5 h-5 fill-current" />
        </Button>
      </motion.div>
    );
  }

  // Default mic button
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={startRecording}
      disabled={disabled}
      className="flex-shrink-0 h-11 w-11 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
    >
      <Mic className="w-5 h-5" />
    </Button>
  );
};

export default VoiceRecorder;
