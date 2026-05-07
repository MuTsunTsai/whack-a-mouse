// 生物冒出系統：依關卡權重抽選生物與洞、隨機間隔
//
// 友善動物去重升級規則（避免畫面上同時兩隻同種無辜動物）：
//   抽到的若是 cat / dog / owl / hawk 且該種已在場 →
//     沿 cat → dog → owl → hawk 鏈嘗試升級到「下一個尚未在場、且本關有設權重」的種類；
//     升級鏈走完仍找不到可用種類 → 放棄這次 spawn（roll 回傳 null）。
//   老鼠不受此限。

import type { CreatureType } from "../config/creatures.ts";
import type { StageDef } from "../config/stages.ts";
import { randomBetween, weightedPick } from "../utils/random.ts";

export interface SpawnRequest {
	creature: CreatureType;
	holeIndex: number;
	lifespanMs: number;
}

/** 友善動物升級鏈（由低階到高階） */
const INNOCENT_CHAIN: CreatureType[] = ["cat", "dog", "owl", "hawk"];

/**
 * 給定一個被抽到的生物 type 與「目前場上已存在的種類集合」，
 * 嘗試做去重升級：
 *  - 不是友善動物 → 直接回傳原值
 *  - 是友善動物且不在場上 → 直接回傳原值
 *  - 是友善動物且已在場 → 沿鏈往上找一個「不在場上 + stage.weights 有定義」的種類；
 *    找不到回傳 null。
 */
function resolveInnocentUpgrade(
	type: CreatureType,
	present: Set<CreatureType>,
	weights: StageDef["weights"],
): CreatureType | null {
	if (type === "mouse") return type;
	if (!present.has(type)) return type;
	const idx = INNOCENT_CHAIN.indexOf(type);
	if (idx < 0) return type;
	for (let i = idx + 1; i < INNOCENT_CHAIN.length; i++) {
		const next = INNOCENT_CHAIN[i]!;
		// 必須是本關有設定權重的（否則代表「該關還沒解鎖此動物」）
		if ((weights[next] ?? 0) > 0 && !present.has(next)) {
			return next;
		}
	}
	return null;
}

export class SpawnSystem {
	private holesInUse: Set<number> = new Set();

	constructor(private readonly stage: StageDef) { }

	markBusy(holeIndex: number): void {
		this.holesInUse.add(holeIndex);
	}

	markFree(holeIndex: number): void {
		this.holesInUse.delete(holeIndex);
	}

	freeAll(): void {
		this.holesInUse.clear();
	}

	nextDelayMs(): number {
		return randomBetween(this.stage.spawnIntervalMs[0], this.stage.spawnIntervalMs[1]);
	}

	/**
	 * 抽一隻新生物。
	 *  presentInnocents：目前畫面上已存活的友善動物種類集合（呼叫者收集）。
	 *  抽到的友善動物若已在場 → 嘗試升級；升級鏈耗盡 → 回傳 null（放棄這次 spawn）。
	 */
	roll(presentInnocents: Set<CreatureType> = new Set()): SpawnRequest | null {
		const holeIndex = this.pickFreeHole();
		if (holeIndex === null) {
			return null;
		}
		const raw = weightedPick(this.stage.weights);
		const resolved = resolveInnocentUpgrade(raw, presentInnocents, this.stage.weights);
		if (resolved === null) {
			return null;
		}
		const lifespanMs = randomBetween(this.stage.lifespanMs[0], this.stage.lifespanMs[1]);
		return { creature: resolved, holeIndex, lifespanMs };
	}

	/**
	 * 隨機挑一個目前沒有生物佔用的洞，給「老鼠瞬移」之類的場景使用。
	 * 可選傳入 excludeIndex 排除某洞（避免瞬移到同一個洞看起來沒動）。
	 * 全部洞都被佔用時回傳 null。
	 */
	pickFreeHole(excludeIndex?: number): number | null {
		const free: number[] = [];
		const total = this.stage.holeCount.reduce((x, v) => x + v, 0);
		for (let i = 0; i < total; i++) {
			if (i === excludeIndex) continue;
			if (!this.holesInUse.has(i)) {
				free.push(i);
			}
		}
		if (free.length === 0) return null;
		return free[Math.floor(Math.random() * free.length)]!;
	}

	/** 取得一個老鼠停留時間（瞬移後再給一次新的計時） */
	rollLifespanMs(): number {
		return randomBetween(this.stage.lifespanMs[0], this.stage.lifespanMs[1]);
	}
}
