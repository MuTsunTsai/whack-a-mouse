// 成就清單畫面
//
// 流程：卡片網格（未解鎖暗色 + 成就名稱、解鎖點開彈跳） → 彈跳視窗顯示卡片 + 名稱 + 條件

import Phaser from "phaser";
import { ACHIEVEMENTS, type Achievement } from "../config/achievements.ts";
import { MusicSystem } from "../systems/MusicSystem.ts";
import { SaveSystem } from "../systems/SaveSystem.ts";
import { SfxSystem } from "../systems/SfxSystem.ts";
import { makeButton } from "../utils/button.ts";
import { buttonSizeFromTexture } from "../utils/buttonSize.ts";
import { addText } from "../utils/text.ts";

const COLS = 5;
const CARD_WIDTH = 160;
const CARD_HEIGHT = 224; // 直式比例 5:7
const CARD_GAP = 16;

export class AchievementScene extends Phaser.Scene {
	constructor() {
		super({ key: "AchievementScene" });
	}

	private modalLayer?: Phaser.GameObjects.Container;

	create(): void {
		const { width, height } = this.scale;
		this.cameras.main.setBackgroundColor("#1e1e2e");
		MusicSystem.play(this, "bgm-title");

		// 標題
		addText(this, width / 2, 50, "成就", {
			fontSize: "36px",
			color: "#ffeb70",
			fontStyle: "bold",
			stroke: "#000000",
			strokeThickness: 4,
		}).setOrigin(0.5);

		const total = ACHIEVEMENTS.length;
		const unlockedCount = ACHIEVEMENTS.filter((a) =>
			SaveSystem.isAchievementUnlocked(a.id),
		).length;
		addText(this, width / 2 + 150, 50, `已解鎖 ${unlockedCount} / ${total}`, {
			fontSize: "20px",
			color: "#aaaaaa",
		}).setOrigin(0.5);

		// 網格佈局
		if (total > 0) {
			const rows = Math.ceil(total / COLS);
			const totalW = COLS * CARD_WIDTH + (COLS - 1) * CARD_GAP;
			const totalH = rows * CARD_HEIGHT + (rows - 1) * CARD_GAP;
			const startX = (width - totalW) / 2 + CARD_WIDTH / 2;
			const startY = (height - totalH) / 2 + CARD_HEIGHT / 2 + 20;

			ACHIEVEMENTS.forEach((entry, i) => {
				const r = Math.floor(i / COLS);
				const c = i % COLS;
				const x = startX + c * (CARD_WIDTH + CARD_GAP);
				const y = startY + r * (CARD_HEIGHT + CARD_GAP);
				this.makeCard(x, y, entry);
			});
		} else {
			addText(this, width / 2, height / 2, "（成就尚未開放）", {
				fontSize: "24px",
				color: "#888888",
			}).setOrigin(0.5);
		}

		// 返回按鈕
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

	private makeCard(x: number, y: number, entry: Achievement): void {
		const unlocked = SaveSystem.isAchievementUnlocked(entry.id);
		const hasTexture = this.textures.exists(entry.cardKey);

		// 互動熱區（無外觀；缺圖時下方還會疊一塊純色 rectangle 充當顯示）
		const hitbox = this.add
			.rectangle(x, y, CARD_WIDTH, CARD_HEIGHT, 0xffffff, 0)
			.setOrigin(0.5);

		// 卡片圖：不論解鎖與否都畫；未解鎖用 setTint 變暗成「暗色卡片」
		// 缺檔時退回純色卡片但不畫邊框
		let thumb: Phaser.GameObjects.Image | undefined;
		if (hasTexture) {
			thumb = this.add.image(x, y, entry.cardKey);
			const scale = Math.max(CARD_WIDTH / thumb.width, CARD_HEIGHT / thumb.height);
			thumb.setScale(scale);
			const mask = this.make.graphics();
			mask.fillStyle(0xffffff);
			mask.fillRect(x - CARD_WIDTH / 2, y - CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT);
			thumb.setMask(mask.createGeometryMask());
			if (!unlocked) {
				thumb.setTint(0x333333);
			}
		} else {
			this.add.rectangle(x, y, CARD_WIDTH, CARD_HEIGHT, unlocked ? 0x333344 : 0x222230, 1);
		}

		// 已解鎖：底部顯示成就名稱
		// 未解鎖：暗色卡片上疊鎖頭與成就名稱（吊人胃口：給名稱、不給條件）
		if (unlocked) {
			addText(this, x, y + CARD_HEIGHT / 2 - 20, entry.title, {
				fontSize: "20px",
				color: "#ffffff",
				fontStyle: "bold",
				stroke: "#000000",
				strokeThickness: 3,
				align: "center",
				wordWrap: { width: CARD_WIDTH - 16 },
			}).setOrigin(0.5);
		} else {
			addText(this, x, y - 24, "🔒", {
				fontSize: "40px",
			}).setOrigin(0.5);
			addText(this, x, y + 24, entry.title, {
				fontSize: "20px",
				color: "#aaaaaa",
				fontStyle: "bold",
				stroke: "#000000",
				strokeThickness: 3,
				align: "center",
				wordWrap: { width: CARD_WIDTH - 12 },
			}).setOrigin(0.5);
		}

		// 互動：已解鎖才能點開
		hitbox.setInteractive({ useHandCursor: unlocked });
		if (unlocked) {
			hitbox.on("pointerdown", () => {
				SfxSystem.play(this, "sfx-click");
				this.openModal(entry);
			});
		}
	}

	private openModal(entry: Achievement): void {
		if (this.modalLayer) return;

		const { width, height } = this.scale;
		const layer = this.add.container(0, 0).setDepth(2000);

		// 全螢幕暗底（攔截點擊）
		const overlay = this.add
			.rectangle(width / 2, height / 2, width, height, 0x000000, 0.85)
			.setInteractive();
		layer.add(overlay);

		// 視窗：直式卡片置中放大版
		const modalCardW = 360;
		const modalCardH = 504; // 維持 5:7 比例
		const modalY = height / 2 - 60;

		// 卡片：有圖直接畫；缺檔才退回純色卡（無邊框）
		if (this.textures.exists(entry.cardKey)) {
			const card = this.add.image(width / 2, modalY, entry.cardKey);
			const scale = Math.min(modalCardW / card.width, modalCardH / card.height);
			card.setScale(scale);
			layer.add(card);
		} else {
			const cardBg = this.add.rectangle(width / 2, modalY, modalCardW, modalCardH, 0x333344, 1);
			layer.add(cardBg);
		}

		// 名稱
		const titleText = addText(this, width / 2, modalY + modalCardH / 2 + 30, entry.title, {
			fontSize: "28px",
			color: "#ffeb70",
			fontStyle: "bold",
			stroke: "#000000",
			strokeThickness: 4,
			align: "center",
		}).setOrigin(0.5);
		layer.add(titleText);

		// 條件說明
		const descText = addText(this, width / 2, modalY + modalCardH / 2 + 70, entry.description, {
			fontSize: "20px",
			color: "#ffffff",
			align: "center",
			lineSpacing: 6,
			stroke: "#000000",
			strokeThickness: 3,
			wordWrap: { width: width - 120 },
		}).setOrigin(0.5);
		layer.add(descText);

		const tipText = addText(this, width / 2, height - 30, "（點任意處關閉）", {
			fontSize: "20px",
			color: "#aaaaaa",
		}).setOrigin(0.5);
		layer.add(tipText);

		this.modalLayer = layer;

		overlay.on("pointerdown", () => {
			SfxSystem.play(this, "sfx-click");
			layer.destroy();
			this.modalLayer = undefined;
		});
	}
}
