// 計算「為了讓玩家『理論上有可能過關』，本關至少需要冒出多少隻老鼠」。
//
// 假設玩家：
//   - 每隻老鼠都打中（full combo）
//   - 不打到任何無辜動物（不扣分、combo 不中斷）
//   - 不使用炸彈（因為炸彈會中斷 combo、且打老鼠的 bombScore 不套 combo 倍率）
//
// 此值會被 GameScene 用來保證 spawn 出足夠數量的老鼠，避免「卡關」（系統根本沒給夠老鼠）。

import { BALANCE } from "../config/balance.ts";
import { CREATURES } from "../config/creatures.ts";
import type { DifficultyMod } from "../config/difficulty.ts";
import { comboMultiplier } from "../systems/ScoreSystem.ts";

/**
 * 給定關卡的過關門檻 + 難度倍率，回傳「full combo 下需要打中幾隻老鼠才達標」。
 * 用累加方式找最小 N：第 i 隻老鼠的得分為 round(base × (1 + (i-1) × R))。
 *
 * 注意：呼叫端應傳入「已套用難度倍率後」的 passScore（亦即 effectiveStage.passScore）。
 */
export function computeMinMiceForPass(passScore: number, mod: DifficultyMod): number {
	const baseHitScore = Math.round(CREATURES.mouse.hitScore * mod.hitScoreMultiplier);
	if (baseHitScore <= 0) return 0;
	let total = 0;
	let n = 0;
	// safety cap：理論上不會跑超過 passScore / baseHitScore 次
	const cap = Math.ceil(passScore / Math.max(1, baseHitScore)) + 100;
	while (total < passScore && n < cap) {
		n += 1;
		const delta = Math.round(baseHitScore * comboMultiplier(n));
		total += delta;
	}
	return n;
}

/**
 * 「保證出的老鼠數」：以 minMice 為底乘以一個寬鬆係數，給玩家一些容錯（不必每隻都全中）。
 */
export function computeGuaranteedMice(passScore: number, mod: DifficultyMod): number {
	const minMice = computeMinMiceForPass(passScore, mod);
	return Math.ceil(minMice * BALANCE.guaranteedMouseFactor);
}
