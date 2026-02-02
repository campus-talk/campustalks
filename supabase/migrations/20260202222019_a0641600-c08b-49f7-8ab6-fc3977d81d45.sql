-- Add call_state column for proper signaling state machine
ALTER TABLE public.active_calls 
ADD COLUMN IF NOT EXISTS call_state text NOT NULL DEFAULT 'calling';

-- Add constraint for valid call states
ALTER TABLE public.active_calls 
ADD CONSTRAINT valid_call_state CHECK (call_state IN ('calling', 'ringing', 'accepted', 'rejected', 'ended', 'missed'));

-- Add receiver_id to know who should receive the call (for 1-on-1 calls)
ALTER TABLE public.active_calls 
ADD COLUMN IF NOT EXISTS receiver_id uuid;