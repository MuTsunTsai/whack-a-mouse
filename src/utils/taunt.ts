// 市長角色台詞庫 — 諷刺類型遊戲的氛圍核心

import { pickRandom } from "./random.ts";

// 點擊到老鼠時偶發的「政績宣示」
export const HIT_MOUSE_LINES = [
	"謝謝指教！",
	"市民有感！",
	"市政府全力以赴。",
	"我會看辦理進度。",
	"絕對親力親為。",
];

// 誤傷毛孩或天敵時的「卸責台詞」
export const MISS_KILL_LINES = [
	"這要問中央。",
	"環保局會檢討。",
	"依 SOP 處理。",
	"還同仁一個公道。",
	"通報量沒有異常增加。",
];

// 集氣完成、釋放老鼠藥時
export const BOMB_LINES = [
	"全市投藥！",
	"加碼 4750 公斤！",
	"第二代抗凝血劑出動。",
	"讓老鼠無所遁形！",
];

// Game Over：因漢他倒數歸零而失敗
export const HANTA_GAME_OVER_LINES = [
	"市民因漢他病毒身亡，您該下台了。",
	"您只會說謝謝，鼠患沒解決。",
	"議員質詢，您依然跳針。",
];

// Game Over：因關卡結束但分數不足
export const STAGE_FAIL_LINES = [
	"議員們再次質詢，為什麼辦事不力？",
	"市民投書：市長到底在做什麼？",
	"鼠跡地圖上又多了一塊紅。",
];

// 五關全破彩蛋
export const ALL_CLEAR_LINES = [
	"市長您打了 {{mouse}} 隻老鼠，誤傷 {{innocent}} 隻天敵與毛孩。",
	"全市撒了上萬公斤毒餌，老鷹卻先死了。",
	"安鼠之亂落幕，但下一場呢？",
];

export function pickHitMouse(): string {
	return pickRandom(HIT_MOUSE_LINES);
}

export function pickMissKill(): string {
	return pickRandom(MISS_KILL_LINES);
}

export function pickBomb(): string {
	return pickRandom(BOMB_LINES);
}

export function pickHantaGameOver(): string {
	return pickRandom(HANTA_GAME_OVER_LINES);
}

export function pickStageFail(): string {
	return pickRandom(STAGE_FAIL_LINES);
}

export function fillTemplate(tpl: string, vars: Record<string, string | number>): string {
	return tpl.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(vars[key] ?? ""));
}
