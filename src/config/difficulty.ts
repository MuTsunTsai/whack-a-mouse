// 三種難度：影響漢他門檻、生物冒出速度、無辜生物權重、扣分倍率
//
// 設計原則：
//  - 簡單：適合休閒玩，鼠多、無辜少、漢他寬鬆
//  - 普通：依 stages.ts 原始設定（=1.0 倍）
//  - 困難：鼠少、無辜更多、漢他嚴格、扣分重
//
// 大部分倍率「乘上」原值，僅少數用「加成 / 縮減」呈現

export type Difficulty = "easy" | "normal" | "hard";

export interface DifficultyMod {
	label: string;
	description: string;
	uiColor: number;

	/** 每關開始時送的初始炸彈數（0~3） */
	initialBombs: number;
	/** 漢他觸發門檻：畫面上同時存活的老鼠達此數量 → game over */
	hantaThreshold: number;
	/** 關卡時間倍率（簡單較長、困難較短） */
	durationMultiplier: number;
	/** 過關門檻倍率 */
	passScoreMultiplier: number;

	/** 生物冒出間隔倍率（小於 1 = 更快冒出 = 更難） */
	spawnIntervalMultiplier: number;
	/**  生物在洞口停留時間倍率（小於 1 = 更快縮回 = 更難打到） */
	lifespanMultiplier: number;

	/** 老鼠權重倍率 */
	mouseWeightMultiplier: number;
	/** 無辜（貓/狗/貓頭鷹/老鷹）權重倍率 */
	innocentWeightMultiplier: number;

	/** 點擊得分倍率（簡單給更高鼓勵）*/
	hitScoreMultiplier: number;
	/** 扣分倍率（困難扣更重） */
	penaltyMultiplier: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultyMod> = {
	easy: {
		label: "簡單",
		description: "鼠多無辜少，漢他寬鬆",
		uiColor: 0x44aa66,
		initialBombs: 2,
		hantaThreshold: 8,
		durationMultiplier: 1.0,
		passScoreMultiplier: 0.7,
		spawnIntervalMultiplier: 1.0,
		lifespanMultiplier: 0.9,
		mouseWeightMultiplier: 1.0,
		innocentWeightMultiplier: 0.5,
		hitScoreMultiplier: 0.9,
		penaltyMultiplier: 0.6,
	},
	normal: {
		label: "普通",
		description: "市府公告原始難度",
		uiColor: 0xddaa44,
		initialBombs: 1,
		hantaThreshold: 7,
		durationMultiplier: 1.0,
		passScoreMultiplier: 1.0,
		spawnIntervalMultiplier: 0.75,
		lifespanMultiplier: 0.75,
		mouseWeightMultiplier: 1.0,
		innocentWeightMultiplier: 1.0,
		hitScoreMultiplier: 1.0,
		penaltyMultiplier: 1.0,
	},
	hard: {
		label: "困難",
		description: "鼠患失控、毒餌氾濫、扣分加倍",
		uiColor: 0xcc4444,
		initialBombs: 0,
		hantaThreshold: 6,
		durationMultiplier: 0.9,
		passScoreMultiplier: 1.2,
		spawnIntervalMultiplier: 0.5,
		lifespanMultiplier: 0.6,
		mouseWeightMultiplier: 0.9,
		innocentWeightMultiplier: 2.0,
		hitScoreMultiplier: 1.4,
		penaltyMultiplier: 1.5,
	},
};

export function getDifficulty(d: Difficulty): DifficultyMod {
	return DIFFICULTY[d];
}
