import { memo } from 'react';
import { motion } from 'framer-motion';
import { Phone, Video, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ActiveCallBannerProps {
  callType: 'audio' | 'video';
  participantCount: number;
  onJoin: () => void;
}

const ActiveCallBanner = memo(({ callType, participantCount, onJoin }: ActiveCallBannerProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="bg-primary/10 border border-primary/30 rounded-lg p-3 mx-4 mb-2"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
            {callType === 'video' ? (
              <Video className="w-5 h-5 text-primary" />
            ) : (
              <Phone className="w-5 h-5 text-primary" />
            )}
          </div>
          <div>
            <p className="font-medium text-sm">
              {callType === 'video' ? 'Video' : 'Voice'} call in progress
            </p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Users className="w-3 h-3" />
              {participantCount} participant{participantCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        
        <Button
          onClick={onJoin}
          size="sm"
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          Join
        </Button>
      </div>
    </motion.div>
  );
});

ActiveCallBanner.displayName = 'ActiveCallBanner';

export default ActiveCallBanner;
