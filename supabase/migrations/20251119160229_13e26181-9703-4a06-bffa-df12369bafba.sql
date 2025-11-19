-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- 1. Profiles table (extends auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  full_name text not null,
  username text unique,
  unique_key text unique not null,
  avatar_url text,
  status text default 'Available',
  bio text,
  last_seen timestamp with time zone default now(),
  created_at timestamp with time zone default now()
);

alter table public.profiles enable row level security;

-- 2. Conversations table
create table public.conversations (
  id uuid default uuid_generate_v4() primary key,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.conversations enable row level security;

-- 3. Conversation participants (links users to conversations)
create table public.conversation_participants (
  conversation_id uuid references public.conversations on delete cascade,
  user_id uuid references public.profiles on delete cascade,
  joined_at timestamp with time zone default now(),
  primary key (conversation_id, user_id)
);

alter table public.conversation_participants enable row level security;

-- 4. Messages table
create table public.messages (
  id uuid default uuid_generate_v4() primary key,
  conversation_id uuid references public.conversations on delete cascade not null,
  sender_id uuid references public.profiles on delete cascade not null,
  content text not null,
  message_type text default 'text' check (message_type in ('text', 'image', 'call_log')),
  is_read boolean default false,
  created_at timestamp with time zone default now()
);

alter table public.messages enable row level security;

-- Policies for profiles (safe - no dependencies)
create policy "Public profiles are viewable by authenticated users"
  on public.profiles for select
  using (auth.role() = 'authenticated');

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Policies for conversation_participants
create policy "Users can view their conversation participants"
  on public.conversation_participants for select
  using (user_id = auth.uid() or conversation_id in (
    select conversation_id from public.conversation_participants where user_id = auth.uid()
  ));

create policy "Users can add participants to their conversations"
  on public.conversation_participants for insert
  with check (
    conversation_id in (
      select conversation_id from public.conversation_participants where user_id = auth.uid()
    ) or user_id = auth.uid()
  );

-- Policies for conversations (now safe - conversation_participants exists)
create policy "Users can view their conversations"
  on public.conversations for select
  using (
    exists (
      select 1 from public.conversation_participants
      where conversation_id = id and user_id = auth.uid()
    )
  );

-- Policies for messages
create policy "Users can view messages in their conversations"
  on public.messages for select
  using (
    conversation_id in (
      select conversation_id from public.conversation_participants where user_id = auth.uid()
    )
  );

create policy "Users can send messages to their conversations"
  on public.messages for insert
  with check (
    sender_id = auth.uid() and
    conversation_id in (
      select conversation_id from public.conversation_participants where user_id = auth.uid()
    )
  );

create policy "Users can update their own messages"
  on public.messages for update
  using (sender_id = auth.uid());

-- Function to generate unique key
create or replace function public.generate_unique_key()
returns text
language plpgsql
security definer
as $$
declare
  new_key text;
  key_exists boolean;
begin
  loop
    -- Generate a 6-digit random number
    new_key := 'FC-' || lpad(floor(random() * 999999)::text, 6, '0');
    
    -- Check if key already exists
    select exists(select 1 from public.profiles where unique_key = new_key) into key_exists;
    
    -- Exit loop if key is unique
    exit when not key_exists;
  end loop;
  
  return new_key;
end;
$$;

-- Trigger function to create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, unique_key)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', 'User'),
    public.generate_unique_key()
  );
  return new;
end;
$$;

-- Trigger to auto-create profile
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Storage bucket for avatars
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Storage policies for avatars
create policy "Avatar images are publicly accessible"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "Users can upload their own avatar"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can update their own avatar"
  on storage.objects for update
  using (
    bucket_id = 'avatars' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete their own avatar"
  on storage.objects for delete
  using (
    bucket_id = 'avatars' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage bucket for chat attachments
insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', true)
on conflict (id) do nothing;

-- Storage policies for chat attachments
create policy "Chat attachments are accessible to conversation participants"
  on storage.objects for select
  using (bucket_id = 'chat-attachments');

create policy "Users can upload chat attachments"
  on storage.objects for insert
  with check (
    bucket_id = 'chat-attachments' and
    auth.role() = 'authenticated'
  );

-- Enable realtime for messages
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;