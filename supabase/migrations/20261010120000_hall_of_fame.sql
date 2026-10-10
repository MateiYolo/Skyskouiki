-- Le tableau des records, comme sur les flippers.
--
-- Trois lettres et un score par ligne. Le score ne vient jamais du navigateur :
-- le serveur le lit dans l'état de la partie terminée, et c'est ce qu'il
-- inscrit. Le navigateur ne fournit que les initiales — et on n'y regarde pas.
--
-- La table ne pointe pas vers `skyjo.games` : les parties sont purgées au bout
-- de quinze jours, un record ne l'est jamais.

create table if not exists skyjo.records (
  id           uuid primary key default gen_random_uuid(),
  -- De quoi n'inscrire chaque joueur qu'une fois par partie terminée. Pas la
  -- version : un joueur qui revient sur l'écran de fin la fait bouger. Deux
  -- revanches du même salon se distinguent par leur nombre de manches et leur
  -- score — et si les deux coïncident, c'est la même ligne qu'on réécrit.
  game_id      uuid not null,
  player_id    text not null,
  initials     text not null,
  score        integer not null,
  -- A franchi la barre : son tableau est celui de la honte.
  busted       boolean not null,
  rounds       integer not null,
  players      integer not null,
  spicy        boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (game_id, player_id, rounds, score)
);

comment on table skyjo.records is
  'Tableau des records. Score lu côté serveur dans la partie terminée ; seules les initiales viennent du joueur.';

create index if not exists records_board_idx on skyjo.records (busted, score, created_at);

-- Même régime que l'état des parties : RLS active, aucune policy. Seul le
-- serveur, par les fonctions ci-dessous, lit et écrit ici.
alter table skyjo.records enable row level security;
grant all on skyjo.records to service_role;

-- Inscrit (ou réécrit) les initiales d'un joueur pour une partie terminée.
create or replace function public.skyjo_record_score(p_entry jsonb)
returns uuid
language plpgsql
security invoker
set search_path = skyjo, public
as $$
declare
  v_id uuid;
begin
  insert into skyjo.records
    (game_id, player_id, initials, score, busted, rounds, players, spicy)
  values (
    (p_entry->>'gameId')::uuid,
    p_entry->>'playerId',
    p_entry->>'initials',
    (p_entry->>'score')::integer,
    (p_entry->>'busted')::boolean,
    (p_entry->>'rounds')::integer,
    (p_entry->>'players')::integer,
    (p_entry->>'spicy')::boolean
  )
  -- Le même joueur qui se reprend : on garde la ligne, on change les lettres.
  on conflict (game_id, player_id, rounds, score)
    do update set initials = excluded.initials
  returning id into v_id;

  return v_id;
end;
$$;

-- Les deux tableaux, dix lignes chacun. À score égal, l'ancien reste devant.
create or replace function public.skyjo_hall_of_fame(p_size integer default 10)
returns jsonb
language sql
stable
security invoker
set search_path = skyjo, public
as $$
  select jsonb_build_object(
    'best', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.score asc, e.at asc)
        from (
          select id, initials, score, rounds, players, spicy,
                 (extract(epoch from created_at) * 1000)::bigint as at
            from skyjo.records
           where not busted
           order by score asc, created_at asc
           limit p_size
        ) e
    ), '[]'::jsonb),
    'shame', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.score desc, e.at asc)
        from (
          select id, initials, score, rounds, players, spicy,
                 (extract(epoch from created_at) * 1000)::bigint as at
            from skyjo.records
           where busted
           order by score desc, created_at asc
           limit p_size
        ) e
    ), '[]'::jsonb)
  );
$$;

revoke execute on function
  public.skyjo_record_score(jsonb),
  public.skyjo_hall_of_fame(integer)
from public, anon, authenticated;

grant execute on function
  public.skyjo_record_score(jsonb),
  public.skyjo_hall_of_fame(integer)
to service_role;
