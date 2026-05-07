// 模擬玩家：以三個技能參數驅動 Simulation
//   discrimination 0~1：分辨「該打 / 不該打」的正確率
//     - 1.0 完美：永遠正確（看到老鼠就打、看到無辜就放）
//     - 0.5 隨機：每個生物都有一半機率被誤判
//     - 0.0 反向：必定誤判（永遠選錯）
//   reactionTimeMs：看到生物冒出後到實際揮槌的延遲
//   accuracy 0~1：揮槌時槌頭與目標的偏差
//     - 1.0 完美：永遠落在 hitRadius 內最中心位置
//     - 0.5 一半機率落在 hitRadius 邊緣
//     - 0.0 偏差量大（落在 hitRadius 外側）

import { HAMMER } from "../config/hammer.ts";
import { CREATURES } from "../config/creatures.ts";
import type { Simulation, SimCreature } from "./Simulation.ts";

export interface SimPlayerStats {
	discrimination: number;
	reactionTimeMs: number;
	accuracy: number;
	/** 開啟後玩家完全不引爆炸彈（即使危急） — 模擬挑戰 Good End 的玩家 */
	noBombs?: boolean;
}

interface PendingDecision {
	creatureId: number;
	willHit: boolean;
	atMs: number;
}

export class SimPlayer {
	private readonly stats: SimPlayerStats;
	/**
	 * 已觀察過的「creature 出現事件」key = `${id}@${holeIndex}`。
	 * 用 id+holeIndex 而非單純 id，是因為老鼠瞬移時 id 不變但洞口會變 —— 對真實玩家而言
	 * 那是「一隻新冒出來的老鼠」，需要重新做判別與反應，否則玩家視角會永遠忽略瞬移後的個體。
	 */
	private observed: Set<string> = new Set();
	/** 排程中的揮槌動作 */
	private pending: PendingDecision[] = [];

	constructor(stats: SimPlayerStats) {
		this.stats = stats;
	}

	/**
	 * 把模擬時間推進一步：
	 *   1. 看現在場上有哪些「沒看過」的生物 → 為每隻決定是否要打、何時揮槌
	 *   2. 觸發所有到時間的揮槌
	 *   3. 集氣滿且場上老鼠 ≥ threshold-1 時引爆炸彈
	 */
	tick(sim: Simulation): void {
		const now = sim.getNow();
		const live = sim.getCreatures();

		// 對新看到的生物做決策（key = id@holeIndex；老鼠瞬移後等同「新冒出的一隻」）
		for (const c of live) {
			const key = `${c.id}@${c.holeIndex}`;
			if (this.observed.has(key)) continue;
			this.observed.add(key);
			this.scheduleDecision(c, now);
		}

		// 執行排程到期的揮槌
		const stillPending: PendingDecision[] = [];
		for (const p of this.pending) {
			if (p.atMs > now) {
				stillPending.push(p);
				continue;
			}
			// 找這隻是否還在場
			const target = live.find((x) => x.id === p.creatureId);
			if (!target) continue; // 已經 retract 或瞬移到別地（瞬移時 id 不變、target 仍在；
			// 但 hitRadius 是用 sim 的 currentX/Y 計算，所以這裡不需要特別處理瞬移）
			if (!p.willHit) continue;
			// 揮槌位置：以 accuracy 計算偏差
			const offset = this.computeAimOffset();
			sim.whack(target.x + offset.dx, target.y + offset.dy);
		}
		this.pending = stillPending;

		// 炸彈策略：場上老鼠數 >= threshold - 1 且庫存 ≥ 1 → 立即炸
		// 但若玩家設了 noBombs（挑戰 Good End）→ 即使危急也不放
		if (this.stats.noBombs) return;
		const threshold = sim.stage.hantaThreshold;
		if (sim.canDetonate() && sim.getLiveMiceCount() >= threshold - 1) {
			sim.detonate();
		}
	}

	private scheduleDecision(c: SimCreature, now: number): void {
		const def = CREATURES[c.type];
		const isMouse = c.type === "mouse";
		// 「該打」的真值：老鼠該打 / 其他不該打
		const correctChoice = isMouse;
		// discrimination 機率正確判斷
		const correctlyJudged = Math.random() < this.stats.discrimination;
		const willHit = correctlyJudged ? correctChoice : !correctChoice;
		// 不同 reaction time 加上一點隨機抖動讓結果不要太機械
		const reactionJitter = (Math.random() * 0.4 + 0.8); // 0.8 ~ 1.2 倍
		const atMs = now + this.stats.reactionTimeMs * reactionJitter;
		this.pending.push({ creatureId: c.id, willHit, atMs });
		// 對 def 的引用維持，避免某些 lint 警告（同時保留語意：未來可加上「該打」邏輯複雜度）
		void def;
	}

	/**
	 * 揮槌偏差：accuracy 越高、偏差越小。
	 * 偏差距離隨機落在 [0, maxOffsetPx] 中、方向隨機。
	 * accuracy = 1.0 → maxOffsetPx ≈ 0.1 × hitRadius（幾乎必中中央）
	 * accuracy = 0.0 → maxOffsetPx ≈ 1.5 × hitRadius（常常落在 hitRadius 外）
	 */
	private computeAimOffset(): { dx: number; dy: number } {
		const a = Math.max(0, Math.min(1, this.stats.accuracy));
		const maxOffset = HAMMER.hitRadius * (1.5 - a * 1.4); // 1.5 → 0.1
		const dist = Math.random() * maxOffset;
		const angle = Math.random() * Math.PI * 2;
		return { dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist };
	}
}
