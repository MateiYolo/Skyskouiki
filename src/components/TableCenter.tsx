'use client';

import { AnimatePresence, motion } from 'motion/react';
import { memo } from 'react';
import { PlayingCard } from './PlayingCard';
import { DISCARD_PILE, DRAW_PILE, HAND } from '@/lib/client/flights';
import { FLIGHT_DURATION, MOVE, SETTLE } from '@/lib/client/motion';
import { STEAL_CARD, type PileCard, type ValueCard } from '@/lib/skyjo';

/**
 * Le milieu de la table : la consigne, les deux piles, et la carte en main.
 *
 * Sa place n'est pas décorative. Les piles sont posées **entre les deux
 * grilles** — celle d'en face au-dessus, la mienne en dessous — si bien que
 * chaque carte qui bouge traverse le terrain dans une direction qui dit à qui
 * elle appartient : elle monte vers l'adversaire, elle descend vers moi. C'est
 * ce qui rend un coup compréhensible sans le lire ; en bas de l'écran, les deux
 * trajets partaient du même coin et se ressemblaient.
 *
 * Le pouce n'y perd rien : les cibles les plus fréquentes restent la grille du
 * bas, et le milieu d'un téléphone s'atteint aussi bien que son pied.
 *
 * Reste la stabilité : chaque emplacement a une hauteur fixe, occupé ou non.
 * Prendre une carte ne doit pas pousser la grille sous le doigt qui vise déjà
 * la case suivante.
 */

/**
 * L'état « dernier tour », tant qu'il dure.
 *
 * Ce n'est pas un événement de plus : c'est la seule information de la manche
 * qui change ce qu'on a le droit de faire — on ne retourne plus une carte pour
 * voir, on descend son total ou on le paie. L'annonce qui passait au moment de
 * la fermeture ne suffisait donc pas : celui qui regardait ailleurs deux
 * secondes jouait son dernier coup sans savoir que c'était le dernier.
 */
export interface LastTurn {
  /** Qui a fermé, et ce qu'il reste à faire — une ligne, en clair. */
  note: string;
  /** C'est moi qui ai fermé : je ne joue plus, je regarde et je compte. */
  closedByMe: boolean;
}

export interface TableCenterProps {
  title: string;
  hint: string;
  emphasis: boolean;
  /** Non nul dès qu'un joueur a fermé la manche. */
  lastTurn: LastTurn | null;
  drawPileCount: number;
  discardTop: ValueCard | null;
  /** Déjà filtrée par le serveur : `null` quand le porteur seul a le droit de la voir. */
  heldCard: ValueCard | null;
  heldFrom: 'draw' | 'discard' | null;
  /**
   * Un Vol est en jeu : son porteur choisit son échange.
   *
   * Le moteur ne le met pas « en main » — un Vol n'a pas de valeur à tenir —
   * mais l'emplacement du milieu est exactement là que ça se joue, et laisser
   * le créneau vide pendant qu'on choisit sa cible donnerait l'impression que
   * la pioche n'a rien donné.
   */
  stealing: boolean;
  /** Ce que fait l'adversaire quand c'est lui qui tient la carte. */
  heldNote: string | null;
  /** À qui est la carte posée au milieu. */
  holder: { name: string; emoji: string; isMe: boolean } | null;
  /** Pile où la dernière carte a été prise : elle s'allume au passage. */
  drewFrom: 'draw' | 'discard' | null;
  /** Version de la partie : rallume la pile à chaque nouvelle prise. */
  echoKey: number;
  canDraw: boolean;
  canTakeDiscard: boolean;
  canDiscardHeld: boolean;
  /** C'est à moi de résoudre un Vol : je peux y renoncer, au prix d'un retournement. */
  canDecline: boolean;
  onDraw: () => void;
  onTakeDiscard: () => void;
  onDiscardHeld: () => void;
  onDecline: () => void;
}

/**
 * La pile où quelqu'un vient de prendre une carte s'allume une fois.
 *
 * Sans ça, la prise d'un adversaire n'a pas de point de départ visible : la
 * carte apparaît au milieu sans qu'on ait vu d'où elle sort, et savoir s'il a
 * pioché à l'aveugle ou récupéré la défausse change tout ce qu'on en déduit.
 */
function TakenFlash() {
  return (
    <motion.span
      className="pointer-events-none absolute -inset-[3px] z-10 rounded-lg"
      style={{ boxShadow: '0 0 0 2px var(--color-accent), 0 0 18px rgb(255 204 77 / 0.55)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 1, 0] }}
      transition={{ duration: 1.1, times: [0, 0.1, 0.5, 1], ease: 'linear' }}
    />
  );
}

function PileLabel({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      className={`whitespace-nowrap text-[0.6rem] font-semibold uppercase tracking-[0.14em] ${
        accent ? 'text-accent' : 'text-ink-faint'
      }`}
    >
      {children}
    </span>
  );
}

/** Mémoïsé pour la même raison que `MyBoard` : trois cartes et une consigne
 *  n'ont pas à se redessiner parce qu'un message d'erreur vient de disparaître. */
export const TableCenter = memo(function TableCenter({
  title,
  hint,
  emphasis,
  lastTurn,
  drawPileCount,
  discardTop,
  heldCard,
  heldFrom,
  stealing,
  heldNote,
  holder,
  drewFrom,
  echoKey,
  canDraw,
  canTakeDiscard,
  canDiscardHeld,
  canDecline,
  onDraw,
  onTakeDiscard,
  onDiscardHeld,
  onDecline,
}: TableCenterProps) {
  const holding = heldFrom !== null || stealing;
  /**
   * Jeter, c'est poser la carte sur la défausse — alors on rend la défausse
   * elle-même touchable. C'est le geste de la vraie table, et la cible fait la
   * taille d'une carte au lieu d'une pastille de dix pixels. Le petit bouton
   * « Jeter » reste à côté pour qui cherche un mot plutôt qu'un endroit.
   */
  const throwHere = canDiscardHeld;
  // La carte en main est publique, d'où qu'elle vienne (règle maison) : c'est
  // elle qui explique pourquoi l'adversaire pose ici plutôt que là. Elle reste
  // face cachée le temps d'un aller-retour quand c'est moi qui viens de
  // piocher — le serveur ne me l'a pas encore dite.
  const heldVisible = stealing || heldCard !== null;
  /**
   * Pendant un Vol, les deux piles se taisent.
   *
   * Ni l'une ni l'autre n'est jouable à cet instant, et « Renoncer » est un mot
   * plus large que l'emplacement de la carte en main : le bouton passait
   * par-dessus « pioche » et « défausse ». Les faire taire ne cache aucune
   * information — elles sont déjà grisées — et dit ce qui est vrai : la
   * décision ne se joue pas là.
   */
  const quietPiles = stealing;
  // Le Vol occupe le créneau de la carte en main : c'est la même place dans le
  // tour, et la même question — qu'est-ce que celui qui l'a pioché va en faire.
  const heldShown: PileCard | null = stealing ? STEAL_CARD : heldCard;

  return (
    // Un bandeau bordé sur ses deux faces : le terrain commun se voit, et on
    // sait de part et d'autre à qui appartient chaque moitié de l'écran.
    <div className="shrink-0 border-y border-white/8 bg-white/[0.03] px-4 py-1">
      {/* Le compte à rebours de la manche, posé au-dessus de la consigne : c'est
          le seul bandeau de l'écran qui reste tant que son état dure. Il ne
          clignote pas — un état ne bat pas — mais il est rouge et il est là à
          chaque coup d'œil, ce qu'une annonce de deux secondes ne peut pas être. */}
      <AnimatePresence initial={false}>
        {lastTurn && (
          <motion.div
            className="mb-1 flex items-center justify-center gap-2 rounded-lg border border-danger/55 bg-danger/15 px-2.5 py-1"
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: '0.25rem' }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={SETTLE}
          >
            <span className="shrink-0 text-[0.62rem] font-black uppercase tracking-[0.16em] text-danger">
              {lastTurn.closedByMe ? 'tu as fermé' : 'dernier tour'}
            </span>
            <span className="truncate text-[0.64rem] font-medium leading-tight text-ink-dim">
              {lastTurn.note}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Consigne : deux lignes réservées, pour que rien ne saute d'un tour à l'autre. */}
      <div className="mb-1.5 flex h-[2.1rem] flex-col justify-center text-center">
        <motion.div
          key={title}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className={`text-[0.9rem] font-bold leading-tight ${emphasis ? 'text-accent' : 'text-ink-dim'}`}
        >
          {title}
        </motion.div>
        <div className="text-[0.68rem] leading-tight text-ink-faint">{heldNote ?? hint}</div>
      </div>

      <div className="flex items-end justify-center gap-4">
        {/* Pioche. Le nombre de cartes restantes n'y figure pas : il ne change
            aucune décision — la pioche se reconstitue quand elle s'épuise. */}
        <div className="flex w-[3.1rem] flex-col items-center gap-1" data-testid="draw-pile">
          {/* Une pile hors d'atteinte s'efface : on ne la confond pas avec un bouton. */}
          <div
            data-anchor={DRAW_PILE}
            className={`relative w-full ${canDraw ? '' : holding ? 'opacity-35' : 'opacity-60'}`}
          >
            {/* Épaisseur du paquet : deux dos décalés sous le premier. */}
            <div className="pointer-events-none absolute inset-0 translate-x-[3px] translate-y-[3px] rounded-lg bg-black/40" />
            <div className="pointer-events-none absolute inset-0 translate-x-[1.5px] translate-y-[1.5px] rounded-lg bg-black/30" />
            <PlayingCard
              value={null}
              faceUp={false}
              size="md"
              intent={canDraw ? 'target' : 'none'}
              dimmed={drawPileCount === 0}
              onClick={canDraw ? onDraw : undefined}
              aria-label="Piocher"
            />
            {drewFrom === 'draw' && <TakenFlash key={echoKey} />}
          </div>
          <PileLabel>{quietPiles ? ' ' : 'pioche'}</PileLabel>
        </div>

        {/* Carte en main : emplacement toujours présent, rempli ou non. Il
            penche vers celui qui la tient — vers le haut quand elle est à
            l'adversaire, vers le bas quand elle est à moi — et porte son nom.
            Posée à plat au milieu, elle n'appartenait visiblement à personne. */}
        <motion.div
          className="flex w-[3.7rem] flex-col items-center gap-1"
          animate={{ y: holder ? (holder.isMe ? 4 : -6) : 0 }}
          transition={MOVE}
        >
          <div data-anchor={HAND} className="relative aspect-[3/4] w-full">
            {/* La carte en main n'apparaît qu'à l'instant où celle qui vole
                jusqu'ici se pose (cf. `FlightLayer`). Sinon on la voit déjà
                dans la main pendant qu'un deuxième exemplaire traverse encore
                l'écran pour l'y apporter — deux fois la même carte, dont l'une
                attend l'autre. Le départ, lui, est immédiat : c'est le vol qui
                l'emporte. */}
            <AnimatePresence>
              {holding ? (
                <motion.div
                  key="held"
                  className="absolute inset-0"
                  initial={{ opacity: 0 }}
                  animate={{
                    opacity: 1,
                    transition: { duration: 0.1, delay: Math.max(0, FLIGHT_DURATION - 0.05) },
                  }}
                  exit={{ y: -6, opacity: 0, transition: MOVE }}
                  style={{ filter: 'drop-shadow(0 8px 20px rgb(0 0 0 / 0.6))' }}
                >
                  <PlayingCard
                    value={heldShown}
                    faceUp={heldVisible}
                    size="lg"
                    aria-label={
                      stealing
                        ? 'Carte Vol : échange une de tes cartes avec un adversaire'
                        : heldVisible
                          ? `Carte en main : ${heldCard}`
                          : 'Carte en main, face cachée'
                    }
                  />
                </motion.div>
              ) : (
                <div className="absolute inset-0 grid place-items-center rounded-xl border border-dashed border-white/10">
                  <span className="text-[0.55rem] uppercase tracking-widest text-ink-faint">
                    en main
                  </span>
                </div>
              )}
            </AnimatePresence>
          </div>

          {/* Hauteur réservée en toutes circonstances : le bouton apparaît sans
              pousser les piles sous le doigt qui vise déjà. */}
          <div className="flex h-[1.5rem] items-center">
            {canDiscardHeld ? (
              <button
                type="button"
                onClick={onDiscardHeld}
                className="rounded-full border border-white/25 bg-white/12 px-3.5 py-1 text-[0.66rem] font-bold uppercase tracking-wide text-ink active:scale-95"
              >
                Jeter
              </button>
            ) : canDecline ? (
              // Renoncer coûte un retournement : le bouton le dit, sinon le
              // joueur découvre le prix après avoir appuyé.
              <button
                type="button"
                onClick={onDecline}
                className="rounded-full border border-white/25 bg-white/12 px-3.5 py-1 text-[0.66rem] font-bold uppercase tracking-wide text-ink active:scale-95"
              >
                Renoncer
              </button>
            ) : holder && !holder.isMe ? (
              <span className="flex max-w-full items-center gap-1 whitespace-nowrap text-[0.62rem] font-bold text-accent">
                <span aria-hidden>{holder.emoji}</span>
                <span className="truncate">{holder.name}</span>
              </span>
            ) : (
              <PileLabel>{holding ? 'à placer' : ' '}</PileLabel>
            )}
          </div>
        </motion.div>

        {/* Défausse */}
        <div className="flex w-[3.1rem] flex-col items-center gap-1" data-testid="discard-pile">
          <div
            data-anchor={DISCARD_PILE}
            className={`relative w-full ${
              canTakeDiscard || throwHere ? '' : holding ? 'opacity-50' : 'opacity-60'
            }`}
          >
            {discardTop === null ? (
              throwHere ? (
                <button
                  type="button"
                  onClick={onDiscardHeld}
                  aria-label="Jeter la carte en main"
                  className="is-target grid aspect-[3/4] w-full place-items-center rounded-lg border-2 border-dashed border-accent/70 text-lg text-accent active:scale-95"
                >
                  ↓
                </button>
              ) : (
                <div className="aspect-[3/4] w-full rounded-lg border border-dashed border-white/12" />
              )
            ) : (
              <PlayingCard
                value={discardTop}
                faceUp
                size="md"
                intent={canTakeDiscard || throwHere ? 'target' : 'none'}
                onClick={canTakeDiscard ? onTakeDiscard : throwHere ? onDiscardHeld : undefined}
                aria-label={
                  throwHere
                    ? 'Jeter la carte en main sur la défausse'
                    : `Prendre la défausse — ${discardTop}`
                }
              />
            )}
            {drewFrom === 'discard' && <TakenFlash key={echoKey} />}
          </div>
          <PileLabel accent={throwHere}>
            {quietPiles ? ' ' : throwHere ? 'jeter ici' : 'défausse'}
          </PileLabel>
        </div>
      </div>
    </div>
  );
})
