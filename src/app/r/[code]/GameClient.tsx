'use client';

import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { EventLayer } from '@/components/EventLayer';
import { FlightLayer } from '@/components/FlightLayer';
import { MyBoard } from '@/components/MyBoard';
import { OpponentSheet, OpponentStrip } from '@/components/OpponentStrip';
import { TableCenter } from '@/components/TableCenter';
import { GameOverPanel, RoundSummary } from '@/components/Overlays';
import { useMoveEcho } from '@/lib/client/echo';
import { EMOJIS, useIdentity } from '@/lib/client/identity';
import { revealHold } from '@/lib/client/flights';
import { MOVE } from '@/lib/client/motion';
import { armAudio, cue, initAudio, isMuted, setMuted } from '@/lib/client/feedback';
import { disableNudge, enableNudge, nudgeState, type NudgeState } from '@/lib/client/nudge';
import { useGame } from '@/lib/client/useGame';
import { heldSummary, lastMoves, nextPlayerId } from '@/lib/skyjo';
import type { GameView, LegalAction, Variant } from '@/lib/skyjo';

/** Ce que le joueur doit faire, là, maintenant. */
function prompt(
  view: GameView,
  /** La carte déjà désignée d'un échange en deux gestes, s'il y en a une. */
  picked: number | null,
): { title: string; hint: string } {
  const me = view.players.find((p) => p.id === view.you.id);
  const current = view.players.find((p) => p.id === view.currentPlayerId);

  switch (view.phase) {
    case 'lobby':
      return {
        title: 'Salon',
        hint:
          view.players.length < 2
            ? 'Partage le code, on démarre à deux.'
            : 'Partage le code, on peut jouer jusqu’à huit.',
      };
    case 'initialFlip':
      return me && me.faceUpCount < 2
        ? { title: 'Retourne 2 cartes', hint: 'Le plus gros total commence.' }
        : { title: 'Bien joué', hint: 'On attend les autres…' };
    // La manche est fermée : la consigne le redit à chaque étape du tour. Un
    // « à toi » qui ne dit pas que c'est la dernière fois est un demi-mensonge —
    // on ne joue pas le même coup quand il en reste douze et quand il n'en
    // reste qu'un.
    case 'playing': {
      const closing = view.finalTurnsLeft !== null;
      const closedByMe = view.roundCloserId === view.you.id;
      if (view.currentPlayerId !== view.you.id) {
        return {
          title: `${current?.emoji ?? ''} ${current?.name ?? ''} joue`,
          hint: closedByMe
            ? // Celui qui a fermé ne joue plus : sa consigne n'est pas d'attendre,
              // c'est de savoir ce qu'il risque. C'est la seule chose que le
              // bandeau rouge disait et que la pastille ne peut pas porter.
              'Tu ne joues plus : le plus petit total, sinon il double.'
            : closing
              ? 'Son dernier coup, puis on compte.'
              : // À deux, « ensuite, c'est moi » n'a pas besoin d'être dit. À
                // quatre, c'est la moitié de la décision : savoir s'il reste un
                // tour ou trois dit si la défausse qu'on convoite sera encore là.
                nextPlayerId(view) === view.you.id
                ? 'Tu joues juste après : prépare ton coup.'
                : 'Observe et prépare ton coup.',
        };
      }
      if (view.turnStep === 'choose') {
        return closing
          ? { title: 'Ton dernier tour !', hint: 'Un seul coup pour descendre ton total.' }
          : { title: 'À toi !', hint: 'Pioche, ou prends la carte de la défausse.' };
      }
      if (view.turnStep === 'holding') {
        return view.heldFrom === 'draw'
          ? {
              title: 'Échange-la, ou jette-la',
              hint: closing
                ? 'Dernier coup : ce que tu poses, tu le comptes.'
                : 'Tape une de tes cartes — ou la défausse pour t’en débarrasser.',
            }
          : { title: 'Place la carte', hint: 'Tape la carte que tu veux remplacer.' };
      }
      // Le Vol se joue en deux gestes : la consigne doit dire lequel des deux
      // reste à faire, sinon le premier tap semble n'avoir rien déclenché.
      if (view.turnStep === 'stealing') {
        return picked === null
          ? { title: 'Vol !', hint: 'Donne une de tes cartes, visible ou cachée — ou renonce.' }
          : {
              title: 'Contre laquelle ?',
              hint: 'Ouvre la grille d’un adversaire et tape la carte que tu prends.',
            };
      }
      // La Valse aussi se joue en deux gestes, mais les deux se font chez moi.
      if (view.turnStep === 'swapping') {
        return picked === null
          ? { title: 'Valse !', hint: 'Tape une de tes cartes, visible ou cachée — ou renonce.' }
          : {
              title: 'Avec laquelle ?',
              hint: 'Tape une seconde carte : les deux échangent de place.',
            };
      }
      return { title: 'Retourne une carte', hint: 'Tu as jeté la pioche : il faut en découvrir une.' };
    }
    case 'roundOver':
      return { title: 'Manche terminée', hint: '' };
    case 'gameOver':
      return { title: 'Partie terminée', hint: '' };
  }
}

/**
 * Retient son contenu le temps que la table finisse de bouger.
 *
 * La manche se termine sur le coup le plus chargé de la partie : une dernière
 * carte posée, tous les dos qui se retournent chez chacun, et parfois une
 * colonne qui saute au passage. Le serveur envoie tout ça dans la même
 * version — poser la feuille de scores par-dessus, c'est escamoter la seule
 * chose que tout le monde attendait : ce qu'il y avait sous les dernières
 * cartes.
 *
 * Le délai est figé au montage : les rafraîchissements qui suivent (un joueur
 * qui rejoint, le sondage de secours) ne doivent pas relancer le compte à
 * rebours. Et c'est le démontage qui remet tout à zéro pour la manche
 * suivante — il n'y a pas d'état à réarmer.
 */
function Delayed({ by, children }: { by: number; children: React.ReactNode }) {
  const [wait] = useState(by);
  const [open, setOpen] = useState(wait <= 0);

  useEffect(() => {
    if (open) return;
    const timer = setTimeout(() => setOpen(true), wait);
    return () => clearTimeout(timer);
  }, [wait, open]);

  return open ? <>{children}</> : null;
}

export function GameClient({ code }: { code: string }) {
  const { identity, update, ready } = useIdentity();
  const { view, me, loading, error, busy, live, revealing, act } = useGame(
    code,
    identity?.playerId ?? null,
  );
  const echo = useMoveEcho(view);
  const [notice, setNotice] = useState<string | null>(null);
  const [muted, setMutedState] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [joining, setJoining] = useState(false);
  const [inspecting, setInspecting] = useState<string | null>(null);
  // Ma carte désignée pour un Vol ou une Valse, en attente de sa contrepartie.
  const [pickedCell, setPickedCell] = useState<number | null>(null);

  // Préférence de son lue dans le navigateur, donc après le montage.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMutedState(isMuted()), []);

  // Le son se prépare au premier geste, hors du chemin d'un coup.
  useEffect(armAudio, []);

  const run = useCallback(
    async (action: Parameters<typeof act>[0]) => {
      // L'action d'abord : c'est elle qui fait bouger l'écran. Le son part dans
      // la tâche suivante, pour que la synthèse ne s'intercale pas entre le
      // doigt et la première image.
      const pending = act(action);
      setTimeout(() => cue('tap'), 0);
      const failure = await pending;
      if (failure) setNotice(failure);
    },
    [act],
  );

  // Un message d'erreur ne doit pas rester collé à l'écran.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3200);
    return () => clearTimeout(timer);
  }, [notice]);

  // Entrée automatique dans la partie dès qu'on a un pseudo.
  useEffect(() => {
    if (!view || !identity?.name || me || joining) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setJoining(true);
    void act({ type: 'join', name: identity.name, emoji: identity.emoji }).then((failure) => {
      if (failure) setNotice(failure);
      setJoining(false);
    });
  }, [view, identity, me, joining, act]);

  // Ce que le prochain tap doit envoyer change à chaque coup ; le gestionnaire,
  // lui, ne doit pas. S'il changeait d'identité à chaque version reçue, les
  // douze cases se redessineraient toutes à chaque réponse du serveur — la
  // mémoïsation ne filtrerait plus rien, et ça se voit pendant les
  // retournements. La consigne se lit donc dans une référence.
  const legal = useMemo<ReadonlySet<LegalAction>>(
    () => new Set(view?.legalActions ?? []),
    [view?.legalActions],
  );
  const legalRef = useRef(legal);
  useEffect(() => {
    legalRef.current = legal;
  }, [legal]);

  /**
   * La carte déjà désignée, telle que la règle du moment l'autorise.
   *
   * Gardée au même endroit que `legal`, et pour la même raison — mais surtout
   * remise à zéro par le calcul lui-même : une sélection laissée par un tour
   * précédent ferait partir la Valse suivante dès le premier tap, sur une case
   * que le joueur ne voit plus.
   */
  const picked = legal.has('steal') || legal.has('swap') ? pickedCell : null;
  const pickedRef = useRef(picked);
  useEffect(() => {
    pickedRef.current = picked;
  }, [picked]);

  const onCell = useCallback(
    (index: number) => {
      const now = legalRef.current;
      if (now.has('flipInitial')) return void run({ type: 'flipInitial', index });
      if (now.has('placeCard')) return void run({ type: 'placeCard', index });
      if (now.has('flipCard')) return void run({ type: 'flipCard', index });
      // Un Vol ne part pas au premier tap : on retient la carte, et c'est le
      // second geste — sur la grille d'en face — qui envoie le coup. Retaper la
      // même carte la relâche.
      if (now.has('steal')) return setPickedCell((current) => (current === index ? null : index));
      // Une Valse se joue entièrement ici : la première case attend, la
      // seconde envoie l'échange. La sélection se lit dans une référence
      // plutôt que dans l'état, pour que ce gestionnaire garde son identité
      // d'un coup à l'autre (cf. `legalRef`).
      if (now.has('swap')) {
        const first = pickedRef.current;
        if (first === null || first === index) {
          setPickedCell(first === index ? null : index);
          return;
        }
        setPickedCell(null);
        void run({ type: 'swap', index: first, otherIndex: index });
      }
    },
    [run],
  );

  // Mémoïsée pour la même raison que les gestionnaires : `MyBoard` la reçoit en
  // propriété, et une fonction neuve à chaque rendu lui ferait refaire ses douze
  // cartes chaque fois qu'un état sans rapport bouge — une annonce qui s'efface,
  // le menu ⚙ qu'on ouvre.
  const isTarget = useCallback(
    (index: number) => {
      if (!me) return false;
      const cell = me.grid[index];
      if (!cell) return false;
      // Une carte déjà partie en rotation n'attend plus rien de nous.
      if (revealing.includes(index)) return false;
      if (legal.has('flipInitial')) {
        // Deux cartes, celles qui tournent déjà comprises : sans ce compte, un
        // troisième tap partirait pour se faire refuser par le serveur.
        return !cell.faceUp && me.faceUpCount + revealing.length < 2;
      }
      if (legal.has('placeCard')) return true;
      // Un Vol échange n'importe laquelle de mes cartes, dos compris : donner
      // une carte qu'on n'a jamais vue est un coup à part entière. La Valse en
      // prend deux, avec la même liberté.
      if (legal.has('steal') || legal.has('swap')) return true;
      if (legal.has('flipCard')) return !cell.faceUp;
      return false;
    },
    [legal, me, revealing],
  );

  // Un seul bouton « Renoncer » pour les deux cartes : c'est la règle du moment
  // qui dit à laquelle on renonce.
  const onDecline = useCallback(() => {
    const swapping = legalRef.current.has('declineSwap');
    void run({ type: swapping ? 'declineSwap' : 'declineSteal' });
  }, [run]);
  const onDraw = useCallback(() => void run({ type: 'drawFromPile' }), [run]);
  const onTakeDiscard = useCallback(() => void run({ type: 'takeDiscard' }), [run]);
  const onDiscardHeld = useCallback(() => void run({ type: 'discardHeld' }), [run]);
  const onStart = useCallback(() => void run({ type: 'startGame' }), [run]);
  const onNextRound = useCallback(() => void run({ type: 'nextRound' }), [run]);
  const onPlayAgain = useCallback(() => void run({ type: 'playAgain' }), [run]);
  const onSetVariant = useCallback(
    (variant: Variant) => void run({ type: 'setVariant', variant }),
    [run],
  );

  const opponents = useMemo(
    () => view?.players.filter((p) => p.id !== view.you.id) ?? [],
    [view],
  );

  const moves = useMemo(() => (view ? lastMoves(view) : {}), [view]);

  /**
   * La manche est fermée : il ne reste qu'un coup à chacun.
   *
   * Un booléen, désormais, et rien de plus. Le bandeau rouge qui vivait au
   * milieu de la table portait le mot « dernier tour » en même temps que
   * l'annonce plein écran, la consigne et la pastille de ma grille — quatre
   * fois la même chose —, et il poussait la table vers le bas en apparaissant,
   * au coup où on a le moins envie de voir sa grille bouger. Ce qu'il disait
   * d'utile en plus (ce que ça change pour celui qui lit) est passé dans
   * `prompt`, qui a deux lignes réservées de toute façon ; qui a fermé se lit
   * sur la bande des adversaires, marquée « fermé ».
   */
  const finalTurn = view?.phase === 'playing' && view.finalTurnsLeft !== null;

  // Qui tient la carte posée au milieu de la table. Sans nom dessus, elle
  // n'appartient à personne et un tour d'adversaire se lit comme un décor.
  // Les deux cartes spéciales occupent le créneau de la carte en main sans rien
  // « tenir » au sens du moteur : il faut donc les nommer toutes les deux ici,
  // comme `TableCenter` le fait. La Valse manquait — sa carte turquoise
  // apparaissait au milieu de la table sans dire à qui elle était, ce qui à
  // deux se devinait et à quatre ne se devine plus.
  const holderId =
    view?.heldFrom !== null || view?.turnStep === 'stealing' || view?.turnStep === 'swapping'
      ? view?.currentPlayerId
      : null;
  const holder = useMemo(() => {
    const carrier = holderId ? view?.players.find((p) => p.id === holderId) : null;
    return carrier
      ? { name: carrier.name, emoji: carrier.emoji, isMe: carrier.id === view!.you.id }
      : null;
  }, [holderId, view]);

  if (!ready || loading) {
    return <Centered>Chargement…</Centered>;
  }
  if (error || !view) {
    return (
      <Centered>
        <p className="mb-4 text-ink-dim">{error ?? 'Partie introuvable.'}</p>
        <Link href="/" className="rounded-full bg-accent px-5 py-2.5 font-semibold text-felt-900">
          Retour
        </Link>
      </Centered>
    );
  }
  if (identity && !identity.name) {
    return <ProfileGate identity={identity} onSave={update} />;
  }

  // La carte retenue n'a de sens que tant qu'un échange est à résoudre (cf.
  // `picked`) : seul le Vol l'envoie depuis la grille d'en face.
  const stealFrom = legal.has('steal') ? picked : null;

  const { title, hint } = prompt(view, picked);
  const myTurn = view.currentPlayerId === view.you.id;
  const held = heldSummary(view);
  // Résolu au rendu : un joueur qui quitte referme sa fiche de lui-même.
  const inspected = opponents.find((p) => p.id === inspecting) ?? null;

  // Quand *toutes* les cases sont jouables — une carte à poser, une carte à
  // donner au Vol, deux à intervertir — douze liserés jaunes ne désignent rien
  // et couvrent la seule chose à lire, les cartes.
  const markTargets = !legal.has('placeCard') && !legal.has('steal') && !legal.has('swap');

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <EventLayer view={view} />
      <FlightLayer view={view} />

      {/* Barre du haut */}
      <header className="safe-top flex items-center justify-between px-4 pb-2">
        <Link href="/" className="text-sm text-ink-faint" aria-label="Quitter">
          ←
        </Link>
        {/* Le code n'a plus rien à faire ici une fois tout le monde entré : il
            vit dans le salon, puis dans le menu ⚙ pour le retardataire. */}
        <div className="text-[0.65rem] uppercase tracking-[0.18em] text-ink-faint">
          {view.phase === 'lobby' ? 'salon' : `manche ${view.round}`} · objectif {view.targetScore}
          {/* Le mode change le paquet : il doit rester lisible toute la partie,
              pas seulement au moment où on le choisit. */}
          {view.variant === 'spicy' && <span className="ml-1.5 text-steal">· spicy</span>}
        </div>
        <button
          type="button"
          onClick={() => setShowSettings((s) => !s)}
          className="text-sm text-ink-faint"
          aria-label="Réglages"
        >
          ⚙
        </button>
      </header>

      {showSettings && (
        <SettingsSheet
          code={view.code}
          muted={muted}
          live={live}
          onToggleMute={() => {
            const next = !muted;
            setMuted(next);
            setMutedState(next);
            if (!next) {
              initAudio();
              cue('tap');
            }
          }}
          onClose={() => setShowSettings(false)}
        />
      )}

      {view.phase === 'lobby' ? (
        <Lobby
          view={view}
          onStart={onStart}
          onSetVariant={onSetVariant}
          canSetVariant={legal.has('setVariant')}
          busy={busy}
        />
      ) : (
        <>
          <OpponentStrip
            view={view}
            opponents={opponents}
            moves={moves}
            echo={echo}
            picking={stealFrom !== null}
            onOpen={setInspecting}
          />

          {/* Les piles au milieu, entre les deux grilles : une carte qui monte
              part chez l'adversaire, une carte qui descend arrive chez moi. */}
          <TableCenter
            title={title}
            hint={hint}
            emphasis={myTurn || view.phase === 'initialFlip'}
            finalTurn={finalTurn}
            drawPileCount={view.drawPileCount}
            discardTop={view.discardTop}
            heldCard={view.heldCard}
            heldFrom={view.heldFrom}
            stealing={view.turnStep === 'stealing'}
            swapping={view.turnStep === 'swapping'}
            heldNote={held?.text ?? null}
            holder={holder}
            drewFrom={echo?.drewFrom ?? null}
            echoKey={echo?.version ?? 0}
            canDraw={legal.has('drawFromPile')}
            canTakeDiscard={legal.has('takeDiscard')}
            canDiscardHeld={legal.has('discardHeld')}
            canDecline={legal.has('declineSteal') || legal.has('declineSwap')}
            onDraw={onDraw}
            onTakeDiscard={onTakeDiscard}
            onDiscardHeld={onDiscardHeld}
            onDecline={onDecline}
          />

          {me && (
            <MyBoard
              view={view}
              me={me}
              myTurn={myTurn}
              isTarget={isTarget}
              markTargets={markTargets}
              onCell={onCell}
              selected={picked}
              selectedTone={view.turnStep === 'swapping' ? 'swap' : 'steal'}
              touched={echo?.touched[view.you.id] ?? null}
              cleared={echo?.cleared[view.you.id] ?? null}
              echoKey={echo?.version ?? 0}
              revealing={revealing}
            />
          )}
        </>
      )}

      {/* Mon tour : un liseré sur tout le pourtour. Il ne masque rien et ne se
          rate pas, même le téléphone posé à côté de l'assiette. Rouge quand
          c'est le dernier coup de la manche : la couleur prévient avant que la
          consigne ne soit lue. */}
      {myTurn && view.phase === 'playing' && (
        <div
          className={`turn-glow pointer-events-none fixed inset-0 z-30 ${
            view.finalTurnsLeft !== null ? 'is-final' : ''
          }`}
          aria-hidden
        />
      )}

      <AnimatePresence>
        {inspected && (
          <OpponentSheet
            player={inspected}
            active={inspected.id === view.currentPlayerId}
            closer={inspected.id === view.roundCloserId}
            target={view.targetScore}
            onPick={
              stealFrom === null
                ? undefined
                : (targetIndex) => {
                    setInspecting(null);
                    setPickedCell(null);
                    void run({
                      type: 'steal',
                      index: stealFrom,
                      targetPlayerId: inspected.id,
                      targetIndex,
                    });
                  }
            }
            onClose={() => setInspecting(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {view.phase === 'roundOver' && (
          <Delayed by={revealHold(view)}>
            <RoundSummary view={view} busy={busy} onNext={onNextRound} />
          </Delayed>
        )}
        {view.phase === 'gameOver' && (
          <Delayed by={revealHold(view)}>
            <GameOverPanel view={view} busy={busy} onRestart={onPlayAgain} />
          </Delayed>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {notice && (
          <motion.div
            className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-6"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={MOVE}
          >
            <span className="rounded-full border border-danger/40 bg-danger/20 px-4 py-2 text-center text-[0.75rem] font-medium text-ink backdrop-blur-md">
              {notice}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Partage le lien de la partie. Renvoie `true` quand il a fallu se rabattre sur
 * le presse-papiers, pour que l'appelant puisse le dire à l'écran.
 */
async function shareGame(code: string): Promise<boolean> {
  const url = `${window.location.origin}/r/${code}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Skouikjo', text: `Rejoins ma partie : ${code}`, url });
      return false;
    }
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false; // partage annulé
  }
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid h-dvh place-items-center px-8 text-center text-sm text-ink-dim">
      <div>{children}</div>
    </div>
  );
}

function ProfileGate({
  identity,
  onSave,
}: {
  identity: { name: string; emoji: string };
  onSave: (patch: { name?: string; emoji?: string }) => void;
}) {
  const [name, setName] = useState(identity.name);
  const [emoji, setEmoji] = useState(identity.emoji);

  return (
    <div className="grid h-dvh place-items-center px-6">
      <div className="w-full max-w-sm rise">
        <h1 className="text-center text-2xl font-black">Tu es qui ?</h1>
        <p className="mb-5 mt-1 text-center text-sm text-ink-dim">
          Juste un prénom et une bestiole, pas de compte.
        </p>

        <div className="mb-3 grid grid-cols-8 gap-1.5">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEmoji(e)}
              className={`aspect-square rounded-xl text-lg transition ${
                e === emoji ? 'bg-accent/25 ring-2 ring-accent' : 'bg-white/5 active:bg-white/10'
              }`}
            >
              {e}
            </button>
          ))}
        </div>

        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Prénom"
          maxLength={16}
          autoComplete="given-name"
          className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-center text-lg font-semibold outline-none placeholder:text-ink-faint focus:border-accent/60"
        />

        <button
          type="button"
          disabled={!name.trim()}
          onClick={() => {
            initAudio();
            onSave({ name: name.trim(), emoji });
          }}
          className="mt-3 w-full rounded-2xl bg-accent px-4 py-3.5 font-bold text-felt-900 transition active:scale-[0.98] disabled:opacity-40"
        >
          C’est parti
        </button>
      </div>
    </div>
  );
}

function Lobby({
  view,
  onStart,
  onSetVariant,
  canSetVariant,
  busy,
}: {
  view: GameView;
  onStart: () => void;
  onSetVariant: (variant: Variant) => void;
  /** Seul l'hôte choisit : les autres lisent le mode sans pouvoir en changer. */
  canSetVariant: boolean;
  busy: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    if (!(await shareGame(view.code))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-ink-faint">code de la partie</p>
        <p className="tnum mt-1 text-5xl font-black tracking-[0.24em] text-accent">
          {view.code}
        </p>
      </div>

      <button
        type="button"
        onClick={share}
        className="rounded-full border border-white/15 bg-white/8 px-5 py-2.5 text-sm font-semibold active:scale-95"
      >
        {copied ? 'Lien copié ✓' : 'Partager le lien'}
      </button>

      <div className="w-full max-w-xs">
        <ul className="flex flex-wrap justify-center gap-2">
          {view.players.map((player, seat) => (
            <motion.li
              key={player.id}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2 rounded-full border border-white/12 bg-white/6 py-1.5 pl-2 pr-3.5"
            >
              {/* Le rang, parce qu'il n'est pas décoratif : l'ordre d'arrivée
                  **est** l'ordre de jeu, et à quatre ça se décide au salon
                  plutôt qu'à la première manche. */}
              <span className="tnum text-[0.6rem] font-bold text-ink-faint">{seat + 1}</span>
              <span className="text-lg" aria-hidden>
                {player.emoji}
              </span>
              <span className="text-sm font-semibold">{player.name}</span>
              {player.id === view.hostId && (
                <span className="text-[0.6rem] text-ink-faint">hôte</span>
              )}
            </motion.li>
          ))}
        </ul>
        <p className="mt-2 text-center text-[0.65rem] leading-snug text-ink-faint">
          {view.players.length} {view.players.length > 1 ? 'joueurs' : 'joueur'} · 8 maximum ·
          on joue dans cet ordre
        </p>
      </div>

      <VariantPicker
        variant={view.variant}
        canChange={canSetVariant}
        onChange={onSetVariant}
      />

      {view.you.isHost ? (
        view.players.length < 2 ? (
          // Un bouton jaune grisé vire au brun : mieux vaut un état d'attente assumé.
          <p className="w-full max-w-xs rounded-2xl border border-dashed border-white/15 px-4 py-3.5 text-center text-sm text-ink-dim">
            En attente d’un joueur…
          </p>
        ) : (
          <button
            type="button"
            onClick={onStart}
            disabled={busy}
            className="w-full max-w-xs rounded-2xl bg-accent px-4 py-3.5 font-bold text-felt-900 transition active:scale-[0.98] disabled:opacity-40"
          >
            Lancer la partie
          </button>
        )
      ) : (
        <p className="text-sm text-ink-dim">L’hôte lance la partie quand tout le monde est là.</p>
      )}

      <Link href="/regles" className="text-xs text-ink-faint underline underline-offset-4">
        Revoir les règles
      </Link>
    </div>
  );
}

/**
 * Le choix du mode, dans le salon.
 *
 * C'est le premier réglage de partie de l'application, et il ne vit que là :
 * le mode décide de la composition du paquet, donc il se fige à la
 * distribution. Les invités le lisent sans pouvoir le changer — mais ils le
 * lisent, parce qu'arriver dans une partie et découvrir un joker en cours de
 * manche n'est pas une surprise agréable.
 */
function VariantPicker({
  variant,
  canChange,
  onChange,
}: {
  variant: Variant;
  canChange: boolean;
  onChange: (variant: Variant) => void;
}) {
  const spicy = variant === 'spicy';
  const note = spicy
    ? 'Deux -5, deux jokers, cinq Vol et quatre Valse glissés dans le paquet.'
    : 'Le paquet officiel, rien de plus.';

  return (
    <div className="w-full max-w-xs">
      <p className="mb-1.5 text-center text-[0.6rem] uppercase tracking-[0.2em] text-ink-faint">
        mode
      </p>

      {canChange ? (
        <div className="flex gap-1 rounded-2xl border border-white/12 bg-white/5 p-1">
          {(['classic', 'spicy'] as const).map((option) => {
            const on = option === variant;
            return (
              <button
                key={option}
                type="button"
                onClick={() => onChange(option)}
                aria-pressed={on}
                className={[
                  'flex-1 rounded-xl px-3 py-2 text-sm font-bold transition active:scale-[0.98]',
                  on
                    ? option === 'spicy'
                      ? 'bg-steal/25 text-steal ring-1 ring-steal/60'
                      : 'bg-white/12 text-ink ring-1 ring-white/25'
                    : 'text-ink-dim',
                ].join(' ')}
              >
                {option === 'spicy' ? 'Spicy' : 'Classique'}
              </button>
            );
          })}
        </div>
      ) : (
        <p
          className={`rounded-2xl border px-4 py-2.5 text-center text-sm font-bold ${
            spicy ? 'border-steal/50 bg-steal/12 text-steal' : 'border-white/12 bg-white/5 text-ink'
          }`}
        >
          {spicy ? 'Spicy' : 'Classique'}
        </p>
      )}

      <p className="mt-1.5 text-center text-[0.68rem] leading-snug text-ink-dim">{note}</p>
    </div>
  );
}

/**
 * Le rappel « c'est à toi », proposé et jamais imposé.
 *
 * La permission ne se demande qu'au tap : une application qui ouvre la boîte de
 * dialogue toute seule à l'arrivée se fait refuser une fois pour toutes.
 */
function NudgeRow() {
  const [state, setState] = useState<NudgeState>('off');

  // Lecture d'un système externe (le navigateur), donc après le montage.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setState(nudgeState()), []);

  if (state === 'unsupported') return null;

  const toggle = async () => {
    if (state === 'on') {
      disableNudge();
      setState('off');
      return;
    }
    setState(await enableNudge());
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={state === 'denied'}
        className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm active:bg-white/10 disabled:opacity-50"
      >
        <span>Me prévenir</span>
        <span>{state === 'on' ? '🔔' : '🔕'}</span>
      </button>
      {state === 'denied' && (
        <p className="px-3 pb-1 text-[0.62rem] leading-snug text-ink-faint">
          Les notifications sont bloquées pour ce site.
        </p>
      )}
    </>
  );
}

function SettingsSheet({
  code,
  muted,
  live,
  onToggleMute,
  onClose,
}: {
  code: string;
  muted: boolean;
  live: boolean;
  onToggleMute: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-end p-4" onClick={onClose}>
      <div
        className="mt-14 w-56 rounded-2xl border border-white/12 bg-felt-800/95 p-2 shadow-2xl backdrop-blur-md"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Sorti de l'écran de jeu, le code reste à un tap : c'est là qu'on le
            cherche quand quelqu'un arrive en retard. */}
        <button
          type="button"
          onClick={() => void shareGame(code)}
          className="mb-1 flex w-full items-center justify-between rounded-xl bg-white/[0.06] px-3 py-2.5 text-sm active:bg-white/10"
        >
          <span className="text-ink-dim">Code</span>
          <span className="tnum font-bold tracking-[0.2em] text-accent">{code}</span>
        </button>
        <button
          type="button"
          onClick={onToggleMute}
          className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm active:bg-white/10"
        >
          <span>Sons</span>
          <span>{muted ? '🔇' : '🔊'}</span>
        </button>
        {/* À quatre joueurs on attend trois tours : le téléphone finit par être
            posé, et ni le son ni la vibration ne le rattrapent depuis un onglet
            en arrière-plan. */}
        <NudgeRow />
        <Link
          href="/regles"
          className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm active:bg-white/10"
        >
          <span>Règles</span>
          <span>📖</span>
        </Link>
        <div className="flex items-center justify-between px-3 py-2 text-[0.68rem] text-ink-faint">
          <span>Temps réel</span>
          <span className={live ? 'text-good' : 'text-accent'}>{live ? 'connecté' : 'sondage'}</span>
        </div>
      </div>
    </div>
  );
}
