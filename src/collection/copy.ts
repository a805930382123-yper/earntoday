import type { WorkState } from "../salary/calc";

type Pair = readonly [full: string, mini: string];
export interface CollectionCopy {
  stages: readonly Pair[];
  lunch: Pair;
  after: Pair;
  rest: Pair;
  deposit: string;
  unit: string;
}
export const RICE_COPY: CollectionCopy = {
  stages: [["饭饭准备中～", "准备饭饭"], ["饭饭一点点变多啦～", "慢慢添饭"],
    ["白米饭快有半碗啦！", "饭饭增加中"], ["香喷喷的饭饭快装满啦！", "快开饭啦"],
    ["今天的饭饭装满啦！", "饭饭满满！"]],
  lunch: ["饭饭等会儿再添～", "饭饭休息中"],
  after: ["今天的饭饭装满啦！", "饭饭满满！"],
  rest: ["今天休息，饭饭也休息～", "休息日～"],
  deposit: "饭饭 +1！", unit: "饭饭",
};
export const FISH_COPY: CollectionCopy = {
  stages: [["小鱼干储备中～", "准备鱼干"], ["喵！小鱼干慢慢变多啦！", "攒鱼干中"],
    ["小鱼干已经攒了不少喵～", "半罐鱼干"], ["再来一点就满罐啦！", "快满罐啦"],
    ["今天的小鱼干装满啦！", "鱼干满罐！"]],
  lunch: ["小鱼干先放这里，咪宝睡会儿～", "呼噜呼噜～"],
  after: ["今天的小鱼干装满啦！喵～", "鱼干满罐！"],
  rest: ["咪宝今天放假啦～", "休息喵～"],
  deposit: "小鱼干 +1！", unit: "鱼干",
};

export function collectionCopy(copy: CollectionCopy, state: WorkState, stage: number, mini = false): string {
  const bucket = stage <= 0 ? 0 : stage <= 3 ? 1 : stage <= 6 ? 2 : stage <= 9 ? 3 : 4;
  const pair = state === "rest_day" ? copy.rest : state === "lunch" ? copy.lunch : state === "after" ? copy.after : copy.stages[bucket];
  return pair[mini ? 1 : 0];
}
