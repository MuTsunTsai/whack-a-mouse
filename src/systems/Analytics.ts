// Google Analytics 事件追蹤（GA4 gtag.js）
//
// gtag.js 已在 src/index.html 內以 <script> 標籤載入並初始化。
// 本模組提供型別安全的 wrapper，集中遊戲三個關鍵事件：開始、陣亡、全破。
//
// 注意：
//   - 若 gtag 不存在（廣告攔截、開發環境某些情境）→ 靜默跳過、不影響遊戲
//   - 事件名稱用 snake_case（GA4 慣例）

import type { Difficulty } from "../config/difficulty.ts";

type GtagFn = (command: "event", eventName: string, params?: Record<string, unknown>) => void;

function gtag(): GtagFn | null {
	const fn = (window as unknown as { gtag?: GtagFn }).gtag;
	return typeof fn === "function" ? fn : null;
}

// 所有自訂事件名都加 `wam_`（whack-a-mouse）前綴，避免與 GA 內建事件 / 其他專案衝突
export const Analytics = {
	/** 玩家從 TitleScene 選定難度、進入選關 → 「開始一場 run」 */
	startRun(difficulty: Difficulty): void {
		gtag()?.("event", "wam_game_start", {
			difficulty,
		});
	},

	/** 玩家在某關陣亡（hanta 或不及格）。stage_id = 1~5、reason = "hanta" | "fail" */
	stageDeath(args: {
		difficulty: Difficulty;
		stageId: number;
		reason: "hanta" | "fail";
	}): void {
		gtag()?.("event", "wam_stage_death", {
			difficulty: args.difficulty,
			stage_id: args.stageId,
			reason: args.reason,
		});
	},

	/** 玩家通過某關（passed === true 才送）。combo / bomb / score 為這關當局的數字 */
	stageClear(args: {
		difficulty: Difficulty;
		stageId: number;
		combo: number;
		bomb: number;
		score: number;
	}): void {
		gtag()?.("event", "wam_stage_clear", {
			difficulty: args.difficulty,
			stage_id: args.stageId,
			combo: args.combo,
			bomb: args.bomb,
			score: args.score,
		});
	},

	/** 五關全破 → 結局畫面。ending = "good"（純手打）| "bad"（用過炸彈） */
	allCleared(args: {
		difficulty: Difficulty;
		ending: "good" | "bad";
	}): void {
		gtag()?.("event", "wam_all_cleared", {
			difficulty: args.difficulty,
			ending: args.ending,
		});
	},

	/** 玩家「首次解鎖」某個成就。重複解鎖（已存於 SaveSystem）不會送。 */
	achievementUnlock(achievementId: string): void {
		gtag()?.("event", "wam_achievement_unlock", {
			achievement_id: achievementId,
		});
	},

	/** 生存模式結束（漢他爆發）：紀錄存活秒數與分數。 */
	survivalEnd(args: {
		survivedSec: number;
		score: number;
	}): void {
		gtag()?.("event", "wam_survival_end", {
			survived_sec: args.survivedSec,
			score: args.score,
		});
	},
};
