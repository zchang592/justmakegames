export const menu = {
  plum: { name: "青梅茶", icon: "🍵", cookMs: 3_200, price: 12 },
  citrus: { name: "橘子汽水", icon: "🍊", cookMs: 4_400, price: 16 },
  rice: { name: "海苔饭团", icon: "🍙", cookMs: 5_600, price: 19 },
} as const;

export type DishId = keyof typeof menu;
export const dishIds = Object.keys(menu) as DishId[];

export interface Rules {
  readonly closeAtMs: number;
  readonly queueSize: number;
  readonly tableCount: number;
  readonly queuePatienceMs: number;
  readonly tablePatienceMs: number;
  readonly eatMs: number;
  readonly arrivals: readonly (readonly [atMs: number, dish: DishId])[];
}

export const shiftRules: Rules = {
  closeAtMs: 75_000,
  queueSize: 3,
  tableCount: 3,
  queuePatienceMs: 20_000,
  tablePatienceMs: 33_000,
  eatMs: 2_200,
  arrivals: [
    [0, "plum"],
    [7_500, "citrus"],
    [15_000, "rice"],
    [22_000, "plum"],
    [29_500, "rice"],
    [37_000, "citrus"],
    [43_500, "citrus"],
    [49_000, "plum"],
    [56_000, "rice"],
    [63_000, "plum"],
    [70_000, "citrus"],
  ],
};
