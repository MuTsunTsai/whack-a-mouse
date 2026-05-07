// 永遠覆蓋在所有 scene 上層的靜音切換按鈕
//
// 由 BootScene 在資源載入完成後 launch（不是 start，避免取代主場景），
// 之後一直存在於 scene manager 中、永不關閉。

import Phaser from "phaser";
import { MuteSystem } from "../systems/MuteSystem.ts";
import { applyDefaultTextStyle } from "../utils/text.ts";

const ICON_SIZE = 44;
const MARGIN = 16;
const PRESS_SCALE = 0.85; // 按下時微微縮小

export class MuteToggleScene extends Phaser.Scene {
	constructor() {
		super({ key: "MuteToggleScene", active: false });
	}

	// 透明的點擊感應區（仍存在以接收 pointer 事件，但不繪製外觀）
	private hitArea!: Phaser.GameObjects.Zone;
	private iconImage?: Phaser.GameObjects.Image;
	private iconText?: Phaser.GameObjects.Text;

	create(): void {
		const { width } = this.scale;
		const x = width - MARGIN - ICON_SIZE / 2;
		const y = MARGIN + ICON_SIZE / 2;

		// 純粹的點擊感應區，沒有任何視覺
		this.hitArea = this.add
			.zone(x, y, ICON_SIZE, ICON_SIZE)
			.setOrigin(0.5)
			.setInteractive({ useHandCursor: true })
			.setDepth(1000);

		this.refreshIcon();

		this.hitArea.on("pointerdown", () => {
			MuteSystem.toggle(this.game);
			this.refreshIcon();
			this.playPressFeedback();
		});

		this.scale.on("resize", () => this.reposition());
	}

	private playPressFeedback(): void {
		// 圖片版用 displayWidth / displayHeight tween（避開 setDisplaySize 改寫 scale 的副作用），
		// emoji 文字版可直接 tween scale（因為它沒被 setDisplaySize 改過）
		if (this.iconImage) {
			const baseW = ICON_SIZE;
			const baseH = ICON_SIZE;
			this.tweens.add({
				targets: this.iconImage,
				displayWidth: baseW * PRESS_SCALE,
				displayHeight: baseH * PRESS_SCALE,
				duration: 80,
				yoyo: true,
			});
		} else if (this.iconText) {
			this.tweens.add({
				targets: this.iconText,
				scale: PRESS_SCALE,
				duration: 80,
				yoyo: true,
			});
		}
	}

	private reposition(): void {
		const { width } = this.scale;
		const x = width - MARGIN - ICON_SIZE / 2;
		const y = MARGIN + ICON_SIZE / 2;
		this.hitArea.setPosition(x, y);
		(this.iconImage ?? this.iconText)?.setPosition(x, y);
	}

	private refreshIcon(): void {
		const { width } = this.scale;
		const x = width - MARGIN - ICON_SIZE / 2;
		const y = MARGIN + ICON_SIZE / 2;
		const muted = MuteSystem.isMuted();
		const imageKey = muted ? "icon-sound-off" : "icon-sound-on";

		this.iconImage?.destroy();
		this.iconImage = undefined;
		this.iconText?.destroy();
		this.iconText = undefined;

		if (this.textures.exists(imageKey)) {
			this.iconImage = this.add
				.image(x, y, imageKey)
				.setDisplaySize(ICON_SIZE, ICON_SIZE)
				.setDepth(1001);
		} else {
			const emoji = muted ? "🔇" : "🔊";
			this.iconText = this.add
				.text(x, y, emoji, applyDefaultTextStyle({ fontSize: "28px" }))
				.setOrigin(0.5)
				.setDepth(1001);
		}
	}
}
