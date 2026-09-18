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
