// 生物視覺微調：用於處理 AI 生成圖檔內部「角色不一定在畫布正中央」造成的偏移問題。
//
// 您觀察到 AI 產出的素材，動物的頭部不會剛好在畫面正中央——可能稍微偏左、偏上、
// 或是身體佔比與其他角色不一致。透過此處的參數，可在不重新出圖的情況下微調呈現。
//
// 四種可調項：
//   1. global：所有生物共通的偏移與顯示尺寸（少用、通常維持預設）
//   2. perType：每種生物獨立的偏移（dx, dy）與顯示尺寸倍率（sizeMul）
//   3. variantOverrides：每張變體圖獨立覆寫（針對 mouse-normal-2 等個別調）
//      會與 perType 合併（per-variant 的非 undefined 值會蓋掉 perType 的值）
//   4. 動畫位置（emergeOffsetY / hiddenOffsetY）：影響所有生物共通
//
// 數值正負約定（與 Phaser 座標一致）：
//   dx: 正值往右、負值往左
//   dy: 正值往下、負值往上
//   sizeMul: 1.0 = 不變；> 1 放大、< 1 縮小
//
// 編輯時：改完數值，重整網頁即可生效（不需重新 build）

import type { CreatureType } from "./creatures.ts";

interface CreatureOffset {
	/** 水平微調（px，相對洞口中心線） */
	dx: number;
	/** 垂直微調（px，相對冒出位置） */
	dy: number;
	/** 顯示尺寸倍率，base 是全域 displaySize */
	sizeMul: number;
	/** 若非 undefined 則覆蓋全域的 emerge offset y（冒出後相對洞口的高度） */
	emergeOffsetY?: number;
}

/** 部分覆寫：每張變體只需要寫想改的欄位 */
type CreatureOffsetPatch = Partial<CreatureOffset>;

export const CREATURE_VISUAL = {
	// === 全域基準 ===
	displaySize: 140, // 邏輯像素：圖檔顯示為 140×140
	emergeOffsetY: -56, // 冒出後高度（負 = 高於洞口中心）
	hiddenOffsetY: 30, // 縮回 / 初始 時相對洞口的 y 偏移
	breathingAmplitude: 4, // 待機時上下擺動幅度

	// === 每種生物的個別微調（適用所有變體的「基準」）===
	perType: {
		mouse: { dx: -10, dy: 15, sizeMul: 1.0 },
		cat: { dx: 0, dy: 15, sizeMul: 1.0 },
		dog: { dx: 0, dy: 15, sizeMul: 1.0 },
		owl: { dx: 0, dy: 15, sizeMul: 0.95 },
		hawk: { dx: 0, dy: 15, sizeMul: 0.95 },
	} satisfies Record<CreatureType, CreatureOffset>,

	// === 每張變體圖的獨立覆寫 ===
	// key = texture key（例如 "mouse-normal-1"），value = 部分欄位覆寫。
	// 沒列在這的變體就純用 perType 基準。每個欄位 undefined 代表沿用 perType。
	//
	// 示範：mouse-normal-2 想再往下 5px、size 略大 1.1×：
	//   "mouse-normal-2": { dy: 15, sizeMul: 1.1 },
	//
	// 注意：
	// - dy 是「絕對值」（覆蓋 perType.dy）、不是「在 perType.dy 上加減」
	// - stunned 變體的 dx/dy/sizeMul 不會生效（被打時切換 texture 不會重新調位置，
	//   避免切換瞬間跳位；stunned 變體的設定請只用於 emergeOffsetY 之外）
	variantOverrides: {
		"mouse-normal-1": {},
		"mouse-normal-2": { dx: 10, dy: 15 },
		"mouse-normal-3": {},
		"mouse-normal-4": { dx: 0, dy: 15 },
		"mouse-stunned-1": {},
		"mouse-stunned-2": {},
		// 其他生物若日後加變體，也用同樣格式新增即可
	} satisfies Record<string, CreatureOffsetPatch>,
};

/**
 * 取得最終生效的 offset：
 * 1. 先取 perType[type] 當基準
 * 2. 若 imageKey 在 variantOverrides 裡，將該 patch 合併蓋上
 *
 * Creature 建立時把選中的 variant key 傳進來，獲得對應的 offset。
 */
export function getCreatureOffset(type: CreatureType, imageKey?: string): CreatureOffset {
	const base: CreatureOffset = CREATURE_VISUAL.perType[type];
	if(!imageKey) return base;
	const patch = (CREATURE_VISUAL.variantOverrides as Record<string, CreatureOffsetPatch>)[imageKey];
	if(!patch) return base;
	return {
		dx: patch.dx ?? base.dx,
		dy: patch.dy ?? base.dy,
		sizeMul: patch.sizeMul ?? base.sizeMul,
		emergeOffsetY: patch.emergeOffsetY ?? base.emergeOffsetY,
	};
}
