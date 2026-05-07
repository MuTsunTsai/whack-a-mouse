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
		}
	},

	wasBombUsed(): boolean {
		return current?.bombUsed ?? false;
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
};
