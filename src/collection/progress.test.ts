import { test } from "node:test";
import assert from "node:assert/strict";
import { collectionStage, shouldAnimateCollection, type CollectionSample } from "./progress.ts";
import { DEFAULT_SETTINGS, workProgress, workState } from "../salary/calc.ts";
import { RICE_COPY, FISH_COPY, collectionCopy } from "./copy.ts";

test("ten equal effective-work stages, lunch holds, rest/before stay empty, after full", () => {
  const at = (h: number, m = 0) => new Date(2026, 9, 20, h, m);
  for (const [h,m,stage] of [[8,0,0],[9,0,0],[9,48,1],[12,0,3],[12,59,3],[14,0,5],[18,0,10],[23,0,10]]) {
    const now = at(h,m);
    assert.equal(collectionStage(workProgress(now,DEFAULT_SETTINGS),workState(now,DEFAULT_SETTINGS)),stage);
  }
  const rest = new Date(2026,9,18,19);
  assert.equal(collectionStage(workProgress(rest,DEFAULT_SETTINGS),workState(rest,DEFAULT_SETTINGS)),0);
  for (const n of [NaN,Infinity,-Infinity,-1]) assert.equal(collectionStage(n,"working"),0);
  assert.equal(collectionStage(2,"working"),10);
  assert.equal(collectionStage(.3-Number.EPSILON,"working"),3);
  assert.equal(collectionStage(.299999,"working"),2);
  for (const s of [{...DEFAULT_SETTINGS,workEnd:'bad'},{...DEFAULT_SETTINGS,workEnd:'10:00'},{...DEFAULT_SETTINGS,workEnd:'09:00'}]) {
    assert.equal(workProgress(at(14),s),0);
  }
  assert.equal(collectionStage(workProgress(at(14),{...DEFAULT_SETTINGS,monthlySalary:999999}),"working"),5);
});

const sample: CollectionSample = { stage: 4, state: "working", time: 1000, day: "2026-10-20", scope: "same", enabled: true };
test("deposit only once for a normal single boundary; no historical replay", () => {
  const next = {...sample,stage:5,time:2000};
  assert.equal(shouldAnimateCollection(sample,next),true);
  assert.equal(shouldAnimateCollection(next,next),false);
  assert.equal(shouldAnimateCollection(null,next),false);
  for (const change of [{time:10000},{time:500},{stage:7},{stage:3},{enabled:false},{scope:"new-theme"},{scope:"new-window"},{scope:"new-settings"},{day:"2026-10-21"},{state:"lunch" as const},{state:"rest_day" as const}]) {
    assert.equal(shouldAnimateCollection(sample,{...next,...change}),false,JSON.stringify(change));
  }
  assert.equal(shouldAnimateCollection({...sample,enabled:false},next),false);
  assert.equal(shouldAnimateCollection({...sample,state:"lunch"},next),false);
  assert.equal(shouldAnimateCollection({...sample,stage:9},{...next,stage:10,state:"after"}),true);
});

test("theme copy maps every stage and work state to full/mini variants without salary vocabulary", () => {
  for (const copy of [RICE_COPY,FISH_COPY]) {
    for (let stage=0;stage<=10;stage++) for (const mini of [false,true]) {
      const bucket=stage===0?0:stage<=3?1:stage<=6?2:stage<10?3:4;
      assert.equal(collectionCopy(copy,"working",stage,mini),copy.stages[bucket][mini?1:0]);
      for(const [state,key] of [["lunch","lunch"],["after","after"],["rest_day","rest"]] as const) {
        assert.equal(collectionCopy(copy,state,stage,mini),copy[key][mini?1:0]);
      }
      assert.doesNotMatch(collectionCopy(copy,"working",stage,mini),/¥|￥|工资|月薪|日薪|时薪|收入|赚/);
    }
  }
  assert.equal(collectionCopy(RICE_COPY,"working",3),"饭饭一点点变多啦～");
  assert.equal(collectionCopy(FISH_COPY,"lunch",5),"小鱼干先放这里，咪宝睡会儿～");
});
