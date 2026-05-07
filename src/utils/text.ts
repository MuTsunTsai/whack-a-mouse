// Phaser Text 包裝：
// 1. 中文字（萬、鼠 等）頂部裁切問題 → 加 padding.y
// 2. 高 DPR 螢幕模糊問題 → resolution: devicePixelRatio
//    Phaser Text 內部用 canvas 繪字，再貼到主 canvas；若 resolution=1，
//    在 retina 螢幕上會被瀏覽器再次放大，造成糊邊。設成 DPR 後文字以實體像素渲染。

import Phaser from "phaser";

const FONT_FAMILY = '"Microsoft JhengHei", "PingFang TC", "Noto Sans TC", "Helvetica Neue", Arial, sans-serif';

// 取一次裝置 DPR，最低 2 確保 1x 螢幕也夠銳利
const TEXT_RESOLUTION = Math.max(2, Math.round(window.devicePixelRatio || 1));

export function applyDefaultTextStyle(
	style: Phaser.Types.GameObjects.Text.TextStyle,
): Phaser.Types.GameObjects.Text.TextStyle {
	const fontSizeStr = typeof style.fontSize === "number" ? `${style.fontSize}px` : style.fontSize ?? "16px";
	const num = parseInt(fontSizeStr, 10);
	const padY = Math.max(4, Math.ceil(num * 0.18));
	const padX = Math.max(2, Math.ceil(num * 0.06));

	return {
		fontFamily: FONT_FAMILY,
		resolution: TEXT_RESOLUTION,
		...style,
		padding: style.padding ?? { x: padX, y: padY },
	};
}

// 包裝 scene.add.text 以自動加上 padding、字體與高解析度
export function addText(
	scene: Phaser.Scene,
	x: number,
	y: number,
	text: string | string[],
	style: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.GameObjects.Text {
	return scene.add.text(x, y, text, applyDefaultTextStyle(style));
}
