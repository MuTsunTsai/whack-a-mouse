// 共用 UI 按鈕：包覆「圖片有就用、沒有 fallback rectangle」+ hover 放大 5% +
// pointerdown 縮 0.92 yoyo 的常見邏輯。
//
// 文字垂直置中對齊圖片中心；圖片版的文字水平位置可能要稍微往右偏（因為按鈕左 1/3 是
// 圖示徽章）— 透過 textOffsetX 控制。

import type Phaser from "phaser";
import { SfxSystem } from "../systems/SfxSystem.ts";
import { addText } from "./text.ts";
import { buttonSizeFromTexture } from "./buttonSize.ts";

/**
 * 全域底圖縮放倍率（只縮底圖、文字字級不縮）。
 * 若覺得 AI 產出的按鈕視覺上太大，調這個值即可影響所有 makeButton 呼叫。
 */
const IMAGE_SCALE = 0.7;

export interface MakeButtonOpts {
	scene: Phaser.Scene;
	x: number;
	y: number;
	/** 圖片版的目標高度，寬度由 texture aspect 自動算 */
	targetH: number;
	/** 圖片缺失時的 fallback 寬度 */
	fallbackW: number;
	/** 圖片缺失時的 fallback 高度 */
	fallbackH: number;
	/** texture key（btn-set 切片之一，例如 btn-replay）；不存在會 fallback */
	textureKey: string;
	/** 純色 fallback 用的底色 */
	fallbackColor: number;
	/** 按鈕文字（中文）*/
	label: string;
	/** 文字字級 */
	fontSize?: string;
	/** 圖片版的文字水平偏移（按鈕左 1/3 是圖示徽章 → 文字往右偏） */
	textOffsetX?: number;
	/** 點擊回呼 */
	onClick: () => void;
}

export interface MadeButton {
	bg: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
	text: Phaser.GameObjects.Text;
	width: number;
	height: number;
	useImage: boolean;
}

/**
 * 建立一顆按鈕。垂直方向：文字 origin 0.5、座標就是按鈕中心 → 自然置中。
 * 水平方向：圖片版按 textOffsetX 往右偏（按鈕左側是圖示徽章）；rectangle 版置中。
 */
export function makeButton(opts: MakeButtonOpts): MadeButton {
	const {
		scene, x, y,
		targetH, fallbackW, fallbackH,
		textureKey, fallbackColor,
		label, fontSize = "22px",
		textOffsetX,
		onClick,
	} = opts;

	const { width: rawW, height: rawH, useImage } = buttonSizeFromTexture(scene, textureKey, {
		targetH, fallbackW, fallbackH,
	});

	// 底圖實際呈現尺寸 = 計算尺寸 × IMAGE_SCALE（模組常數；rectangle fallback 不縮，仍維持原大小確保命中）
	const width = useImage ? rawW * IMAGE_SCALE : rawW;
	const height = useImage ? rawH * IMAGE_SCALE : rawH;

	const bg: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle = useImage
		? scene.add.image(x, y, textureKey).setDisplaySize(width, height)
		: scene.add
			.rectangle(x, y, width, height, fallbackColor, 1)
			.setStrokeStyle(2, 0xffffff, 0.7);
	bg.setInteractive({ useHandCursor: true });

	// 文字垂直始終置中於 (x, y)；水平：圖片版有 textOffsetX 偏移、rectangle 版置中
	// textOffsetX 預設用「縮過後的 width」算，這樣縮小底圖時文字也會跟著貼緊圖示徽章
	const dx = useImage ? (textOffsetX ?? width * 0.15) : 0;
	const text = addText(scene, x + dx, y, label, {
		fontSize,
		color: "#ffffff",
		fontStyle: "bold",
		stroke: "#000000",
		strokeThickness: 3,
	}).setOrigin(0.5);

	if (useImage) {
		const img = bg as Phaser.GameObjects.Image;
		bg.on("pointerover", () => {
			scene.tweens.add({ targets: img, displayWidth: width * 1.05, displayHeight: height * 1.05, duration: 120, ease: "Quad.Out" });
			scene.tweens.add({ targets: text, scale: 1.05, duration: 120, ease: "Quad.Out" });
		});
		bg.on("pointerout", () => {
			scene.tweens.add({ targets: img, displayWidth: width, displayHeight: height, duration: 120, ease: "Quad.Out" });
			scene.tweens.add({ targets: text, scale: 1, duration: 120, ease: "Quad.Out" });
		});
	} else {
		const rect = bg as Phaser.GameObjects.Rectangle;
		bg.on("pointerover", () => rect.setFillStyle(fallbackColor + 0x222222));
		bg.on("pointerout", () => rect.setFillStyle(fallbackColor));
	}

	bg.on("pointerdown", () => {
		SfxSystem.play(scene, "sfx-click");
		if (useImage) {
			const img = bg as Phaser.GameObjects.Image;
			scene.tweens.add({ targets: img, displayWidth: width * 0.92, displayHeight: height * 0.92, duration: 80, yoyo: true });
			scene.tweens.add({ targets: text, scale: 0.92, duration: 80, yoyo: true, onComplete: onClick });
		} else {
			scene.tweens.add({ targets: [bg, text], scale: 0.92, duration: 80, yoyo: true, onComplete: onClick });
		}
	});

	return { bg, text, width, height, useImage };
}
