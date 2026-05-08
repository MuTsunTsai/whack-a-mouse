// CG 回憶（畫廊）：顯示已收集的插畫
//
// 流程：縮圖網格 → 點擊已解鎖縮圖 → 全螢幕大圖檢視 → 點任意處返回網格

import Phaser from "phaser";
import { GALLERY_ENTRIES, type GalleryEntry } from "../config/gallery.ts";
import { MusicSystem } from "../systems/MusicSystem.ts";
import { SaveSystem } from "../systems/SaveSystem.ts";
import { SfxSystem } from "../systems/SfxSystem.ts";
import { makeButton } from "../utils/button.ts";
import { buttonSizeFromTexture } from "../utils/buttonSize.ts";
import { addText } from "../utils/text.ts";

// 3-4-3 陣型：第一列 3 張、第二列 4 張、第三列 3 張，共 10 張
const ROW_COUNTS = [3, 4, 3];
const CARD_WIDTH = 260;
const CARD_HEIGHT = 146; // 16:9 aspect（260 × 146）
const CARD_GAP = 18;

export class GalleryScene extends Phaser.Scene {
	constructor() {
		super({ key: "GalleryScene" });
	}

	private fullViewLayer?: Phaser.GameObjects.Container;

	create(): void {
		const { width, height } = this.scale;
		this.cameras.main.setBackgroundColor("#1e1e2e");
		MusicSystem.play(this, "bgm-title");

		// 標題
		addText(this, width / 2, 50, "CG 回憶", {
			fontSize: "36px",
			color: "#ffeb70",
			fontStyle: "bold",
			stroke: "#000000",
			strokeThickness: 4,
		}).setOrigin(0.5);

		const unlockedCount = GALLERY_ENTRIES.filter((e) =>
			SaveSystem.isCgUnlocked(e.cgKey),
		).length;
		addText(this, width / 2 + 150, 50, `已收集 ${unlockedCount} / ${GALLERY_ENTRIES.length}`, {
			fontSize: "20px",
			color: "#aaaaaa",
		}).setOrigin(0.5);

		// 網格佈局：3-4-3 陣型（共 10 張）。每列獨立置中，列之間固定間距。
		const rows = ROW_COUNTS.length;
		const totalH = rows * CARD_HEIGHT + (rows - 1) * CARD_GAP;
		const startY = (height - totalH) / 2 + CARD_HEIGHT / 2 + 20;

		let cursor = 0;
		ROW_COUNTS.forEach((count, rowIndex) => {
			const rowW = count * CARD_WIDTH + (count - 1) * CARD_GAP;
			const rowStartX = (width - rowW) / 2 + CARD_WIDTH / 2;
			const y = startY + rowIndex * (CARD_HEIGHT + CARD_GAP);
			for (let c = 0; c < count; c++) {
				const entry = GALLERY_ENTRIES[cursor];
				if (!entry) return;
				const x = rowStartX + c * (CARD_WIDTH + CARD_GAP);
				this.makeCard(x, y, entry);
				cursor += 1;
			}
		});

		// 返回按鈕：左下角，按鈕中心 X 留 80px margin → 算法為 width/2 + margin
		const backSize = buttonSizeFromTexture(this, "btn-back", { targetH: 90, fallbackW: 120, fallbackH: 40 });
		makeButton({
			scene: this,
			x: 24 + backSize.width / 2, y: height - 40,
			targetH: 90, fallbackW: 120, fallbackH: 40,
			textureKey: "btn-back", fallbackColor: 0x444444,
			label: "主選單", fontSize: "22px",
			onClick: () => this.scene.start("TitleScene"),
		});
	}

	private makeCard(x: number, y: number, entry: GalleryEntry): void {
		const unlocked = SaveSystem.isCgUnlocked(entry.cgKey);
		const hasTexture = unlocked && this.textures.exists(entry.cgKey);

		const cardBg = this.add
			.rectangle(x, y, CARD_WIDTH, CARD_HEIGHT, unlocked ? 0x333344 : 0x222230, 1)
			.setStrokeStyle(2, unlocked ? 0xffffff : 0x555555);

		let thumb: Phaser.GameObjects.Image | undefined;
		if (hasTexture) {
			thumb = this.add.image(x, y, entry.cgKey);
			// 等比覆蓋（保留原比例填滿卡片，超出處被卡片切掉）
			const scale = Math.max(CARD_WIDTH / thumb.width, CARD_HEIGHT / thumb.height);
			thumb.setScale(scale);
			// 用 mask 限制顯示在卡片範圍內
			const mask = this.make.graphics();
			mask.fillStyle(0xffffff);
			mask.fillRect(x - CARD_WIDTH / 2, y - CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT);
			thumb.setMask(mask.createGeometryMask());
		}

		// 標題或鎖頭：未解鎖只顯示 🔒，不洩露任何說明（吊人胃口）
		if (unlocked) {
			addText(this, x, y + CARD_HEIGHT / 2 - 18, entry.title, {
				fontSize: "20px",
				color: "#ffffff",
				backgroundColor: "#000000aa",
				stroke: "#000000",
				strokeThickness: 2,
			}).setOrigin(0.5);
		} else {
			addText(this, x, y, "🔒", {
				fontSize: "48px",
			}).setOrigin(0.5);
		}

		// 互動：已解鎖才能點擊放大
		cardBg.setInteractive({ useHandCursor: unlocked });
		if (unlocked) {
			cardBg.on("pointerover", () => cardBg.setStrokeStyle(3, 0xffeb70));
			cardBg.on("pointerout", () => cardBg.setStrokeStyle(2, 0xffffff));
			cardBg.on("pointerdown", () => {
				SfxSystem.play(this, "sfx-click");
				this.openFullView(entry);
			});
		}
	}

	private openFullView(entry: GalleryEntry): void {
		if (this.fullViewLayer) return;

		const { width, height } = this.scale;
		const layer = this.add.container(0, 0).setDepth(2000);

		// 全螢幕暗底
		const overlay = this.add
			.rectangle(width / 2, height / 2, width, height, 0x000000, 0.85)
			.setInteractive();
		layer.add(overlay);

		// 大圖
		if (this.textures.exists(entry.cgKey)) {
			const big = this.add.image(width / 2, height / 2 - 20, entry.cgKey);
			const scale = Math.min((width - 80) / big.width, (height - 140) / big.height);
			big.setScale(scale);
			layer.add(big);
		}

		// 標題
		const titleText = addText(this, width / 2, height - 70, entry.title, {
			fontSize: "22px",
			color: "#ffeb70",
			fontStyle: "bold",
			stroke: "#000000",
			strokeThickness: 4,
		}).setOrigin(0.5);
		layer.add(titleText);

		const tipText = addText(this, width / 2, height - 38, "（點任意處關閉）", {
			fontSize: "20px",
			color: "#aaaaaa",
		}).setOrigin(0.5);
		layer.add(tipText);

		this.fullViewLayer = layer;

		overlay.on("pointerdown", () => {
			SfxSystem.play(this, "sfx-click");
			layer.destroy();
			this.fullViewLayer = undefined;
		});
	}
}
