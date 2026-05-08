// 成就解鎖彈跳通知
//
// 在達成之後的下一個結算畫面（GameOverScene / EndingScene）顯示。
// 多個成就會依序排隊播放：點任意處或 AUTO_CLOSE_MS 後關閉，下一個自動接上。

import Phaser from "phaser";
import { ACHIEVEMENTS, type Achievement } from "../config/achievements.ts";
import { SfxSystem } from "../systems/SfxSystem.ts";
import { addText } from "./text.ts";

const AUTO_CLOSE_MS = 4000;
const SHOW_DELAY_MS = 1200; // 進畫面後延遲，避免遮住結算文字

/**
 * 顯示一批成就解鎖通知（依序排隊）。
 * 傳入的 ids 會過濾出 ACHIEVEMENTS 中存在的項目；不存在的靜默忽略。
 */
export function showAchievementUnlockedPopups(scene: Phaser.Scene, ids: string[]): void {
	const queue: Achievement[] = ids
		.map((id) => ACHIEVEMENTS.find((a) => a.id === id))
		.filter((a): a is Achievement => !!a);
	if (queue.length === 0) return;

	scene.time.delayedCall(SHOW_DELAY_MS, () => playNext(scene, queue));
}

function playNext(scene: Phaser.Scene, queue: Achievement[]): void {
	const entry = queue.shift();
	if (!entry) return;

	const { width, height } = scene.scale;
	const layer = scene.add.container(0, 0).setDepth(3000);

	// 全螢幕暗底（攔截點擊；點任意處關閉）
	const overlay = scene.add
		.rectangle(width / 2, height / 2, width, height, 0x000000, 0.8)
		.setInteractive();
	layer.add(overlay);

	// 卡片底圖
	const cardW = 320;
	const cardH = 448;
	const cardY = height / 2 - 40;

	const cardBg = scene.add
		.rectangle(width / 2, cardY, cardW, cardH, 0x333344, 1)
		.setStrokeStyle(3, 0xffeb70);
	layer.add(cardBg);

	if (scene.textures.exists(entry.cardKey)) {
		const card = scene.add.image(width / 2, cardY, entry.cardKey);
		const scale = Math.min(cardW / card.width, cardH / card.height);
		card.setScale(scale);
		layer.add(card);
	}

	// 「🏆 成就解鎖」標題
	const banner = addText(scene, width / 2, cardY - cardH / 2 - 28, "🏆 成就解鎖", {
		fontSize: "26px",
		color: "#ffeb70",
		fontStyle: "bold",
		stroke: "#000000",
		strokeThickness: 4,
	}).setOrigin(0.5);
	layer.add(banner);

	// 名稱
	const titleText = addText(scene, width / 2, cardY + cardH / 2 + 28, entry.title, {
		fontSize: "26px",
		color: "#ffffff",
		fontStyle: "bold",
		stroke: "#000000",
		strokeThickness: 4,
		align: "center",
	}).setOrigin(0.5);
	layer.add(titleText);

	// 條件說明
	const descText = addText(scene, width / 2, cardY + cardH / 2 + 68, entry.description, {
		fontSize: "20px",
		color: "#cccccc",
		align: "center",
		lineSpacing: 6,
		stroke: "#000000",
		strokeThickness: 3,
		wordWrap: { width: width - 120 },
	}).setOrigin(0.5);
	layer.add(descText);

	// 入場 tween：scale 0.7 → 1.0
	layer.setScale(0.7);
	layer.setAlpha(0);
	scene.tweens.add({
		targets: layer,
		scale: 1,
		alpha: 1,
		duration: 220,
		ease: "Back.Out",
	});

	SfxSystem.play(scene, "sfx-click");

	let closed = false;
	const close = (): void => {
		if (closed) return;
		closed = true;
		scene.tweens.add({
			targets: layer,
			alpha: 0,
			duration: 180,
			onComplete: () => {
				layer.destroy();
				playNext(scene, queue);
			},
		});
	};

	overlay.on("pointerdown", () => {
		SfxSystem.play(scene, "sfx-click");
		close();
	});
	scene.time.delayedCall(AUTO_CLOSE_MS, close);
}
