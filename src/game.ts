import { menu } from "./menu.ts";
import type { DishId, Rules } from "./menu.ts";

interface Guest {
  readonly id: number;
  readonly dish: DishId;
  readonly leavesAtMs: number;
}

type Phase =
  | { readonly kind: "order" | "ticket" | "ready" | "carrying" }
  | { readonly kind: "cooking" | "eating"; readonly untilMs: number };

interface TableGuest extends Guest {
  readonly phase: Phase;
}

export interface TableOrder {
  readonly table: number;
  readonly guest: TableGuest;
}

export interface Game {
  readonly rules: Rules;
  readonly nowMs: number;
  readonly nextArrival: number;
  readonly waiting: readonly Guest[];
  readonly tables: readonly (TableGuest | null)[];
  readonly served: number;
  readonly left: number;
  readonly earnings: number;
}

export function startGame(rules: Rules): Game {
  return advanceGame({
    rules,
    nowMs: 0,
    nextArrival: 0,
    waiting: [],
    tables: Array.from({ length: rules.tableCount }, () => null),
    served: 0,
    left: 0,
    earnings: 0,
  }, 0);
}

export function advanceGame(game: Game, timeMs: number): Game {
  const nowMs = Math.max(timeMs, game.nowMs);
  const { rules } = game;
  let { nextArrival, waiting, left } = game;

  function expireQueue(atMs: number) {
    const remaining = waiting.filter((guest) => guest.leavesAtMs > atMs);
    left += waiting.length - remaining.length;
    waiting = remaining;
  }

  // Evaluate each arrival at its scheduled time so a delayed frame can't skip a guest.
  while (nextArrival < rules.arrivals.length) {
    const [atMs, dish] = rules.arrivals[nextArrival]!;
    if (atMs > nowMs || atMs >= rules.closeAtMs) break;

    expireQueue(atMs);
    nextArrival += 1;
    if (waiting.length < rules.queueSize) {
      waiting = [...waiting, { id: nextArrival, dish, leavesAtMs: atMs + rules.queuePatienceMs }];
    } else {
      left += 1;
    }
  }
  expireQueue(nowMs);

  const tables = game.tables.map((guest): TableGuest | null => {
    if (!guest) return null;

    const { phase } = guest;
    if (phase.kind === "eating") return phase.untilMs <= nowMs ? null : guest;
    if (guest.leavesAtMs <= nowMs) {
      left += 1;
      return null;
    }
    if (phase.kind === "cooking" && phase.untilMs <= nowMs) {
      return { ...guest, phase: { kind: "ready" } };
    }
    return guest;
  });

  return { ...game, nowMs, nextArrival, waiting, tables, left };
}

export function seatGuest(game: Game, table: number, guestId: number): Game {
  const guest = game.waiting.find((person) => person.id === guestId);
  if (!guest || game.tables[table] !== null) return game;

  const seated: TableGuest = {
    ...guest,
    leavesAtMs: game.nowMs + game.rules.tablePatienceMs,
    phase: { kind: "order" },
  };
  return {
    ...game,
    waiting: game.waiting.filter((person) => person.id !== guestId),
    tables: game.tables.with(table, seated),
  };
}

export function takeOrder(game: Game, table: number, guestId: number): Game {
  const guest = game.tables[table];
  if (guest?.id !== guestId || guest.phase.kind !== "order") return game;
  return updatePhase(game, { table, guest }, { kind: "ticket" });
}

export function stationOrder(game: Game, dish: DishId): TableOrder | undefined {
  let next: TableOrder | undefined;
  for (const [table, guest] of game.tables.entries()) {
    if (guest?.dish !== dish) continue;
    if (guest.phase.kind === "cooking" || guest.phase.kind === "ready") return { table, guest };
    if (guest.phase.kind === "ticket" && (!next || guest.id < next.guest.id)) next = { table, guest };
  }
  return next;
}

export function trayOrder(game: Game): TableOrder | undefined {
  const table = game.tables.findIndex((guest) => guest?.phase.kind === "carrying");
  const guest = game.tables[table];
  return guest ? { table, guest } : undefined;
}

function updatePhase(game: Game, order: TableOrder, phase: Phase): Game {
  return { ...game, tables: game.tables.with(order.table, { ...order.guest, phase }) };
}

export function useStation(game: Game, dish: DishId): Game {
  const order = stationOrder(game, dish);
  if (!order) return game;

  if (order.guest.phase.kind === "ticket") {
    return updatePhase(game, order, { kind: "cooking", untilMs: game.nowMs + menu[dish].cookMs });
  }
  if (order.guest.phase.kind === "ready" && !trayOrder(game)) {
    return updatePhase(game, order, { kind: "carrying" });
  }
  return game;
}

export function serveDish(game: Game, table: number, guestId: number): Game {
  const guest = game.tables[table];
  if (guest?.id !== guestId || guest.phase.kind !== "carrying") return game;

  return {
    ...updatePhase(game, { table, guest }, { kind: "eating", untilMs: game.nowMs + game.rules.eatMs }),
    served: game.served + 1,
    earnings: game.earnings + menu[guest.dish].price,
  };
}

export function isFinished(game: Game): boolean {
  return game.nowMs >= game.rules.closeAtMs && game.waiting.length === 0 && game.tables.every((guest) => !guest);
}
