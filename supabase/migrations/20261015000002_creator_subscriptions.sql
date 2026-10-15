create table if not exists public.creator_subscription_settings (
  singleton boolean primary key default true check (singleton),
  starting_count integer not null check (starting_count >= 0)
);

insert into public.creator_subscription_settings (singleton, starting_count)
values (true, 1998)
on conflict (singleton) do nothing;

alter table public.creator_subscription_settings enable row level security;
revoke all on public.creator_subscription_settings from anon, authenticated;

create table if not exists public.creator_subscriptions (
  subscriber_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.creator_subscriptions enable row level security;
grant select, insert, delete on public.creator_subscriptions to authenticated;

create policy "Members can view their own creator subscription"
  on public.creator_subscriptions for select to authenticated
  using (subscriber_id = (select auth.uid()));

create policy "Members can subscribe as themselves"
  on public.creator_subscriptions for insert to authenticated
  with check (
    subscriber_id = (select auth.uid())
    and (select auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'owner'
  );

create policy "Members can cancel their own creator subscription"
  on public.creator_subscriptions for delete to authenticated
  using (subscriber_id = (select auth.uid()));

create or replace function public.zenyth_subscriber_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(
      (select starting_count from public.creator_subscription_settings where singleton),
      0
    ) + (select count(*) from public.creator_subscriptions);
$$;

revoke all on function public.zenyth_subscriber_count() from public;
grant execute on function public.zenyth_subscriber_count() to anon, authenticated;
