
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  style_direction text,
  budget_register text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  undertone text, season text, contrast text, face_shape text, metal text, finish text,
  palette jsonb not null default '[]'::jsonb,
  harmony int, notes text,
  created_at timestamptz not null default now()
);

create table public.looks (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  number text not null,
  name text not null,
  occasion text not null,
  harmony int not null default 90,
  palette jsonb not null default '[]'::jsonb,
  blurb text not null,
  why text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  look_id uuid not null references public.looks(id) on delete cascade,
  kind text not null, name text not null, house text not null, initial text not null,
  price text not null, note text not null, position int not null default 0,
  created_at timestamptz not null default now()
);
create index products_look_idx on public.products(look_id, position);

create table public.saved_looks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  look_id uuid not null references public.looks(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, look_id)
);

create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  look_id uuid not null references public.looks(id) on delete cascade,
  token text unique not null,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.users to authenticated;
grant all on public.users to service_role;
grant select, insert, update, delete on public.analyses to authenticated;
grant all on public.analyses to service_role;
grant select on public.looks to authenticated;
grant select on public.looks to anon;
grant all on public.looks to service_role;
grant select on public.products to authenticated;
grant select on public.products to anon;
grant all on public.products to service_role;
grant select, insert, update, delete on public.saved_looks to authenticated;
grant all on public.saved_looks to service_role;
grant select, insert, update, delete on public.share_links to authenticated;
grant select on public.share_links to anon;
grant all on public.share_links to service_role;

alter table public.users enable row level security;
alter table public.analyses enable row level security;
alter table public.looks enable row level security;
alter table public.products enable row level security;
alter table public.saved_looks enable row level security;
alter table public.share_links enable row level security;

create policy "Users select own profile" on public.users for select using (auth.uid() = id);
create policy "Users insert own profile" on public.users for insert with check (auth.uid() = id);
create policy "Users update own profile" on public.users for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "Users delete own profile" on public.users for delete using (auth.uid() = id);

create policy "Analyses by owner" on public.analyses for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Looks readable to all" on public.looks for select using (true);
create policy "Products readable to all" on public.products for select using (true);

create policy "Saved by owner" on public.saved_looks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Share links owner all" on public.share_links for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Share links readable by token" on public.share_links for select using (true);

create or replace function public.tg_set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

create trigger users_set_updated_at before update on public.users
for each row execute function public.tg_set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
