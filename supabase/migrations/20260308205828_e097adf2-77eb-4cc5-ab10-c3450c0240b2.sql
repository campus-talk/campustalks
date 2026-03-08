
-- Table to store user public keys for E2E encryption
CREATE TABLE public.user_public_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  public_key text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_public_keys ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can view public keys (needed for encryption)
CREATE POLICY "Authenticated users can view public keys"
ON public.user_public_keys FOR SELECT TO authenticated
USING (auth.role() = 'authenticated');

-- Users can insert their own public key
CREATE POLICY "Users can insert their own public key"
ON public.user_public_keys FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can update their own public key
CREATE POLICY "Users can update their own public key"
ON public.user_public_keys FOR UPDATE TO authenticated
USING (auth.uid() = user_id);
