// 成就解鎖管理：寫入 SaveSystem + 暫存「待顯示」佇列
//
// 流程：
//   1. 各場景偵測到達成條件 → 呼叫 AchievementSystem.unlock(id)
//   2. unlock() 檢查 SaveSystem 是否已解鎖；新解鎖才 push 進 pending 佇列
//   3. 下一個結算畫面（GameOverScene / EndingScene）呼叫 consumePending() 拿出佇列
//   4. 用 showAchievementUnlockedPopups() 依序播放彈跳通知

import { SaveSystem } from "./SaveSystem.ts";

let pending: string[] = [];

export const AchievementSystem = {
	/**
	 * 解鎖一個成就。若是新解鎖（之前未存於 SaveSystem），會排進 pending 佇列以便
	 * 下一個結算畫面顯示通知。已解鎖過的則靜默忽略。
	 */
	unlock(id: string): void {
		const newly = SaveSystem.unlockAchievement(id);
		if (newly) pending.push(id);
	},

	/**
	 * 取出 pending 佇列、清空之（典型用法：結算畫面進入時呼叫一次）。
	 */
	consumePending(): string[] {
		const out = pending;
		pending = [];
		return out;
	},
};
