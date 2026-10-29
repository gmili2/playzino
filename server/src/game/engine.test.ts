import { describe, expect, it } from 'vitest';
import {
  absSquare, activeColors, applyMove, applyRoll, autoMovePawn, botChooseMove, createGame, currentColor, eliminate, GameState, GOAL,
  legalMoves, NEST, RuleError, START, turnOrder
} from './engine.js';

const two = () => createGame(['blue', 'yellow']);

/** Place les pions directement (positions relatives à chaque couleur). */
function setup(pawns: Partial<Record<'blue' | 'yellow', number[]>>, turn = 0): GameState {
  const s = two();
  if (pawns.blue) s.pawns.blue = pawns.blue;
  if (pawns.yellow) s.pawns.yellow = pawns.yellow;
  s.turn = turn;
  return s;
}

/** Position relative de `color` qui tombe sur la case absolue `abs`. */
const relFor = (color: 'blue' | 'yellow', abs: number) => (abs - START[color] + 68) % 68;

describe('création', () => {
  it('démarre avec 4 pions au nid par joueur et le premier joueur au lancer', () => {
    const s = two();
    expect(s.pawns.blue).toEqual([NEST, NEST, NEST, NEST]);
    expect(s.pawns.yellow).toEqual([NEST, NEST, NEST, NEST]);
    expect(s.phase).toBe('roll');
    expect(currentColor(s)).toBe('blue');
  });

  it('refuse des couleurs invalides', () => {
    expect(() => createGame(['blue'])).toThrow(RuleError);
    expect(() => createGame(['blue', 'blue'])).toThrow(RuleError);
  });

  it('les cases de sortie correspondent au plateau', () => {
    expect(absSquare('blue', 0)).toBe(55);
    expect(absSquare('yellow', 0)).toBe(21);
    expect(absSquare('blue', 13)).toBe(0);
  });
});

describe('lancer et sortie', () => {
  it('sans pion sorti, un dé autre que 5 passe la main', () => {
    const { state, events } = applyRoll(two(), 3);
    expect(events.map((e) => e.type)).toEqual(['roll', 'no_move', 'turn']);
    expect(currentColor(state)).toBe('yellow');
    expect(state.phase).toBe('roll');
  });

  it('un 5 sort un pion sur la case de sortie', () => {
    const r = applyRoll(two(), 5);
    expect(r.state.phase).toBe('move');
    expect(legalMoves(r.state).every((m) => m.from === NEST && m.to === 0)).toBe(true);
    const m = applyMove(r.state, 2);
    expect(m.state.pawns.blue[2]).toBe(0);
    expect(m.events[0]).toEqual({ type: 'exit', color: 'blue', pawn: 2 });
    expect(currentColor(m.state)).toBe('yellow');
  });

  it('avec un 5, sortir est obligatoire si possible', () => {
    const s = applyRoll(setup({ blue: [10, NEST, NEST, NEST] }), 5).state;
    const moves = legalMoves(s);
    expect(moves.length).toBe(3);
    expect(moves.every((m) => m.from === NEST)).toBe(true);
    expect(() => applyMove(s, 0)).toThrow(RuleError);
  });

  it('on ne sort pas sur sa case de sortie occupée par deux de ses pions', () => {
    const s = applyRoll(setup({ blue: [0, 0, 7, NEST] }), 5).state;
    const moves = legalMoves(s);
    // Aucune sortie possible : le 5 se joue normalement (y compris pour quitter le barrage).
    expect(moves.some((m) => m.from === NEST)).toBe(false);
    expect(moves.map((m) => m.pawn).sort()).toEqual([0, 1, 2]);
  });

  it('sortir sur une case de sortie avec deux pions dont un adverse capture le dernier arrivé', () => {
    const s = setup({ blue: [0, 30, 40, NEST], yellow: [relFor('yellow', START.blue), 1, 2, 3] });
    s.stamps.blue[0] = 1;
    s.stamps.yellow[0] = 5;
    const r = applyRoll(s, 5);
    const m = applyMove(r.state, 3);
    expect(m.state.pawns.yellow[0]).toBe(NEST);
    expect(m.events.some((e) => e.type === 'capture')).toBe(true);
    // Capture → bonus de 20 à jouer.
    expect(m.state.phase).toBe('bonus');
    expect(m.state.moveValue).toBe(20);
  });

  it('refuse un lancer hors phase et une valeur invalide', () => {
    const s = applyRoll(two(), 5).state;
    expect(() => applyRoll(s, 3)).toThrow(RuleError);
    expect(() => applyRoll(two(), 0)).toThrow(RuleError);
    expect(() => applyRoll(two(), 7)).toThrow(RuleError);
    expect(() => applyRoll(two(), 2.5)).toThrow(RuleError);
  });
});

describe('déplacements', () => {
  it('avance un pion du nombre de cases du dé', () => {
    const s = applyRoll(setup({ blue: [10, NEST, NEST, NEST] }), 4).state;
    const m = applyMove(s, 0);
    expect(m.state.pawns.blue[0]).toBe(14);
  });

  it('refuse le déplacement d’un pion au nid ou d’un pion inexistant', () => {
    const s = applyRoll(setup({ blue: [10, NEST, NEST, NEST] }), 4).state;
    expect(() => applyMove(s, 1)).toThrow(RuleError);
    expect(() => applyMove(s, 9)).toThrow(RuleError);
  });

  it('refuse de jouer avant de lancer', () => {
    expect(() => applyMove(setup({ blue: [10, NEST, NEST, NEST] }), 0)).toThrow(RuleError);
  });

  it('un 6 donne un lancer supplémentaire', () => {
    const s = applyRoll(setup({ blue: [10, NEST, NEST, NEST] }), 6).state;
    expect(s.moveValue).toBe(6);
    const m = applyMove(s, 0);
    expect(currentColor(m.state)).toBe('blue');
    expect(m.state.phase).toBe('roll');
    expect(m.events.some((e) => e.type === 'extra_turn')).toBe(true);
  });

  it('un 6 vaut 7 quand aucun pion n’est au nid', () => {
    const s = applyRoll(setup({ blue: [10, 20, 30, 40] }), 6).state;
    expect(s.moveValue).toBe(7);
    expect(applyMove(s, 0).state.pawns.blue[0]).toBe(17);
  });

  it('entre dans le couloir final après la case 55', () => {
    const s = applyRoll(setup({ blue: [53, NEST, NEST, NEST] }), 4).state;
    expect(applyMove(s, 0).state.pawns.blue[0]).toBe(57);
  });

  it('il faut le compte exact pour arriver au centre', () => {
    const s = applyRoll(setup({ blue: [60, NEST, NEST, NEST] }), 4).state;
    expect(legalMoves(s)).toEqual([]);
    expect(currentColor(s)).toBe('yellow');
  });
});

describe('captures et cases sûres', () => {
  it('capturer un pion adverse sur une case normale le renvoie au nid et donne 20 cases', () => {
    // Bleu en 10 (abs 65), jaune sur abs 68→ abs (65+3)%68 = 0.
    const yellowRel = relFor('yellow', absSquare('blue', 13));
    const s = applyRoll(setup({ blue: [10, 30, NEST, NEST], yellow: [yellowRel, NEST, NEST, NEST] }), 3).state;
    const m = applyMove(s, 0);
    expect(m.state.pawns.yellow[0]).toBe(NEST);
    expect(m.state.phase).toBe('bonus');
    expect(m.state.moveValue).toBe(20);
    const b = applyMove(m.state, 1);
    expect(b.state.pawns.blue[1]).toBe(50);
    expect(currentColor(b.state)).toBe('yellow');
  });

  it('pas de capture sur une case sûre : les deux pions cohabitent', () => {
    // abs 11 est une case sûre.
    const blueRel = relFor('blue', 11);
    const yellowRel = relFor('yellow', 11);
    const s = applyRoll(setup({ blue: [blueRel - 2, NEST, NEST, NEST], yellow: [yellowRel, NEST, NEST, NEST] }), 2).state;
    const m = applyMove(s, 0);
    expect(m.state.pawns.yellow[0]).toBe(yellowRel);
    expect(m.events.some((e) => e.type === 'capture')).toBe(false);
  });

  it('un bonus sans coup possible est perdu', () => {
    const yellowRel = relFor('yellow', absSquare('blue', 13));
    const s = applyRoll(setup({ blue: [10, NEST, NEST, NEST], yellow: [yellowRel, NEST, NEST, NEST] }), 3).state;
    // Le seul pion sorti est en 13 : 13 + 20 = 33, possible. On le met trop loin pour tester la perte.
    s.pawns.blue[0] = 40;
    const yellow2 = relFor('yellow', absSquare('blue', 43));
    s.pawns.yellow[0] = yellow2;
    const m = applyMove(s, 0); // 40 → 43 capture ; 43 + 20 = 63 → arrivée exacte, donc jouable
    expect(m.state.phase).toBe('bonus');
    const s2 = applyRoll(setup({ blue: [42, NEST, NEST, NEST], yellow: [relFor('yellow', absSquare('blue', 45)), NEST, NEST, NEST] }), 3).state;
    // abs de 45 pour bleu = (55+45)%68 = 32 : pas sûre → capture puis 45+20 = 65 > 63 : bonus perdu.
    const m2 = applyMove(s2, 0);
    expect(m2.events.some((e) => e.type === 'bonus_lost')).toBe(true);
    expect(currentColor(m2.state)).toBe('yellow');
  });
});

describe('barrages', () => {
  it('un barrage adverse ne peut pas être franchi', () => {
    const wall = relFor('yellow', absSquare('blue', 12));
    const s = applyRoll(setup({ blue: [10, NEST, NEST, NEST], yellow: [wall, wall, NEST, NEST] }), 4).state;
    expect(legalMoves(s)).toEqual([]);
  });

  it('on ne peut pas poser un troisième pion sur une case', () => {
    const s = applyRoll(setup({ blue: [10, 14, 14, NEST] }), 4).state;
    expect(legalMoves(s).map((m) => m.pawn)).not.toContain(0);
  });

  it('deux pions de la même couleur forment un barrage, que le 6 oblige à ouvrir', () => {
    const s = applyRoll(setup({ blue: [14, 14, 30, NEST] }), 6).state;
    const pawns = legalMoves(s).map((m) => m.pawn).sort();
    expect(pawns).toEqual([0, 1]);
  });
});

describe('trois 6 consécutifs', () => {
  it('renvoient au nid le dernier pion déplacé et passent la main', () => {
    let s = setup({ blue: [10, 20, NEST, NEST] });
    s = applyMove(applyRoll(s, 6).state, 0).state;
    s = applyMove(applyRoll(s, 6).state, 0).state;
    expect(s.pawns.blue[0]).toBe(22);
    const r = applyRoll(s, 6);
    expect(r.state.pawns.blue[0]).toBe(NEST);
    expect(r.events.some((e) => e.type === 'three_sixes')).toBe(true);
    expect(currentColor(r.state)).toBe('yellow');
  });
});

describe('arrivée et victoire', () => {
  it('arriver au centre donne 10 cases de bonus', () => {
    const s = applyRoll(setup({ blue: [60, 20, NEST, NEST] }), 3).state;
    const m = applyMove(s, 0);
    expect(m.state.pawns.blue[0]).toBe(GOAL);
    expect(m.state.phase).toBe('bonus');
    expect(m.state.moveValue).toBe(10);
  });

  it('le quatrième pion au centre termine la partie', () => {
    const s = applyRoll(setup({ blue: [GOAL, GOAL, GOAL, 60] }), 3).state;
    const m = applyMove(s, 3);
    expect(m.state.phase).toBe('finished');
    expect(m.state.winner).toBe('blue');
    expect(() => applyRoll(m.state, 2)).toThrow(RuleError);
  });

  it('l’état d’origine n’est jamais modifié', () => {
    const s = setup({ blue: [10, NEST, NEST, NEST] });
    const before = JSON.stringify(s);
    applyMove(applyRoll(s, 4).state, 0);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('partie complète simulée', () => {
  it('termine toujours avec un vainqueur (dés pseudo-aléatoires, coups automatiques)', () => {
    for (let seed = 1; seed <= 40; seed++) {
      let x = seed;
      const rnd = () => ((x = (x * 1103515245 + 12345) % 2147483648) % 6) + 1;
      let s = two();
      let actions = 0;
      while (s.phase !== 'finished' && actions < 20000) {
        if (s.phase === 'roll') s = applyRoll(s, rnd()).state;
        else s = applyMove(s, autoMovePawn(s)!).state;
        actions++;
      }
      expect(s.phase).toBe('finished');
      expect(s.pawns[s.winner!].every((p) => p === GOAL)).toBe(true);
    }
  });
});

describe('3 et 4 joueurs', () => {
  const four = () => createGame(turnOrder(['blue', 'yellow', 'red', 'green']));

  it('l’ordre de jeu suit le sens de la piste', () => {
    expect(turnOrder(['blue', 'yellow', 'red', 'green'])).toEqual(['red', 'yellow', 'green', 'blue']);
    expect(turnOrder(['blue', 'yellow', 'red'])).toEqual(['red', 'yellow', 'blue']);
  });

  it('le tour passe à chaque joueur à tour de rôle', () => {
    let s = four();
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      seen.push(currentColor(s));
      s = applyRoll(s, 3).state; // aucun pion sorti : le tour passe
    }
    expect(seen).toEqual(['red', 'yellow', 'green', 'blue']);
    expect(currentColor(s)).toBe('red');
  });

  it('un joueur éliminé est sauté et ses pions quittent le plateau', () => {
    let s = four();
    s.pawns.yellow = [10, 20, NEST, NEST];
    const r = eliminate(s, 'yellow');
    expect(r.state.pawns.yellow).toEqual([NEST, NEST, NEST, NEST]);
    expect(activeColors(r.state)).toEqual(['red', 'green', 'blue']);
    s = applyRoll(r.state, 3).state; // rouge passe
    expect(currentColor(s)).toBe('green');
  });

  it('éliminer le joueur dont c’est le tour passe la main', () => {
    const s = applyRoll(createGame(['red', 'yellow', 'green']), 5).state; // rouge doit sortir un pion
    const r = eliminate(s, 'red');
    expect(currentColor(r.state)).toBe('yellow');
    expect(r.state.phase).toBe('roll');
  });

  it('le dernier joueur restant gagne', () => {
    let s = createGame(['red', 'yellow', 'blue']);
    s = eliminate(s, 'red').state;
    expect(s.phase).toBe('roll');
    const r = eliminate(s, 'blue');
    expect(r.state.phase).toBe('finished');
    expect(r.state.winner).toBe('yellow');
    expect(r.events.some((e) => e.type === 'win')).toBe(true);
  });

  it('un état sauvegardé avant la gestion des éliminations reste jouable', () => {
    const s = createGame(['blue', 'yellow']);
    delete s.out;
    expect(currentColor(applyRoll(s, 3).state)).toBe('yellow');
  });

  it('parties complètes à 3 et 4 joueurs : toujours un vainqueur', () => {
    for (const n of [3, 4]) {
      for (let seed = 1; seed <= 20; seed++) {
        let x = seed * 7919;
        const rnd = () => ((x = (x * 1103515245 + 12345) % 2147483648) % 6) + 1;
        let s = createGame(turnOrder((['blue', 'yellow', 'red', 'green'] as const).slice(0, n) as never));
        let actions = 0;
        while (s.phase !== 'finished' && actions < 40000) {
          s = s.phase === 'roll' ? applyRoll(s, rnd()).state : applyMove(s, autoMovePawn(s)!).state;
          actions++;
        }
        expect(s.phase).toBe('finished');
        expect(s.pawns[s.winner!].every((p) => p === GOAL)).toBe(true);
      }
    }
  });
});

describe('robot', () => {
  const rel = (color: 'blue' | 'yellow', abs: number) => (abs - START[color] + 68) % 68;

  it('préfère arriver au centre', () => {
    const s = applyRoll(setup({ blue: [60, 10, NEST, NEST] }), 3).state;
    expect(botChooseMove(s)).toBe(0);
  });

  it('préfère capturer un pion adverse', () => {
    const victim = rel('yellow', absSquare('blue', 13));
    const s = applyRoll(setup({ blue: [10, 30, NEST, NEST], yellow: [victim, NEST, NEST, NEST] }), 3).state;
    expect(botChooseMove(s)).toBe(0);
  });

  it('évite de s’arrêter juste devant un pion adverse', () => {
    // Pion 0 : 40 → 42 (abs 29), avec un jaune 3 cases derrière (abs 26) ; pion 1 : 30 → 32 (abs 19), sans danger.
    const chaser = rel('yellow', 26);
    const s = applyRoll(setup({ blue: [40, 30, NEST, NEST], yellow: [chaser, NEST, NEST, NEST] }), 2).state;
    expect(botChooseMove(s)).toBe(1);
  });

  it('ne renvoie que des coups légaux, jusqu’à la fin d’une partie entre robots', () => {
    let x = 4242;
    const rnd = () => ((x = (x * 1103515245 + 12345) % 2147483648) % 6) + 1;
    let s = createGame(turnOrder(['blue', 'yellow', 'red', 'green']));
    let n = 0;
    while (s.phase !== 'finished' && n++ < 40000) {
      if (s.phase === 'roll') s = applyRoll(s, rnd()).state;
      else {
        const pawn = botChooseMove(s);
        expect(legalMoves(s).some((m) => m.pawn === pawn)).toBe(true);
        s = applyMove(s, pawn!).state;
      }
    }
    expect(s.phase).toBe('finished');
  });
});
