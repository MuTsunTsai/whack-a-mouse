// localStorage 包裝：最高分（依難度）、解鎖關卡（依難度）、最佳結局
//
// 安全策略：
//   - 所有遊戲存檔合併成單一 obfuscated blob 存於 wam:save
//   - 使用 Codec（Base64 + XOR + 簡易 HMAC）混淆，讓 DevTools 直接改數字變困難
//   - 偵測到資料損毀（簽章不對 / 解析失敗）→ 靜默重置成預設值
//   - 只有 wam:difficulty（上次選擇的難度）保留明碼，因為它純為 UI 預選功能

import type { Difficulty } from "../config/difficulty.ts";
import { Codec } from "./Codec.ts";

const KEY_SAVE = "wam:save";
const KEY_DIFFICULTY = "wam:difficulty";

export type Ending = "good" | "bad";

interface SaveData {
	highScores: { [diff in Difficulty]?: { [stageId: number]: number } };
	unlocked: { [diff in Difficulty]?: number };
	bestEnding: { [diff in Difficulty]?: Ending };
	// 已解鎖的插畫 key 列表（不依難度，跨難度共享收集進度）
	unlockedCgs: string[];
	// 已解鎖的成就 id 列表（跨難度共享）
	unlockedAchievements: string[];
	// 已完成的關卡總次數（不分輸贏；成就「安鼠鐵粉」用）
	stagesCompleted: number;
	// 「垂死掙扎」累計：漢他閾值 -1 時徒手槌中老鼠的次數（跨 session）
	lastGaspCount: number;
	// 生存模式最高紀錄（兩者各自獨立累計）
	survivalBestSec: number;
	survivalBestScore: number;
}

function emptyData(): SaveData {
	return {
		highScores: {},
		unlocked: {},
		bestEnding: {},
		unlockedCgs: [],
		unlockedAchievements: [],
		stagesCompleted: 0,
		lastGaspCount: 0,
		survivalBestSec: 0,
		survivalBestScore: 0,
	};
}

// 讀取整份存檔；損毀時靜默回傳空物件並覆寫掉舊值
function readData(): SaveData {
	let raw: string | null = null;
	try {
		raw = localStorage.getItem(KEY_SAVE);
	} catch {
		return emptyData();
	}
	if (!raw) return emptyData();

	const data = Codec.decode<SaveData>(raw);
	if (!data || typeof data !== "object") {
		// 損毀：靜默清掉並回傳空白
		try {
			localStorage.removeItem(KEY_SAVE);
		} catch {
			// 忽略
		}
		return emptyData();
	}
	// 確保結構完整（避免舊版資料缺欄位導致後續 undefined 錯誤）
	return {
		highScores: data.highScores ?? {},
		unlocked: data.unlocked ?? {},
		bestEnding: data.bestEnding ?? {},
		unlockedCgs: data.unlockedCgs ?? [],
		unlockedAchievements: data.unlockedAchievements ?? [],
		stagesCompleted: data.stagesCompleted ?? 0,
		lastGaspCount: data.lastGaspCount ?? 0,
		survivalBestSec: data.survivalBestSec ?? 0,
		survivalBestScore: data.survivalBestScore ?? 0,
	};
}

function writeData(data: SaveData): void {
	try {
		localStorage.setItem(KEY_SAVE, Codec.encode(data));
	} catch {
		// 忽略 localStorage 失敗（隱私模式、空間滿等）
	}
}

export const SaveSystem = {
	// === 最高分（依難度與關卡）===
	getHighScore(difficulty: Difficulty, stageId: number): number {
		const data = readData();
		return data.highScores[difficulty]?.[stageId] ?? 0;
	},

	setHighScore(difficulty: Difficulty, stageId: number, score: number): void {
		const data = readData();
		const bucket = data.highScores[difficulty] ?? {};
		const prev = bucket[stageId] ?? 0;
		if (score > prev) {
			bucket[stageId] = score;
			data.highScores[difficulty] = bucket;
			writeData(data);
		}
	},

	// === 解鎖進度（依難度）===
	getUnlocked(difficulty: Difficulty): number {
		const data = readData();
		return Math.max(1, data.unlocked[difficulty] ?? 1);
	},

	setUnlocked(difficulty: Difficulty, stageId: number): void {
		const data = readData();
		const prev = data.unlocked[difficulty] ?? 1;
		if (stageId > prev) {
			data.unlocked[difficulty] = stageId;
			writeData(data);
		}
	},

	// === 最佳結局（依難度，good 優於 bad）===
	getBestEnding(difficulty: Difficulty): Ending | null {
		const data = readData();
		return data.bestEnding[difficulty] ?? null;
	},

	setBestEnding(difficulty: Difficulty, ending: Ending): void {
		const data = readData();
		const prev = data.bestEnding[difficulty];
		// good 優於 bad，已經 good 的話不退回
		if (prev === "good" && ending === "bad") return;
		data.bestEnding[difficulty] = ending;
		writeData(data);
	},

	// === CG 收集（跨難度共享）===
	getUnlockedCgs(): string[] {
		return readData().unlockedCgs;
	},

	isCgUnlocked(cgKey: string): boolean {
		return readData().unlockedCgs.includes(cgKey);
	},

	unlockCg(cgKey: string): boolean {
		const data = readData();
		if (data.unlockedCgs.includes(cgKey)) return false;
		data.unlockedCgs.push(cgKey);
		writeData(data);
		return true;
	},

	// === 成就解鎖（跨難度共享）===
	getUnlockedAchievements(): string[] {
		return readData().unlockedAchievements;
	},

	isAchievementUnlocked(id: string): boolean {
		return readData().unlockedAchievements.includes(id);
	},

	// 解鎖一個成就。回傳 true 表示這次是新解鎖（用來決定要不要彈出通知）。
	unlockAchievement(id: string): boolean {
		const data = readData();
		if (data.unlockedAchievements.includes(id)) return false;
		data.unlockedAchievements.push(id);
		writeData(data);
		return true;
	},

	// === 已完成關卡總次數（成就「安鼠鐵粉」用，不分輸贏）===
	getStagesCompleted(): number {
		return readData().stagesCompleted;
	},

	incrementStagesCompleted(): number {
		const data = readData();
		data.stagesCompleted += 1;
		writeData(data);
		return data.stagesCompleted;
	},

	// === 垂死掙扎累計（成就「垂死掙扎」用，跨 session）===
	getLastGaspCount(): number {
		return readData().lastGaspCount;
	},

	incrementLastGaspCount(): number {
		const data = readData();
		data.lastGaspCount += 1;
		writeData(data);
		return data.lastGaspCount;
	},

	// === 生存模式最高紀錄（兩者完全獨立累計）===
	getSurvivalBest(): { sec: number; score: number } {
		const data = readData();
		return { sec: data.survivalBestSec, score: data.survivalBestScore };
	},

	updateSurvivalBest(sec: number, score: number): void {
		const data = readData();
		let dirty = false;
		if (sec > data.survivalBestSec) {
			data.survivalBestSec = sec;
			dirty = true;
		}
		if (score > data.survivalBestScore) {
			data.survivalBestScore = score;
			dirty = true;
		}
		if (dirty) writeData(data);
	},

	// === 上次選擇的難度（明碼存，純 UI 預選用，不算成就）===
	getLastDifficulty(): Difficulty | null {
		try {
			const raw = localStorage.getItem(KEY_DIFFICULTY);
			return raw === "easy" || raw === "normal" || raw === "hard" ? raw : null;
		} catch {
			return null;
		}
	},

	setLastDifficulty(d: Difficulty): void {
		try {
			localStorage.setItem(KEY_DIFFICULTY, d);
		} catch {
			// 忽略
		}
	},
};
