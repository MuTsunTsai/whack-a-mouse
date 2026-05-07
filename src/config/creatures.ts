// 生物表：每種生物的頭像 + 變體數量
// 動畫由 Phaser tween 處理（彈出、縮回、被打震動、掉回洞口）
//
// 資產規格：
//   - 基本檔名：{type}-normal.png / {type}-stunned.png（單一變體時）
//   - 多變體檔名：{type}-normal-1.png ~ {type}-normal-N.png，stunned 同理
//   - 為向下相容：如果定義有變體，遊戲會優先抽變體；若所有變體都缺，會 fallback 到無編號的版本
//   - 尺寸建議：384×384，只畫頭部
//   - 背景：亮綠色純色（#00ff00），方便事後手動去背
//   - 程式載入後若使用者已去背為透明，直接顯示；若仍為綠底，遊戲端不另外處理

export type CreatureType = "mouse" | "cat" | "dog" | "owl" | "hawk";

export type CreatureState = "normal" | "stunned";

export interface CreatureDef {
	type: CreatureType;
	emoji: string;
	displayName: string;
	hitScore: number;
	bombScore: number;
	chargeGain: number;
	hantaDelta: number;
	tauntOnHit: "good" | "miss";
	// 各狀態的變體數量。值為 N 代表預期有 {type}-{state}-1.png ~ {type}-{state}-N.png
	// 值為 1（預設）代表只有單一變體，使用 {type}-{state}.png
	normalVariants: number;
	stunnedVariants: number;
}

export const CREATURES: Record<CreatureType, CreatureDef> = {
	mouse: {
		type: "mouse",
		emoji: "🐭",
		displayName: "老鼠",
		hitScore: 10,
		bombScore: 10,
		chargeGain: 10,
		hantaDelta: 0.2,
		tauntOnHit: "good",
		// 老鼠出現頻率最高，多種變體增加趣味
		normalVariants: 4,
		stunnedVariants: 2,
	},
	cat: {
		type: "cat",
		emoji: "🐱",
		displayName: "毛孩貓",
		hitScore: -20,
		bombScore: -15,
		chargeGain: 5,
		hantaDelta: -3,
		tauntOnHit: "miss",
		normalVariants: 1,
		stunnedVariants: 1,
	},
	dog: {
		type: "dog",
		emoji: "🐶",
		displayName: "毛孩狗",
		hitScore: -20,
		bombScore: -15,
		chargeGain: 4,
		hantaDelta: -3,
		tauntOnHit: "miss",
		normalVariants: 1,
		stunnedVariants: 1,
	},
	owl: {
		type: "owl",
		emoji: "🦉",
		displayName: "貓頭鷹",
		hitScore: -30,
		bombScore: -20,
		chargeGain: 3,
		hantaDelta: -3,
		tauntOnHit: "miss",
		normalVariants: 1,
		stunnedVariants: 1,
	},
	hawk: {
		type: "hawk",
		emoji: "🦅",
		displayName: "黑鳶",
		hitScore: -40,
		bombScore: -30,
		chargeGain: 2,
		hantaDelta: -3,
		tauntOnHit: "miss",
		normalVariants: 1,
		stunnedVariants: 1,
	},
};

/**
 * 基本鍵（單一變體）：{type}-{state}
 */
export function imageKey(type: CreatureType, state: CreatureState): string {
	return `${type}-${state}`;
}

/**
 * 變體鍵：{type}-{state}-{n}（n 從 1 起算）
 */
export function variantImageKey(type: CreatureType, state: CreatureState, variant: number): string {
	return `${type}-${state}-${variant}`;
}

/**
 * 隨機抽一張該狀態的可用變體 texture key。
 * 規則：
 *   1. 從定義的 N 個變體中找「目前 textures.exists」者，隨機抽一
 *   2. 若所有變體都缺、檢查無編號的基本鍵
 *   3. 都沒有則回傳 null（呼叫端自行處理 fallback，例如顯示 emoji）
 */
export function pickVariantKey(
	type: CreatureType,
	state: CreatureState,
	textureExists: (key: string) => boolean,
): string | null {
	const def = CREATURES[type];
	const count = state === "normal" ? def.normalVariants : def.stunnedVariants;

	const available: string[] = [];
	for (let i = 1; i <= count; i += 1) {
		const key = variantImageKey(type, state, i);
		if (textureExists(key)) available.push(key);
	}
	if (available.length > 0) {
		const idx = Math.floor(Math.random() * available.length);
		return available[idx]!;
	}

	// fallback：無編號的單一變體
	const baseKey = imageKey(type, state);
	if (textureExists(baseKey)) return baseKey;

	return null;
}

/**
 * BootScene 用：列出所有可能的圖檔 key，包含每個變體 + 無編號 fallback。
 * 載入器對找不到的檔案會靜默忽略（resolveImageUrl 已實作此行為）。
 */
export function getAllCreatureImages(): Array<{ key: string; name: string }> {
	const out: Array<{ key: string; name: string }> = [];
	for (const def of Object.values(CREATURES)) {
		for (const state of ["normal", "stunned"] as CreatureState[]) {
			const variants = state === "normal" ? def.normalVariants : def.stunnedVariants;
			// 多變體：載入 1..N
			if (variants > 1) {
				for (let i = 1; i <= variants; i += 1) {
					const key = variantImageKey(def.type, state, i);
					out.push({ key, name: key });
				}
			}
			// 同時保留無編號版本當作 fallback
			const baseKey = imageKey(def.type, state);
			out.push({ key: baseKey, name: baseKey });
		}
	}
	return out;
}
