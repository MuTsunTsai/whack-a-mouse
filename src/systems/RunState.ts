// 跨關卡的當前遊戲進度（一場「巡視」的狀態）
//
// 何時新建一場 run：玩家從 TitleScene 選定難度進選關時
// 何時銷毀：返回 TitleScene、或結局畫面結束
//
// 為何不放 localStorage：這是一場進行中的 run 狀態，不需要持久化

import type { Difficulty } from "../config/difficulty.ts";

interface RunStateData {
	difficulty: Difficulty;
	bombUsed: boolean; // 整場 run 中只要任何一關按過炸彈，就為 true
	clearedStages: Set<number>; // 已過關的 stageId 集合
	totalScore: number; // 跨關卡累積分
	totalMouseHit: number;
	totalInnocentHit: number;
	// 「乾淨通關」flag：成就「安鼠高手 / 達人 / 神人」用
	// 任何「失敗 / 重玩 / 退出 / 使用炸彈」都會把它打成 false
	cleanRun: boolean;
	// 跨 run 計數（成就「毒餌狂魔 / 動物殺手」用）
	// 只在 RunState.start 時重置 → 退出選關 / 主畫面導致 RunState.end → 下一場 start 時歸零
	bombsUsed: number;
	innocentHitCount: number;
}

let current: RunStateData | null = null;

export const RunState = {
	start(difficulty: Difficulty): void {
		current = {
			difficulty,
			bombUsed: false,
			clearedStages: new Set(),
			totalScore: 0,
			totalMouseHit: 0,
			totalInnocentHit: 0,
			cleanRun: true,
			bombsUsed: 0,
			innocentHitCount: 0,
		};
	},

	end(): void {
		current = null;
	},

	get(): RunStateData | null {
		return current;
	},

	getDifficulty(): Difficulty {
		// 預設 normal 以防誤用（正常流程不會走到這）
		return current?.difficulty ?? "normal";
	},

	markBombUsed(): void {
		if (current) {
			current.bombUsed = true;
			current.cleanRun = false;
			current.bombsUsed += 1;
		}
	},

	wasBombUsed(): boolean {
		return current?.bombUsed ?? false;
	},

	getBombsUsed(): number {
		return current?.bombsUsed ?? 0;
	},

	// 紀錄一次無辜動物被打中（不分被槌子或炸彈）
	addInnocentHit(): void {
		if (current) {
			current.innocentHitCount += 1;
		}
	},

	getInnocentHitCount(): number {
		return current?.innocentHitCount ?? 0;
	},

	// 任何破壞「連續無瑕通關」條件的事件呼叫此函式：
	//   - 關卡失敗
	//   - 過關後選擇「再挑戰」（回頭重玩）
	//   - 退出到選關 / 主畫面
	breakCleanRun(): void {
		if (current) {
			current.cleanRun = false;
		}
	},

	isCleanRun(): boolean {
		return current?.cleanRun ?? false;
	},

	registerStageResult(args: {
		stageId: number;
		passed: boolean;
		score: number;
		mouseHit: number;
		innocentHit: number;
	}): void {
		if (!current) return;
		if (args.passed) {
			current.clearedStages.add(args.stageId);
		}
		current.totalScore += args.score;
		current.totalMouseHit += args.mouseHit;
		current.totalInnocentHit += args.innocentHit;
	},

	hasClearedAll(totalStageCount: number): boolean {
		return (current?.clearedStages.size ?? 0) >= totalStageCount;
	},

	/**
	 * 本場 run 是否從第 1 關連續通過到第 N 關（含）。
	 * 用於達人類成就：「從第一關開始」是必要條件——若玩家從中途關卡開玩，
	 * 即使 cleanRun 仍 true（沒失敗 / 沒重玩）也不該解鎖。
	 */
	hasClearedSequenceFrom1(toStageId: number): boolean {
		if (!current) return false;
		for (let i = 1; i <= toStageId; i++) {
			if (!current.clearedStages.has(i)) return false;
		}
		return true;
	},
};
