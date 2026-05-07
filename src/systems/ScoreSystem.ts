// 分數、連擊、誤殺記錄
//
// Combo 規則：
//   - 打中老鼠：combo += 1（先增後算分），分數 = 基底 × (1 + (combo - 1) × comboBonusRate)
//   - 打中無辜：combo 重置為 0
//   - 揮空：combo 重置為 0
//   - 用炸彈：combo 重置為 0（無論炸到什麼）

import { BALANCE } from "../config/balance.ts";
import type { CreatureType } from "../config/creatures.ts";

export interface ScoreState {
	score: number;
	combo: number;
	maxCombo: number;
	mouseHit: number;
	innocentHit: number; // 誤殺：包含主動點擊與炸彈波及
}

/** 計算 combo 加成倍率（combo 增加後的當下使用） */
export function comboMultiplier(combo: number): number {
	if (combo <= 0) return 1;
	return 1 + (combo - 1) * BALANCE.comboBonusRate;
}

export class ScoreSystem {
	private state: ScoreState = {
		score: 0,
		combo: 0,
		maxCombo: 0,
		mouseHit: 0,
		innocentHit: 0,
	};

	get snapshot(): ScoreState {
		return { ...this.state };
	}

	/**
	 * 處理一次「主動點擊命中」。
	 *   baseDelta：基底得分（負數代表扣分）
	 * 若 type 為 mouse 會先增 combo、再以新 combo 計算最終得分；
	 * 否則 combo 重置、不套用 combo 加成。
	 * 回傳實際加到分數的數字（含 combo 加成），方便 UI 顯示。
	 */
	registerHit(type: CreatureType, baseDelta: number): number {
		if (type === "mouse") {
			this.state.combo += 1;
			if (this.state.combo > this.state.maxCombo) {
				this.state.maxCombo = this.state.combo;
			}
			const finalDelta = Math.round(baseDelta * comboMultiplier(this.state.combo));
			this.state.score += finalDelta;
			this.state.mouseHit += 1;
			return finalDelta;
		}
		// 打中無辜：combo 重置、不套加成
		this.state.combo = 0;
		this.state.score += baseDelta;
		this.state.innocentHit += 1;
		return baseDelta;
	}

	/** 揮槌但沒命中任何生物 → 中斷 combo */
	registerMiss(): void {
		this.state.combo = 0;
	}

	/**
	 * 炸彈炸到的處理。炸彈本身會中斷 combo（呼叫端記得在第一次呼叫前重置）。
	 * 這個方法不改 combo，純粹結算分數與計數。
	 */
	registerBombKill(type: CreatureType, delta: number): void {
		this.state.score += delta;
		if (type === "mouse") {
			this.state.mouseHit += 1;
		} else {
			this.state.innocentHit += 1;
		}
	}

	/** 炸彈使用本身：中斷 combo */
	registerBombUsed(): void {
		this.state.combo = 0;
	}
}
