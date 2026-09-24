-- Papa Parfait — schéma PostgreSQL (Supabase).
-- À coller dans Supabase → SQL Editor → Run. Idempotent.

-- 1) Profil du papa, lié au compte Auth (auth.users).
create table if not exists public.profils (
  id         uuid primary key references auth.users(id) on delete cascade,
  prenom     text not null,
  age        int  not null check (age between 0 and 5),   -- âge de l'enfant, 0-5
  ville_id   text not null,
  dept_code  text,
  cree_le    timestamptz not null default now()
);

alter table public.profils enable row level security;

-- Chaque papa ne voit et ne modifie que son propre profil.
drop policy if exists "profil_lecture_soi" on public.profils;
create policy "profil_lecture_soi" on public.profils
  for select using (auth.uid() = id);

drop policy if exists "profil_ecriture_soi" on public.profils;
create policy "profil_ecriture_soi" on public.profils
  for insert with check (auth.uid() = id);

drop policy if exists "profil_maj_soi" on public.profils;
create policy "profil_maj_soi" on public.profils
  for update using (auth.uid() = id);

-- 2) Demandes de ville (papa dont la ville n'est pas dans la liste).
--    Consultées dans le dashboard (back-office admin), pas par les papas.
create table if not exists public.demandes_ville (
  id        bigint generated always as identity primary key,
  ville     text not null,
  email     text,
  code      text,          -- code département deviné (35/22/56/29) si connu
  traitee   boolean not null default false,
  cree_le   timestamptz not null default now()
);

alter table public.demandes_ville enable row level security;

-- Insertion ouverte (même pendant l'onboarding, avant compte confirmé).
-- Aucune policy de lecture : seul le dashboard (service_role) les voit.
drop policy if exists "demande_insert" on public.demandes_ville;
create policy "demande_insert" on public.demandes_ville
  for insert with check (true);

-- Vue de tri par fréquence pour le back-office (villes les plus demandées).
create or replace view public.demandes_ville_frequence as
  select lower(trim(ville)) as ville, count(*) as demandes, max(cree_le) as derniere
  from public.demandes_ville
  group by lower(trim(ville))
  order by demandes desc, derniere desc;

-- 3) Sorties gardées. Elles existent d'abord en local (l'app marche sans
--    compte) ; cette table sert à les retrouver sur un autre appareil, ce qui
--    est la seule raison donnée au papa de créer un compte.
create table if not exists public.favoris (
  id          bigint generated always as identity primary key,
  papa        uuid not null references auth.users(id) on delete cascade,
  cle         text not null,          -- id de la source, sinon titre|date
  sortie      jsonb not null,         -- la fiche allégée, pour réafficher sans recharger
  date_sortie date,
  cree_le     timestamptz not null default now(),
  unique (papa, cle)
);

create index if not exists favoris_papa_idx on public.favoris (papa, cree_le desc);

alter table public.favoris enable row level security;

-- Chaque papa ne voit et ne modifie que ses propres sorties gardées.
drop policy if exists "favori_lecture_soi" on public.favoris;
create policy "favori_lecture_soi" on public.favoris
  for select using (auth.uid() = papa);

drop policy if exists "favori_insert_soi" on public.favoris;
create policy "favori_insert_soi" on public.favoris
  for insert with check (auth.uid() = papa);

drop policy if exists "favori_maj_soi" on public.favoris;
create policy "favori_maj_soi" on public.favoris
  for update using (auth.uid() = papa) with check (auth.uid() = papa);

drop policy if exists "favori_suppr_soi" on public.favoris;
create policy "favori_suppr_soi" on public.favoris
  for delete using (auth.uid() = papa);

-- 4) Alerte du week-end. Le vendredi, le top du samedi part par e-mail aux
--    papas qui l'ont demandé — c'est la deuxième raison de créer un compte.
--    Opt-in explicite : la colonne vaut false tant que la case n'est pas cochée.
alter table public.profils
  add column if not exists alerte_weekend boolean not null default false;

--    Jeton de désabonnement : il voyage dans le lien de chaque e-mail. Un jeton
--    par papa, imprévisible, révocable — jamais l'identifiant du compte, qui ne
--    doit pas circuler dans des liens.
alter table public.profils
  add column if not exists alerte_jeton uuid not null default gen_random_uuid();

--    Dernier envoi : évite le double envoi si le cron est rejoué le même jour.
alter table public.profils
  add column if not exists alerte_envoyee_le date;

create index if not exists profils_alerte_idx
  on public.profils (alerte_weekend) where alerte_weekend;
