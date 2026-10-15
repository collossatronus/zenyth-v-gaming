create table if not exists public.game_media (
  id uuid primary key default gen_random_uuid(),
  game_slug text not null check (game_slug in (
    'fortnite', 'no-mans-sky', 'starfield', 'x4-foundations',
    'star-wars-squadrons', 'nfs-payback', 'need-for-speed',
    'nfs-heat', 'gta-online', 'minecraft', 'the-crew-2',
    'the-crew-motorfest', 'forza-horizon-6'
  )),
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 60),
  storage_path text not null unique,
  media_type text not null check (media_type in ('image', 'video')),
  caption text not null check (char_length(caption) between 1 and 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  constraint game_media_storage_path_owner check (storage_path like user_id::text || '/%')
);

create index if not exists game_media_public_feed_idx
  on public.game_media (game_slug, created_at desc)
  where status = 'approved';
create index if not exists game_media_author_idx
  on public.game_media (user_id, created_at desc);

alter table public.game_media enable row level security;
grant select on public.game_media to anon, authenticated;
grant insert on public.game_media to authenticated;
grant update on public.game_media to authenticated;

create policy "Anyone can view approved game media or their own"
  on public.game_media for select
  using (
    status = 'approved'
    or user_id = (select auth.uid())
    or (select auth.jwt() -> 'app_metadata' ->> 'role') in ('moderator', 'owner')
  );

create policy "Members can submit pending game media"
  on public.game_media for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and storage_path like (select auth.uid())::text || '/%'
  );

create policy "Moderators can review game media"
  on public.game_media for update to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') in ('moderator', 'owner'))
  with check ((select auth.jwt() -> 'app_metadata' ->> 'role') in ('moderator', 'owner'));

create table if not exists public.game_questions (
  id uuid primary key default gen_random_uuid(),
  game_slug text not null check (game_slug in (
    'fortnite', 'no-mans-sky', 'starfield', 'x4-foundations',
    'star-wars-squadrons', 'nfs-payback', 'need-for-speed',
    'nfs-heat', 'gta-online', 'minecraft', 'the-crew-2',
    'the-crew-motorfest', 'forza-horizon-6'
  )),
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 60),
  title text not null check (char_length(title) between 3 and 120),
  body text not null check (char_length(body) between 3 and 2000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists game_questions_public_feed_idx
  on public.game_questions (game_slug, created_at desc)
  where status = 'approved';
create index if not exists game_questions_author_idx
  on public.game_questions (user_id, created_at desc);

alter table public.game_questions enable row level security;
grant select on public.game_questions to anon, authenticated;
grant insert on public.game_questions to authenticated;
grant update on public.game_questions to authenticated;

create policy "Anyone can view approved game questions or their own"
  on public.game_questions for select
  using (
    status = 'approved'
    or user_id = (select auth.uid())
    or (select auth.jwt() -> 'app_metadata' ->> 'role') in ('moderator', 'owner')
  );

create policy "Members can submit pending game questions"
  on public.game_questions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and char_length(author_name) between 1 and 60
    and char_length(title) between 3 and 120
    and char_length(body) between 3 and 2000
  );

create policy "Moderators can review game questions"
  on public.game_questions for update to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') in ('moderator', 'owner'))
  with check ((select auth.jwt() -> 'app_metadata' ->> 'role') in ('moderator', 'owner'));

create table if not exists public.community_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 60),
  entry_type text not null check (entry_type in ('question', 'publication')),
  title text not null check (char_length(title) between 3 and 70),
  body text not null check (char_length(body) between 3 and 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists community_entries_public_feed_idx
  on public.community_entries (created_at desc)
  where status = 'approved';
create index if not exists community_entries_author_idx
  on public.community_entries (user_id, created_at desc);

alter table public.community_entries enable row level security;
grant select, insert, update on public.community_entries to authenticated;
grant select on public.community_entries to anon;

create policy "Anyone can view approved community entries or their own"
  on public.community_entries for select
  using (
    status = 'approved'
    or user_id = (select auth.uid())
    or (select auth.jwt() -> 'app_metadata' ->> 'role') in ('moderator', 'owner')
  );

create policy "Members can submit pending community entries"
  on public.community_entries for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and char_length(author_name) between 1 and 60
    and entry_type in ('question', 'publication')
    and char_length(title) between 3 and 70
    and char_length(body) between 3 and 500
  );

create policy "Moderators can review community entries"
  on public.community_entries for update to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') in ('moderator', 'owner'))
  with check ((select auth.jwt() -> 'app_metadata' ->> 'role') in ('moderator', 'owner'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'game-media',
  'game-media',
  false,
  104857600,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Anyone can read approved game media files"
  on storage.objects for select
  using (
    bucket_id = 'game-media'
    and (
      exists (
        select 1 from public.game_media
        where game_media.storage_path = storage.objects.name
          and game_media.status = 'approved'
      )
      or (
        auth.uid() is not null
        and (storage.foldername(storage.objects.name))[1] = (select auth.uid())::text
      )
      or (select auth.jwt() -> 'app_metadata' ->> 'role') in ('moderator', 'owner')
    )
  );

create policy "Members can upload their own game media files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'game-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Moderators can delete game media files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'game-media'
    and (select auth.jwt() -> 'app_metadata' ->> 'role') in ('moderator', 'owner')
  );

create policy "Members can delete their unregistered game media uploads"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'game-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (
      select 1 from public.game_media
      where game_media.storage_path = storage.objects.name
    )
  );
