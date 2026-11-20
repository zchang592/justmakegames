import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceGame, isFinished, seatGuest, serveDish, startGame,
  stationOrder, takeOrder, trayOrder, useStation,
} from "../src/game.ts";
import { menu } from "../src/menu.ts";

const rules = {
  closeAtMs: 20_000,
  queueSize: 3,
  tableCount: 3,
  queuePatienceMs: 7_000,
  tablePatienceMs: 10_000,
  eatMs: 1_500,
  arrivals: [[0, "plum"], [1_000, "citrus"], [2_000, "plum"]],
};

test("a dish must be ordered, cooked and picked up before it can be served", () => {
  let game = startGame(rules);
  assert.equal(game.waiting[0].id, 1);
  assert.equal(useStation(game, "plum"), game);

  game = seatGuest(game, 1, 1);
  assert.equal(game.waiting.length, 0);
  assert.equal(game.tables[1].phase.kind, "order");
  assert.equal(useStation(game, "plum"), game);
  game = takeOrder(game, 1, 1);
  assert.equal(stationOrder(game, "plum").table, 1);
  game = useStation(game, "plum");
  game = advanceGame(game, menu.plum.cookMs - 1);
  assert.equal(useStation(game, "plum"), game);
  assert.equal(serveDish(game, 1, 1), game);

  game = useStation(advanceGame(game, menu.plum.cookMs), "plum");
  assert.equal(trayOrder(game).table, 1);
  assert.equal(serveDish(game, 0, 1), game);
  game = serveDish(game, 1, 1);
  assert.equal(game.served, 1);
  assert.equal(game.earnings, menu.plum.price);
  assert.equal(trayOrder(game), undefined);
  assert.equal(game.tables[1].phase.kind, "eating");
  game = advanceGame(game, menu.plum.cookMs + rules.eatMs);
  assert.equal(game.tables[1], null);
  assert.equal(game.left, 0);
});

test("a station cooks one order at a time and the tray holds one dish", () => {
  let game = advanceGame(startGame(rules), 2_000);
  for (let table = 0; table < 3; table += 1) {
    game = takeOrder(seatGuest(game, table, table + 1), table, table + 1);
  }
  game = useStation(useStation(game, "plum"), "citrus");
  assert.equal(game.tables[2].phase.kind, "ticket");
  game = advanceGame(game, 2_000 + menu.citrus.cookMs);
  game = useStation(game, "plum");
  assert.equal(trayOrder(game).guest.id, 1);
  assert.equal(useStation(game, "citrus"), game);
  assert.equal(stationOrder(game, "plum").guest.id, 3);
  game = useStation(serveDish(game, 0, 1), "citrus");
  assert.equal(trayOrder(game).guest.id, 2);
});

test("a seated guest can leave after a dish is picked up", () => {
  let game = startGame({ ...rules, arrivals: [[0, "plum"]] });
  game = useStation(takeOrder(seatGuest(game, 0, 1), 0, 1), "plum");
  game = useStation(advanceGame(game, menu.plum.cookMs), "plum");
  game = advanceGame(game, rules.tablePatienceMs);
  assert.equal(game.left, 1);
  assert.equal(game.served, 0);
  assert.equal(game.tables[0], null);
  assert.equal(trayOrder(game), undefined);
  assert.equal(serveDish(game, 0, 1), game);
});

test("queue capacity and expiration are consistent across slow frames", () => {
  const initial = startGame({ ...rules, queueSize: 1, arrivals: [[0, "plum"], [1_000, "rice"], [7_000, "citrus"]] });
  const delayed = advanceGame(initial, 7_000);
  const stepped = advanceGame(advanceGame(initial, 1_000), 7_000);
  assert.deepEqual(delayed, stepped);
  assert.equal(delayed.left, 2);
  assert.equal(delayed.waiting[0].id, 3);
  assert.equal(seatGuest(delayed, 0, 1), delayed);
});

test("closing stops arrivals and allows the last table to finish", () => {
  const brief = { ...rules, closeAtMs: 2_000, arrivals: [[0, "plum"], [2_000, "rice"]] };
  let game = takeOrder(seatGuest(startGame(brief), 0, 1), 0, 1);
  game = useStation(game, "plum");
  game = advanceGame(game, menu.plum.cookMs);
  assert.equal(game.waiting.length, 0);
  assert.equal(isFinished(game), false);
  game = serveDish(useStation(game, "plum"), 0, 1);
  assert.equal(isFinished(game), false);
  assert.equal(isFinished(advanceGame(game, menu.plum.cookMs + brief.eatMs)), true);
});
