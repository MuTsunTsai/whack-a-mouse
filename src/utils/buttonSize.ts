// 依 texture 實際長寬比動態算按鈕呈現尺寸
//
// 為什麼需要：
//   AI 產生的 spritesheet 切片後，每個 frame 的長寬比固定但每組不同（btn-set 約 1.56:1、
//   btn-difficulty-set 約 1.06:1、card-stage-set 約 0.72:1 直立）。場景若寫死 displaySize
//   會擠壓圖片。改為「給定目標高度，寬度由 aspect 算」。
//
// 用法：
//   const { width, height } = buttonSizeFromTexture(scene, "btn-replay", { targetH: 100 });
//   // 圖片存在 → width = 100 × aspect、height = 100
//   // 圖片缺失 → width = fallbackW、height = fallbackH（給 rectangle fallback 用）

import type Phaser from "phaser";

export interface ButtonSizeOpts {
	/** 圖片版的目標高度（寬度由 aspect 自動算） */
	targetH: number;
	/** 圖片缺失時的 fallback 寬度（rectangle 版） */
	fallbackW?: number;
	/** 圖片缺失時的 fallback 高度（rectangle 版） */
	fallbackH?: number;
}

export interface ButtonSize {
	/** 呈現用寬度 */
	width: number;
	/** 呈現用高度 */
	height: number;
	/** 該 texture 是否存在（圖片版 true、fallback 版 false） */
	useImage: boolean;
}

/**
 * 依 texture 實際長寬比算按鈕尺寸。
 *  - 圖片存在 → height = targetH、width = targetH × (texW / texH)
 *  - 圖片缺失 → height/width = fallback（給 rectangle 用）
 */
export function buttonSizeFromTexture(
	scene: Phaser.Scene,
	textureKey: string,
	opts: ButtonSizeOpts,
): ButtonSize {
	if (scene.textures.exists(textureKey)) {
		const src = scene.textures.get(textureKey).getSourceImage() as { width: number; height: number };
		const aspect = src.width / src.height;
		return {
			width: Math.round(opts.targetH * aspect),
			height: opts.targetH,
			useImage: true,
		};
	}
	return {
		width: opts.fallbackW ?? 120,
		height: opts.fallbackH ?? 40,
		useImage: false,
	};
}
