import {
  advanceGame,
  isFinished,
  seatGuest,
  serveDish,
  startGame,
  stationOrder,
  takeOrder,
  trayOrder,
  useStation,
} from "./game.ts";
import type { Game } from "./game.ts";
import { dishIds, menu, shiftRules } from "./menu.ts";

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function elementFrom(template: string): HTMLButtonElement {
  return byId<HTMLTemplateElement>(template).content.firstElementChild!.cloneNode(true) as HTMLButtonElement;
}

function setText(element: Element, text: string) {
  if (element.textContent !== text) element.textContent = text;
}

function seconds(ms: number): number {
  return Math.max(0, Math.ceil(ms / 1_000));
}

function clockText(ms: number): string {
  const total = seconds(ms);
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

const roomControls = byId("room-controls");
const kitchenControls = byId("kitchen-controls");
const waiter = byId("waiter");
const heldIcon = byId("held-icon");
const clock = byId("clock");
const served = byId("served");
const left = byId("left");
const earnings = byId("earnings");
const hint = byId("hint");
const queueCount = byId("queue-count");
const shiftLabel = byId("shift-label");
const tray = byId("tray");
const trayIcon = byId("tray-icon");
const trayLabel = byId("tray-label");
const overlay = byId("overlay");
const overlayTitle = byId("overlay-title");
const overlayDescription = byId("overlay-description");
const steps = byId("steps");
const pauseButton = byId<HTMLButtonElement>("pause");
const pauseLabel = byId("pause-label");
const playButton = byId<HTMLButtonElement>("play");
const restartButton = byId<HTMLButtonElement>("restart");

const tableLabels = {
  order: "待接单",
  ticket: "待制作",
  cooking: "制作中",
  ready: "待取餐",
  carrying: "可上菜",
  eating: "用餐中",
};

type Mode = "opening" | "running" | "paused" | "finished";
let mode: Mode = "opening";
let game: Game | null = null;
let selectedGuest: number | null = null;
let lastTick = performance.now();
let notice: { text: string; untilMs: number } | null = null;

const queueSlots = byId("queue-slots");
const queueViews = Array.from({ length: shiftRules.queueSize }, (_, index) => {
  const button = elementFrom("queue-template");
  queueSlots.append(button);
  button.addEventListener("click", () => {
    const guest = game?.waiting[index];
    interact((current) => {
      if (!guest || !current.waiting.some((person) => person.id === guest.id)) return;
      if (selectedGuest === guest.id) {
        selectedGuest = null;
      } else if (current.tables.includes(null)) {
        selectedGuest = guest.id;
        notice = null;
        waiter.dataset.spot = "queue";
      } else {
        tell(current, "餐桌坐满了，先处理已经入座的订单。");
      }
    });
  });

  return {
    button,
    person: button.querySelector<HTMLElement>(".person")!,
    name: button.querySelector(".queue-name")!,
    patience: button.querySelector("progress")!,
  };
});

const tableSlots = byId("tables");
const tableViews = Array.from({ length: shiftRules.tableCount }, (_, index) => {
  const button = elementFrom("table-template");
  const label = `${index + 1} 号桌`;
  button.dataset.table = String(index);
  setText(button.querySelector(".table-name")!, label);
  tableSlots.append(button);
  button.addEventListener("click", () => {
    const guestId = game?.tables[index]?.id;
    interact((current) => useTable(current, index, guestId));
  });

  return {
    button,
    label,
    person: button.querySelector<HTMLElement>(".person")!,
    bubble: button.querySelector<HTMLElement>(".bubble")!,
    icon: button.querySelector(".order-icon")!,
    dishName: button.querySelector(".order-name")!,
    phase: button.querySelector(".table-phase")!,
    patience: button.querySelector("progress")!,
  };
});

const stations = byId("stations");
const stationViews = dishIds.map((dish) => {
  const button = elementFrom("station-template");
  button.dataset.dish = dish;
  setText(button.querySelector(".dish-icon")!, menu[dish].icon);
  setText(button.querySelector(".dish-name")!, menu[dish].name);
  stations.append(button);
  button.addEventListener("click", () => interact((current) => {
    const station = stationOrder(current, dish);
    const next = useStation(current, dish);
    if (next !== current) {
      game = next;
      notice = null;
      waiter.dataset.spot = "kitchen";
    } else if (station?.guest.phase.kind === "ready") {
      tell(current, "托盘上还有一份，先送到对应的餐桌。");
    } else if (!station) {
      tell(current, `还没有${menu[dish].name}的订单，等客人入座后先接单。`);
    }
  }));

  return { dish, button, meta: button.querySelector(".station-meta")!, meter: button.querySelector<HTMLElement>(".meter")! };
});

function tell(current: Game, text: string) {
  notice = { text, untilMs: current.nowMs + 2_600 };
}

function useTable(current: Game, index: number, guestId: number | undefined) {
  const guest = current.tables[index];
  if (guest && guest.id !== guestId) return;

  let next = current;
  if (!guest) {
    if (selectedGuest === null) {
      tell(current, "先点一位等位客人，再点空桌。");
      return;
    }
    next = seatGuest(current, index, selectedGuest);
    selectedGuest = null;
  } else if (guest.phase.kind === "order") {
    next = takeOrder(current, index, guest.id);
  } else if (guest.phase.kind === "carrying") {
    next = serveDish(current, index, guest.id);
  } else if (guest.phase.kind === "eating") {
    tell(current, "客人正在用餐，这张桌子很快会空出来。");
  } else {
    const carried = trayOrder(current);
    if (carried) {
      tell(current, `托盘里的${menu[carried.guest.dish].name}是 ${carried.table + 1} 号桌的。`);
    } else {
      tell(current, `到料理台处理这桌的${menu[guest.dish].name}。`);
    }
  }
  if (next !== current) {
    game = next;
    notice = null;
    waiter.dataset.spot = `table-${index}`;
  }
}

function syncClock() {
  const now = performance.now();
  if (game && mode === "running" && !document.hidden) {
    game = advanceGame(game, game.nowMs + (now - lastTick));
    if (selectedGuest !== null && !game.waiting.some((guest) => guest.id === selectedGuest)) {
      selectedGuest = null;
    }
    if (isFinished(game)) mode = "finished";
  }
  lastTick = now;
}

function interact(action: (current: Game) => void) {
  syncClock();
  if (mode === "running" && game) action(game);
  render();
}

function updatePatience(bar: HTMLProgressElement, value: number) {
  bar.value = Math.max(0, value);
  bar.classList.toggle("urgent", value <= 0.3);
}

function nextHint(current: Game | null): string {
  if (!current || mode === "opening") return "开门后，第一位客人会来到等位区。";
  if (mode === "paused") return "继续营业后，计时会从这里接着走。";
  if (mode === "finished") return "客人都已离开，本班结束。";
  if (notice && notice.untilMs > current.nowMs) return notice.text;
  if (selectedGuest !== null) return "点一张空桌，安排这位客人入座。";

  const carried = trayOrder(current);
  if (carried) return `托盘里是${menu[carried.guest.dish].name}，点 ${carried.table + 1} 号桌上菜。`;
  if (current.tables.some((guest) => guest?.phase.kind === "ready")) return "料理台有餐点做好了，点它取餐。";
  if (dishIds.some((dish) => stationOrder(current, dish)?.guest.phase.kind === "ticket")) {
    return "有客人点过单了，到料理台点对应的餐点开始制作。";
  }
  if (current.tables.some((guest) => guest?.phase.kind === "order")) return "点有订单气泡的餐桌接单。";
  if (current.waiting.length && current.tables.includes(null)) return "点等位区的客人，再点空桌安排入座。";
  if (current.tables.some((guest) => guest?.phase.kind === "cooking")) return "备餐中。出餐前可以先照顾其他客人。";
  if (current.nowMs >= current.rules.closeAtMs) return "已经打烊，等最后一桌用完餐。";
  return "留意等位区，新客人会陆续到来。";
}

function renderOverlay() {
  const running = mode === "running";
  overlay.hidden = running;
  roomControls.inert = !running;
  kitchenControls.inert = !running;
  pauseButton.disabled = mode === "opening" || mode === "finished";
  pauseButton.dataset.paused = String(mode === "paused");
  setText(pauseLabel, mode === "paused" ? "继续" : "暂停");
  if (running) return;

  steps.hidden = mode !== "opening";
  restartButton.hidden = mode !== "paused";
  if (mode === "paused") {
    setText(overlayTitle, "休息一下");
    setText(overlayDescription, "客人的耐心和备餐计时已暂停。");
    setText(playButton, "继续营业");
  } else if (mode === "finished" && game) {
    setText(overlayTitle, "今日收档");
    setText(overlayDescription, `上菜 ${game.served} 份，收入 ¥${game.earnings}，${game.left} 位客人等不及离开。`);
    setText(playButton, "再玩一班");
  }
}

function render() {
  const nowMs = game?.nowMs ?? 0;
  const closed = nowMs >= shiftRules.closeAtMs;
  setText(clock, clockText(shiftRules.closeAtMs - nowMs));
  setText(served, String(game?.served ?? 0));
  setText(left, String(game?.left ?? 0));
  setText(earnings, `¥${game?.earnings ?? 0}`);
  setText(queueCount, `${game?.waiting.length ?? 0} / ${shiftRules.queueSize}`);
  setText(shiftLabel, {
    opening: "准备开档",
    running: closed ? "已打烊 · 处理剩余订单" : "营业中",
    paused: "已暂停",
    finished: "已收档",
  }[mode]);
  shiftLabel.dataset.open = String(mode === "running" && !closed);

  for (const [index, view] of queueViews.entries()) {
    const guest = game?.waiting[index];
    view.button.hidden = !guest;
    if (!guest) continue;

    view.button.setAttribute("aria-pressed", String(guest.id === selectedGuest));
    view.person.dataset.look = String(guest.id % 5);
    setText(view.name, `客人 ${guest.id}`);
    updatePatience(view.patience, (guest.leavesAtMs - nowMs) / shiftRules.queuePatienceMs);
  }

  for (const [index, view] of tableViews.entries()) {
    const guest = game?.tables[index];
    const phase = guest?.phase.kind ?? "empty";
    view.button.dataset.phase = phase;
    view.button.dataset.available = String(!guest && selectedGuest !== null);
    view.person.hidden = !guest;
    view.bubble.hidden = !guest;
    view.patience.hidden = !guest || phase === "eating";
    view.button.setAttribute("aria-label", guest
      ? `${view.label}，${menu[guest.dish].name}，${tableLabels[guest.phase.kind]}`
      : `${view.label}，空桌`);
    if (!guest) continue;

    view.person.dataset.look = String(guest.id % 5);
    setText(view.icon, menu[guest.dish].icon);
    setText(view.dishName, menu[guest.dish].name);
    setText(view.phase, tableLabels[guest.phase.kind]);
    updatePatience(view.patience, (guest.leavesAtMs - nowMs) / shiftRules.tablePatienceMs);
  }

  for (const view of stationViews) {
    const order = game && stationOrder(game, view.dish);
    const phase = order ? order.guest.phase : null;
    const kind = phase?.kind ?? "idle";
    const tableName = order ? `${order.table + 1} 号桌` : "";
    let meta = `待单 · ${menu[view.dish].cookMs / 1_000} 秒`;
    if (phase?.kind === "ticket") meta = `制作 · ${tableName}`;
    if (phase?.kind === "cooking") {
      const remaining = phase.untilMs - nowMs;
      meta = `制作中 · ${seconds(remaining)} 秒`;
      view.meter.style.setProperty("--fill", `${100 * (1 - remaining / menu[view.dish].cookMs)}%`);
    }
    if (phase?.kind === "ready") meta = `取餐 · ${tableName}`;
    view.button.dataset.mode = kind;
    view.meter.hidden = kind !== "cooking";
    setText(view.meta, meta);
  }

  const carried = game && trayOrder(game);
  const icon = carried ? menu[carried.guest.dish].icon : "";
  heldIcon.hidden = !carried;
  setText(heldIcon, icon);
  setText(trayIcon, icon);
  tray.dataset.full = String(Boolean(carried));
  setText(trayLabel, carried ? `${menu[carried.guest.dish].name} · ${carried.table + 1} 号桌` : "空托盘");
  setText(hint, nextHint(game));
  renderOverlay();
}

function openShift() {
  game = startGame(shiftRules);
  mode = "running";
  selectedGuest = null;
  notice = null;
  lastTick = performance.now();
  waiter.dataset.spot = "home";
  render();
  queueViews[0]?.button.focus();
}

function togglePause() {
  if (mode === "paused") {
    mode = "running";
    lastTick = performance.now();
    render();
    pauseButton.focus();
  } else if (mode === "running") {
    syncClock();
    if (mode === "running") mode = "paused";
    render();
    playButton.focus();
  }
}

playButton.addEventListener("click", () => mode === "paused" ? togglePause() : openShift());
restartButton.addEventListener("click", openShift);
pauseButton.addEventListener("click", togglePause);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !event.repeat) togglePause();
});
document.addEventListener("visibilitychange", () => { lastTick = performance.now(); });
window.setInterval(() => {
  if (mode !== "running" || document.hidden) return;
  syncClock();
  render();
}, 100);

render();
