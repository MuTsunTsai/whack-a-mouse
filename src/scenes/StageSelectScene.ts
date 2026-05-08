// 選關畫面：5 大鼠跡熱區；背景與「過關門檻」依當前難度切換

import Phaser from "phaser";
import { DIFFICULTY } from "../config/difficulty.ts";
import { STAGES } from "../config/stages.ts";
import { Analytics } from "../systems/Analytics.ts";
import { MusicSystem } from "../systems/MusicSystem.ts";
import { RunState } from "../systems/RunState.ts";
import { SaveSystem } from "../systems/SaveSystem.ts";
import { SfxSystem } from "../systems/SfxSystem.ts";
import { makeButton } from "../utils/button.ts";
import { buttonSizeFromTexture } from "../utils/buttonSize.ts";
import { addText } from "../utils/text.ts";

export class StageSelectScene extends Phaser.Scene {
	constructor() {
		super({ key: "StageSelectScene" });
	}

	create(): void {
		const { width, height } = this.scale;
		this.cameras.main.setBackgroundColor("#1e1e2e");
		MusicSystem.play(this, "bgm-title");

		// 若使用者直接重整網頁、跳過 TitleScene 開了 RunState，這裡補建一個
		if(!RunState.get()) {
			const last = SaveSystem.getLastDifficulty() ?? "normal";
			RunState.start(last);
			Analytics.startRun(last);
		}

		const difficulty = RunState.getDifficulty();
		const mod = DIFFICULTY[difficulty];

		// 依難度選背景：先試專屬難度版本，找不到退回通用版
		const difficultyBgKey = `bg-stage-select-${difficulty}`;
		const bgKey = this.textures.exists(difficultyBgKey)
			? difficultyBgKey
			: this.textures.exists("bg-stage-select")
				? "bg-stage-select"
				: null;

		if(bgKey) {
			const bg = this.add.image(width / 2, height / 2, bgKey);
			const scale = Math.max(width / bg.width, height / bg.height);
			bg.setScale(scale);
			bg.setDepth(-10);
			this.add.rectangle(width / 2, 100, width, 200, 0x000000, 0.45).setDepth(-5);
			this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.35).setDepth(-6);
		}

		addText(this, width / 2, 80, "選擇鼠跡熱區", {
			fontSize: "40px",
			color: "#ffffff",
			fontStyle: "bold",
			stroke: "#000000",
			strokeThickness: 4,
		}).setOrigin(0.5);

		// 標示當前難度（讓玩家知道這場 run 是什麼難度）
		addText(this, width / 2, 130, `難度：${mod.label}`, {
			fontSize: "24px",
			color: `#${mod.uiColor.toString(16).padStart(6, "0")}`,
			fontStyle: "bold",
			stroke: "#000000",
			strokeThickness: 3,
		}).setOrigin(0.5);

		const unlocked = SaveSystem.getUnlocked(difficulty);
		const cardWidth = 180;
		const gap = 18;
		const totalWidth = STAGES.length * cardWidth + (STAGES.length - 1) * gap;
		const startX = (width - totalWidth) / 2 + cardWidth / 2;
		const y = height / 2;

		STAGES.forEach((stage, i) => {
			const x = startX + i * (cardWidth + gap);
			const isUnlocked = stage.id <= unlocked;
			const high = SaveSystem.getHighScore(difficulty, stage.id);
			// 依難度調整顯示的過關門檻
			const adjPass = Math.round(stage.passScore * mod.passScoreMultiplier);

			// 卡片底：優先用圖（依 texture aspect 算高度）、缺圖 fallback 為純色 rectangle
			// 鎖住時也用圖、但套用「灰階 + 變暗」的視覺處理（tint 0x444444 + alpha 0.55）
			const cardKey = `card-stage-${stage.key}`;
			const useCardImage = this.textures.exists(cardKey);
			let cardH = 220;
			if(useCardImage) {
				const src = this.textures.get(cardKey).getSourceImage() as { width: number; height: number };
				cardH = Math.round(cardWidth * (src.height / src.width));
			}
			const cardBg: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle = useCardImage
				? this.add.image(x, y, cardKey).setDisplaySize(cardWidth, cardH)
				: this.add
					.rectangle(x, y, cardWidth, cardH, isUnlocked ? stage.bgColor : 0x333333, 1)
					.setStrokeStyle(3, isUnlocked ? 0xffffff : 0x555555);
			// 鎖住的圖片版：變暗效果（multiply 中性灰 tint）
			if(useCardImage && !isUnlocked) {
				const img = cardBg as Phaser.GameObjects.Image;
				img.setTint(0x555555);
			}
			cardBg.setInteractive({ useHandCursor: isUnlocked });

			addText(this, x, y - 80, `第 ${stage.id} 關`, {
				fontSize: "20px",
				color: isUnlocked ? "#ffeb70" : "#777777",
				fontStyle: "bold",
				stroke: "#000000",
				strokeThickness: 3,
			}).setOrigin(0.5);

			addText(this, x, y - 36, stage.name, {
				fontSize: "28px",
				color: isUnlocked ? "#ffffff" : "#888888",
				fontStyle: "bold",
				stroke: "#000000",
				strokeThickness: 4,
			}).setOrigin(0.5);

			addText(this, x, y + 14, isUnlocked ? stage.description : "🔒 過上一關才解鎖", {
				fontSize: "20px",
				color: isUnlocked ? "#dddddd" : "#666666",
				align: "center",
				fontStyle: "bold",
				stroke: "#000000",
				strokeThickness: 3,
				wordWrap: { width: cardWidth - 20 },
			}).setOrigin(0.5);

			addText(this, x, y + 80, isUnlocked ? `過關門檻 ${adjPass}` : "", {
				fontSize: "20px",
				color: "#cccccc",
				fontStyle: "bold",
				stroke: "#000000",
				strokeThickness: 3,
			}).setOrigin(0.5);

			addText(this, x, y + 105, high > 0 ? `最高 ${high}` : "", {
				fontSize: "20px",
				color: "#ffeb70",
				fontStyle: "bold",
				stroke: "#000000",
				strokeThickness: 3,
			}).setOrigin(0.5);

			if(isUnlocked) {
				if(useCardImage) {
					// 圖片版 hover：+5% 放大（用 displayWidth/Height 避免 setDisplaySize 造成的 scale bug）
					const img = cardBg as Phaser.GameObjects.Image;
					cardBg.on("pointerover", () => {
						this.tweens.add({ targets: img, displayWidth: cardWidth * 1.05, displayHeight: cardH * 1.05, duration: 120, ease: "Quad.Out" });
					});
					cardBg.on("pointerout", () => {
						this.tweens.add({ targets: img, displayWidth: cardWidth, displayHeight: cardH, duration: 120, ease: "Quad.Out" });
					});
					cardBg.on("pointerdown", () => {
						SfxSystem.play(this, "sfx-click");
						this.tweens.add({
							targets: img,
							displayWidth: cardWidth * 0.94,
							displayHeight: cardH * 0.94,
							duration: 80,
							yoyo: true,
							onComplete: () => this.scene.start("GameScene", { stageId: stage.id }),
						});
					});
				} else {
					// rectangle 版：用 stroke 變換 hover
					const rect = cardBg as Phaser.GameObjects.Rectangle;
					cardBg.on("pointerover", () => rect.setStrokeStyle(4, 0xffeb70));
					cardBg.on("pointerout", () => rect.setStrokeStyle(3, 0xffffff));
					cardBg.on("pointerdown", () => {
						SfxSystem.play(this, "sfx-click");
						this.tweens.add({
							targets: cardBg,
							scale: 0.94,
							duration: 80,
							yoyo: true,
							onComplete: () => this.scene.start("GameScene", { stageId: stage.id }),
						});
					});
				}
			}
		});

		// 困難級限定：底部中央顯示「生存模式」入口
		// 解鎖條件：困難級至少全破過一次（無論結局是 good 或 bad，bestEnding 不為 null 即可）
		if(difficulty === "hard") {
			this.makeSurvivalButton(width / 2, height - 130);
		}

		// 返回按鈕：左下角，按鈕中心 X = 24 + width/2
		const backSize = buttonSizeFromTexture(this, "btn-back", { targetH: 90, fallbackW: 120, fallbackH: 40 });
		makeButton({
			scene: this,
			x: 24 + backSize.width / 2, y: height - 40,
			targetH: 90, fallbackW: 120, fallbackH: 40,
			textureKey: "btn-back", fallbackColor: 0x444444,
			label: "主選單", fontSize: "22px",
			onClick: () => {
				RunState.end();
				this.scene.start("TitleScene");
			},
		});
	}

	/**
	 * 生存模式入口（僅困難級顯示）：上半「生存模式」字樣、下半顯示最久時間 / 最高得分。
	 * 困難級全破過至少一次才可點擊；未解鎖灰色顯示。
	 */
	private makeSurvivalButton(x: number, y: number): void {
		// 解鎖條件：困難級第 5 關通過過至少一次（getUnlocked 會回傳「下一關 stageId」=
		// 最後一關 +1）。
		// 不能用 getBestEnding("hard") 判斷，因為玩家通關第 5 關後若沒按「繼續」進
		// EndingScene、bestEnding 不會被寫入，會導致已全破卻看不到入口。
		const lastStageId = STAGES[STAGES.length - 1]!.id;
		const unlocked = SaveSystem.getUnlocked("hard") > lastStageId;
		const best = SaveSystem.getSurvivalBest();

		// 圖片有則用圖、無則 rectangle fallback
		const useImage = this.textures.exists("btn-survival");
		const w = 432;
		let h = 132;
		if(useImage) {
			const src = this.textures.get("btn-survival").getSourceImage() as { width: number; height: number };
			h = Math.round(w * (src.height / src.width));
		}
		const strokeColor = unlocked ? 0xff6655 : 0x555555;
		const bg: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle = useImage
			? this.add.image(x, y, "btn-survival").setDisplaySize(w, h)
			: this.add
				.rectangle(x, y, w, h, unlocked ? 0x4a1818 : 0x2a2a2a, 0.85)
				.setStrokeStyle(3, strokeColor);
		// 鎖住的圖片版：套用 tint 變暗
		if(useImage && !unlocked) {
			(bg as Phaser.GameObjects.Image).setTint(0x555555);
		}

		// 上半：標題（含鎖頭符號）
		const titleColor = unlocked ? "#ffeb70" : "#888888";
		const titleText = unlocked ? "💀 生存模式" : "🔒 生存模式";
		addText(this, x + 45, y - 22, titleText, {
			fontSize: "26px",
			color: titleColor,
			fontStyle: "bold",
			stroke: "#000000",
			strokeThickness: 4,
		}).setOrigin(0.5);

		// 下半：兩項紀錄（未解鎖顯示提示）
		if(unlocked) {
			addText(this, x - 20, y + 22, `最久 ${best.sec} 秒`, {
				fontSize: "18px",
				color: "#ffffff",
				fontStyle: "bold",
				stroke: "#000000",
				strokeThickness: 3,
			}).setOrigin(0.5);
			addText(this, x + 100, y + 22, `最高 ${best.score} 分`, {
				fontSize: "18px",
				color: "#ffffff",
				fontStyle: "bold",
				stroke: "#000000",
				strokeThickness: 3,
			}).setOrigin(0.5);
		} else {
			addText(this, x + 60, y + 22, "通關困難級後解鎖", {
				fontSize: "20px",
				color: "#aaaaaa",
				stroke: "#000000",
				strokeThickness: 3,
			}).setOrigin(0.5);
		}

		bg.setInteractive({ useHandCursor: unlocked });
		if(unlocked) {
			if(useImage) {
				const img = bg as Phaser.GameObjects.Image;
				bg.on("pointerover", () => {
					this.tweens.add({ targets: img, displayWidth: w * 1.05, displayHeight: h * 1.05, duration: 120, ease: "Quad.Out" });
				});
				bg.on("pointerout", () => {
					this.tweens.add({ targets: img, displayWidth: w, displayHeight: h, duration: 120, ease: "Quad.Out" });
				});
			} else {
				const rect = bg as Phaser.GameObjects.Rectangle;
				bg.on("pointerover", () => rect.setStrokeStyle(4, 0xffeb70));
				bg.on("pointerout", () => rect.setStrokeStyle(3, strokeColor));
			}
			bg.on("pointerdown", () => {
				SfxSystem.play(this, "sfx-click");
				// 生存模式視為「獨立的 hard 場 run」：另開一個 RunState、退出時重置
				// 用途：讓「毒餌狂魔 / 動物殺手」這類「單場 run 內計數」成就在生存模式內也能累積
				RunState.end();
				RunState.start("hard");
				// 第五關 stageId（大安）= STAGES 最後一筆
				const lastStageId = STAGES[STAGES.length - 1]!.id;
				this.scene.start("GameScene", { stageId: lastStageId, survival: true });
			});
		}
	}
}
