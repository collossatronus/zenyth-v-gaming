create table if not exists public.private_message_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint private_message_block_not_self check (blocker_id <> blocked_id)
);

alter table public.private_message_blocks enable row level security;
grant select, insert, delete on public.private_message_blocks to authenticated;

create policy "Members can view their own blocks"
  on public.private_message_blocks for select to authenticated
  using (blocker_id = (select auth.uid()));

create policy "Members can block another account"
  on public.private_message_blocks for insert to authenticated
  with check (blocker_id = (select auth.uid()) and blocked_id <> (select auth.uid()));

create policy "Members can remove their own blocks"
  on public.private_message_blocks for delete to authenticated
  using (blocker_id = (select auth.uid()));

create or replace function public.private_messages_blocked(first_user uuid, second_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.private_message_blocks
    where (blocker_id = first_user and blocked_id = second_user)
       or (blocker_id = second_user and blocked_id = first_user)
  );
$$;

revoke all on function public.private_messages_blocked(uuid, uuid) from public, anon;
grant execute on function public.private_messages_blocked(uuid, uuid) to authenticated;

create table if not exists public.private_conversations (
  id uuid primary key default gen_random_uuid(),
  member_one uuid not null references auth.users(id) on delete cascade,
  member_two uuid not null references auth.users(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint private_conversation_member_order check (member_one < member_two),
  constraint private_conversation_creator_is_member check (created_by in (member_one, member_two)),
  unique (member_one, member_two)
);

alter table public.private_conversations enable row level security;
grant select, insert on public.private_conversations to authenticated;

create policy "Conversation members can view their unblocked conversations"
  on public.private_conversations for select to authenticated
  using (
    ((select auth.uid()) = member_one or (select auth.uid()) = member_two)
    and not (select public.private_messages_blocked(member_one, member_two))
  );

create policy "Members can start unblocked conversations"
  on public.private_conversations for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and ((select auth.uid()) = member_one or (select auth.uid()) = member_two)
    and not (select public.private_messages_blocked(member_one, member_two))
  );

create table if not exists public.private_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.private_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists private_messages_conversation_feed_idx
  on public.private_messages (conversation_id, created_at);

alter table public.private_messages enable row level security;
grant select, insert on public.private_messages to authenticated;

create policy "Conversation members can read private messages"
  on public.private_messages for select to authenticated
  using (
    exists (
      select 1 from public.private_conversations
      where private_conversations.id = private_messages.conversation_id
        and (
          private_conversations.member_one = (select auth.uid())
          or private_conversations.member_two = (select auth.uid())
        )
        and not (select public.private_messages_blocked(
          private_conversations.member_one,
          private_conversations.member_two
        ))
    )
  );

create policy "Conversation members can send private messages"
  on public.private_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and char_length(body) between 1 and 2000
    and exists (
      select 1 from public.private_conversations
      where private_conversations.id = private_messages.conversation_id
        and (
          private_conversations.member_one = (select auth.uid())
          or private_conversations.member_two = (select auth.uid())
        )
        and not (select public.private_messages_blocked(
          private_conversations.member_one,
          private_conversations.member_two
        ))
    )
  );
