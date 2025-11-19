-- Fix search_path for generate_unique_key function
create or replace function public.generate_unique_key()
returns text
language plpgsql
security definer
set search_path = public
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