-- Add phone column to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;

-- Create index for phone lookup
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON public.profiles(phone);