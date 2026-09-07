-- Skyskouiki — schéma isolé dans la base hôte.
--
-- Principe de sécurité : l'état complet d'une partie (ordre de la pioche,
-- valeur des cartes face cachée) ne doit jamais pouvoir être lu par un
-- navigateur. Il vit donc dans `skyjo.game_states`, une table sur laquelle
-- aucun rôle client n'a le moindre droit. Les clients ne lisent que
-- `skyjo.games`, qui ne contient que des méta-données publiques et sert de
-- signal temps réel : quand la version change, le client redemande au serveur
-- sa propre projection expurgée de la partie.

create schema if not exists skyjo;

-- --------------------------------------------------------------------------
-- Tables
-- --------------------------------------------------------------------------

-- Méta publique. Aucune information cachée ici : c'est le canal temps réel.
create table if not exists skyjo.games (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  version           integer not null default 1,
  phase             text not null default 'lobby',
  current_player_id text,
  player_count      integer not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table skyjo.games is
  'Méta-données publiques d''une partie. Sert de canal de notification temps réel : aucune donnée cachée ne doit être ajoutée ici.';

-- État complet du moteur, sérialisé. Secret.
create table if not exists skyjo.game_states (
  game_id uuid primary key references skyjo.games(id) on delete cascade,
  state   jsonb not null
);

comment on table skyjo.game_states is
  'État serveur complet, incluant la pioche et les cartes face cachée. Accessible uniquement via la clé de service.';

create index if not exists games_updated_at_idx on skyjo.games (updated_at);

-- --------------------------------------------------------------------------
-- Droits et RLS
-- --------------------------------------------------------------------------

alter table skyjo.games       enable row level security;
alter table skyjo.game_states enable row level security;

-- Le schéma reste invisible de PostgREST (il n'est pas exposé) : les clients y
-- accèdent uniquement par le canal temps réel, qui évalue quand même la RLS.
grant usage on schema skyjo to anon, authenticated, service_role;
grant select on skyjo.games to anon, authenticated;
grant all    on skyjo.games, skyjo.game_states to service_role;

-- Lecture publique de la méta : elle ne révèle rien d'une main adverse.
drop policy if exists games_public_read on skyjo.games;
create policy games_public_read on skyjo.games for select to anon, authenticated using (true);

-- skyjo.game_states : volontairement sans aucune policy. RLS activée + zéro
-- policy = aucun rôle client ne peut lire une seule ligne, même par erreur.

-- --------------------------------------------------------------------------
-- API serveur (appelée avec la clé de service uniquement)
-- --------------------------------------------------------------------------

-- Crée une partie et son état initial, de façon atomique.
create or replace function public.skyjo_create_game(p_code text, p_state jsonb)
returns uuid
language plpgsql
security invoker
set search_path = skyjo, public
as $$
declare
  v_id uuid;
begin
  insert into skyjo.games (code, version, phase, current_player_id, player_count)
  values (
    p_code,
    (p_state->>'version')::integer,
    p_state->>'phase',
    p_state->'players'->((p_state->>'currentPlayerIndex')::integer)->>'id',
    jsonb_array_length(p_state->'players')
  )
  returning id into v_id;

  insert into skyjo.game_states (game_id, state)
  values (v_id, jsonb_set(p_state, '{id}', to_jsonb(v_id::text)));

  return v_id;
end;
$$;

-- Charge l'état complet d'une partie à partir de son code.
create or replace function public.skyjo_load_game(p_code text)
returns jsonb
language sql
security invoker
set search_path = skyjo, public
as $$
  select gs.state
    from skyjo.games g
    join skyjo.game_states gs on gs.game_id = g.id
   where g.code = upper(p_code);
$$;

-- Écrit le nouvel état, mais seulement si personne n'a joué entre-temps.
-- Renvoie false en cas de collision : l'appelant relit et rejoue son action.
create or replace function public.skyjo_commit_state(
  p_game_id          uuid,
  p_expected_version integer,
  p_state            jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = skyjo, public
as $$
declare
  v_rows integer;
begin
  update skyjo.game_states
     set state = p_state
   where game_id = p_game_id
     and (state->>'version')::integer = p_expected_version;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return false;
  end if;

  -- Cette écriture est ce qui réveille les autres joueurs via le temps réel.
  update skyjo.games
     set version           = (p_state->>'version')::integer,
         phase             = p_state->>'phase',
         current_player_id = p_state->'players'->((p_state->>'currentPlayerIndex')::integer)->>'id',
         player_count      = jsonb_array_length(p_state->'players'),
         updated_at        = now()
   where id = p_game_id;

  return true;
end;
$$;

-- Ménage : les parties abandonnées ne servent à rien passé quelques jours.
create or replace function public.skyjo_purge_stale_games(p_older_than interval default interval '14 days')
returns integer
language plpgsql
security invoker
set search_path = skyjo, public
as $$
declare
  v_rows integer;
begin
  delete from skyjo.games where updated_at < now() - p_older_than;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke execute on function
  public.skyjo_create_game(text, jsonb),
  public.skyjo_load_game(text),
  public.skyjo_commit_state(uuid, integer, jsonb),
  public.skyjo_purge_stale_games(interval)
from public, anon, authenticated;

grant execute on function
  public.skyjo_create_game(text, jsonb),
  public.skyjo_load_game(text),
  public.skyjo_commit_state(uuid, integer, jsonb),
  public.skyjo_purge_stale_games(interval)
to service_role;

-- --------------------------------------------------------------------------
-- Temps réel
-- --------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'skyjo' and tablename = 'games'
  ) then
    alter publication supabase_realtime add table skyjo.games;
  end if;
end
$$;
