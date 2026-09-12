-- Le commit rend l'état frais au lieu d'un refus nu.
--
-- Le verrou optimiste n'a pas changé : `skyjo_commit_state` n'écrit toujours
-- que si la version en base est encore celle sur laquelle l'appelant a joué.
-- Ce qui change, c'est ce qu'il répond quand elle a bougé. Avant, un `false` :
-- l'appelant devait relire, donc payer un aller-retour complet pour rejouer
-- son coup. Maintenant l'état frais accompagne le refus, et le coup se rejoue
-- sur-le-champ.
--
-- C'est aussi ce qui rend le cache en processus du serveur sans risque : jouer
-- sur un état périmé ne produit pas un état faux, ça produit un refus — et le
-- refus porte de quoi recommencer.

-- Le type de retour change (boolean → jsonb) : il faut déposer l'ancienne.
drop function if exists public.skyjo_commit_state(uuid, integer, jsonb);

create function public.skyjo_commit_state(
  p_game_id          uuid,
  p_expected_version integer,
  p_state            jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = skyjo, public
as $$
declare
  v_rows    integer;
  v_current jsonb;
begin
  update skyjo.game_states
     set state = p_state
   where game_id = p_game_id
     and (state->>'version')::integer = p_expected_version;

  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    -- Collision (ou partie disparue) : on rend ce que la base contient, pour
    -- que l'appelant rejoue son coup sans avoir à le redemander.
    select gs.state into v_current
      from skyjo.game_states gs
     where gs.game_id = p_game_id;

    return jsonb_build_object('ok', false, 'state', v_current);
  end if;

  -- Cette écriture est ce qui réveille les autres joueurs via le temps réel.
  -- Elle reste le filet : la diffusion de la vue part du serveur, par l'API
  -- REST de Realtime, et peut se perdre sans que personne ne s'en aperçoive.
  update skyjo.games
     set version           = (p_state->>'version')::integer,
         phase             = p_state->>'phase',
         current_player_id = p_state->'players'->((p_state->>'currentPlayerIndex')::integer)->>'id',
         player_count      = jsonb_array_length(p_state->'players'),
         updated_at        = now()
   where id = p_game_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- Les droits partent avec la fonction déposée : il faut les reposer.
revoke execute on function public.skyjo_commit_state(uuid, integer, jsonb) from public, anon, authenticated;
grant  execute on function public.skyjo_commit_state(uuid, integer, jsonb) to service_role;
