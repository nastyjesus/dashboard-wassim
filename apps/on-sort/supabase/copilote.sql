-- Copilote papa — tables du worker `copilote-papa` (workers/copilote).
-- À coller dans l'éditeur SQL de Supabase, comme schema.sql. Idempotent.
--
-- Seul le worker lit et écrit, avec la clé service : RLS activée et aucune
-- politique publique. Vie privée (spec § 7) : prénom et mois de naissance de
-- l'enfant, jamais de nom de famille, d'école, d'adresse ni de photo.

create table if not exists public.papas (
  id uuid primary key default gen_random_uuid(),
  -- Compte de l'app (PWA), si le papa en a un.
  auth_id uuid unique references auth.users (id) on delete cascade,
  -- Numéro WhatsApp haché (SHA-256 + sel WA_SEL) : jamais en clair.
  wa_hash text unique,
  prenom text,
  ton text not null default 'pote' check (ton in ('pote', 'coach')),
  ville_id text,
  plan_vendredi boolean not null default false,
  abonne boolean not null default false,
  cree_le timestamptz not null default now(),
  constraint papas_identifie check (auth_id is not null or wa_hash is not null)
);

create table if not exists public.enfants (
  id uuid primary key default gen_random_uuid(),
  papa uuid not null references public.papas (id) on delete cascade,
  prenom text not null check (char_length(prenom) between 1 and 40),
  -- Premier jour du mois de naissance : l'âge suffit, pas la date exacte.
  naissance date not null,
  gouts text check (char_length(gouts) <= 300),
  cree_le timestamptz not null default now()
);
create index if not exists enfants_papa on public.enfants (papa);

create table if not exists public.souvenirs (
  id uuid primary key default gen_random_uuid(),
  enfant uuid not null references public.enfants (id) on delete cascade,
  le date not null default current_date,
  type text not null check (type in ('histoire', 'sortie', 'activite', 'journee')),
  texte text not null check (char_length(texte) <= 500)
);
create index if not exists souvenirs_enfant_le on public.souvenirs (enfant, le desc);

create table if not exists public.usage (
  id uuid primary key default gen_random_uuid(),
  papa uuid not null references public.papas (id) on delete cascade,
  brique text not null check (brique in ('sos', 'activite', 'histoire', 'plan')),
  le timestamptz not null default now(),
  retour smallint check (retour in (-1, 1))
);
create index if not exists usage_papa_le on public.usage (papa, le desc);

alter table public.papas enable row level security;
alter table public.enfants enable row level security;
alter table public.souvenirs enable row level security;
alter table public.usage enable row level security;
