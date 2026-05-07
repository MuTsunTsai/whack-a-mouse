// 用 SimPlayer 驅動 Simulation 跑完一整關。
// 每次以「下一個遊戲事件 + 玩家決策間隔」的最小值推進時間。

import type { Difficulty } from "../config/difficulty.ts";
import { Simulation, type StageResult } from "./Simulation.ts";
import { SimPlayer, type SimPlayerStats } from "./SimPlayer.ts";

const PLAYER_POLL_INTERVAL_MS = 50; // 每 50ms 玩家做一次決策（觀察 + 處理排程）

export interface RunOptions {
	stageId: number;
	difficulty: Difficulty;
	playerStats: SimPlayerStats;
	/** 安全上限：避免無限迴圈（單關不會超過 120 秒實際時間） */
	maxRealMs?: number;
}

export function runStage(opts: RunOptions): StageResult {
	const sim = new Simulation(opts.stageId, opts.difficulty);
	const player = new SimPlayer(opts.playerStats);
	const maxMs = opts.maxRealMs ?? 120_000;

	let cursorMs = 0;
	while (!sim.isOver() && cursorMs < maxMs) {
		cursorMs += PLAYER_POLL_INTERVAL_MS;
		sim.advanceTo(cursorMs);
		if (sim.isOver()) break;
		player.tick(sim);
	}

	return sim.getResult();
}

export interface RunSeriesResult {
	totalRuns: number;
	clears: number; // 全 5 關都過
	deathCounts: Map<number, { hanta: number; fail: number }>; // stageId → 死法統計
	finalStageDistribution: Map<number, number>; // 死/結束時是第幾關
	totalScores: number[];
}

/**
 * 跑完整 5 關 run 多次，每次從第 1 關打到死或全破。
 */
export function runFullCampaign(
	difficulty: Difficulty,
	playerStats: SimPlayerStats,
): { clearedAll: boolean; deathStageId: number | null; deathReason: "hanta" | "fail" | null; results: StageResult[] } {
	const results: StageResult[] = [];
	for (let stageId = 1; stageId <= 5; stageId++) {
		const r = runStage({ stageId, difficulty, playerStats });
		results.push(r);
		if (!r.passed) {
			return {
				clearedAll: false,
				deathStageId: stageId,
				deathReason: r.reason === "hanta" ? "hanta" : "fail",
				results,
			};
		}
	}
	return { clearedAll: true, deathStageId: null, deathReason: null, results };
}
