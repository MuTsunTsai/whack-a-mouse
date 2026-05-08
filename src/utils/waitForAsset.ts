// 場景 create() 內等待延後資源載入用的小工具
//
// 用法：
//   create() {
//     // 先做需要立刻顯示的 UI（背景、標題等）
//     waitForAsset(this, "bgm-game-boss", () => {
//       // 真正會用到該資源的程式（例如播 BGM、用該圖）放這裡
//       MusicSystem.play(this, "bgm-game-boss");
//     });
//   }
//
// 行為：
//   - 若 LazyLoader 已就緒：立即同步呼叫 then()
//   - 若還在背景下載：在畫面中央彈出半透明 loading 文字、等載完才呼叫 then()
//   - 若 key 不在延後清單內：等同已就緒（立即呼叫）
//   - 若資源檔案實際不存在（HEAD 失敗）：仍會呼叫 then()，由呼叫端自行 fallback

import Phaser from "phaser";
import { LazyLoader } from "../systems/LazyLoader.ts";
import { addText } from "./text.ts";

export function waitForAsset(
	scene: Phaser.Scene,
	key: string,
	then: () => void,
): void {
	if (LazyLoader.isReady(key)) {
		then();
		return;
	}

	// 顯示 loading（半透明蓋板 + 文字）
	const { width, height } = scene.scale;
	const overlay = scene.add
		.rectangle(width / 2, height / 2, width, height, 0x000000, 0.55)
		.setDepth(9000);
	const label = addText(scene, width / 2, height / 2, "資源載入中…", {
		fontSize: "32px",
		color: "#ffffff",
		fontStyle: "bold",
		stroke: "#000000",
		strokeThickness: 5,
	}).setOrigin(0.5).setDepth(9001);

	// 簡單的呼吸動畫，避免畫面靜止顯得卡住
	const tween = scene.tweens.add({
		targets: label,
		alpha: 0.5,
		duration: 600,
		yoyo: true,
		repeat: -1,
		ease: "Sine.InOut",
	});

	void LazyLoader.waitFor(key).then(() => {
		tween.stop();
		overlay.destroy();
		label.destroy();
		// scene 可能在等待中已被切換掉 → 用 isActive 檢查避免在死掉的 scene 上跑邏輯
		if (scene.scene.isActive()) {
			then();
		}
	});
}
