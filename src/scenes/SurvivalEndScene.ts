// 生存模式結算畫面
//
// 玩家撐到漢他爆發後跳到這裡。顯示本次生存秒數與得分、與歷史最高紀錄對比，
// 觸發「適者生存」成就（≥ 100 秒）。

import Phaser from "phaser";
import { AchievementSystem } from "../systems/AchievementSystem.ts";
import { MusicSystem } from "../systems/MusicSystem.ts";
import { SaveSystem } from "../systems/SaveSystem.ts";
import { showAchievementUnlockedPopups } from "../utils/achievementPopup.ts";
import { makeButton } from "../utils/button.ts";
import { buttonSizeFromTexture } from "../utils/buttonSize.ts";
import { addText } from "../utils/text.ts";

interface SurvivalEndData {
	survivedSec: number;
	score: number;
	mouseHit: number;
	innocentHit: number;
	maxCombo: number;
	bombsUsedThisStage: number;
}

export class SurvivalEndScene extends Phaser.Scene {
	constructor() {
		super({ key: "SurvivalEndScene" });
	}

	private result!: SurvivalEndData;

	init(data: SurvivalEndData): void {
		this.result = data;
	}

	create(): void {
		const { width, height } = this.scale;

		MusicSystem.play(this, "bgm-gameover");

		// 背景：生存模式專用插畫；缺檔退回漢他失敗插畫
		const bgKey = this.textures.exists("bg-survival-end")
			? "bg-survival-end"
			: this.textures.exists("bg-gameover-hanta")
				? "bg-gameover-hanta"
				: null;
		if (bgKey) {
			const bg = this.add.image(width / 2, height / 2, bgKey);
			const scale = Math.max(width / bg.width, height / bg.height);
			bg.setScale(scale);
			bg.setDepth(-10);
			this.add.rectangle(width / 2, 120, width, 130, 0x000000, 0.45).setDepth(-5);
			this.add.rectangle(width / 2, height - 70, width, 140, 0x000000, 0.55).setDepth(-5);
		} else {
			this.cameras.main.setBackgroundColor("#0e0e1a");
		}

		// 比較舊紀錄、再寫入新紀錄（方便顯示「★ 新紀錄」標誌）
		const prev = SaveSystem.getSurvivalBest();
		const newSec = this.result.survivedSec > prev.sec;
		const newScore = this.result.score > prev.score;
		SaveSystem.updateSurvivalBest(this.result.survivedSec, this.result.score);

		// CG 收集（即使圖片暫不存在也記錄解鎖，等使用者放圖後就會顯示）
		SaveSystem.unlockCg("bg-survival-end");

		// 成就：安鼠鐵粉（生存模式也算一次「完成關卡」）
		const totalCompleted = SaveSystem.incrementStagesCompleted();
		if (totalCompleted >= 100) {
			AchievementSystem.unlock("iron_fan");
		}

		// 成就：適者生存（生存 ≥ 100 秒）
		if (this.result.survivedSec >= 100) {
			AchievementSystem.unlock("survivor");
		}

		// 標題
		addText(this, width / 2, 100, "💀 漢他病毒爆發", {
			fontSize: "44px",
			color: "#ff5555",
			fontStyle: "bold",
			stroke: "#000000",
			strokeThickness: 6,
		}).setOrigin(0.5);
		addText(this, width / 2, 160, "生存模式・大安", {
			fontSize: "20px",
			color: "#ffffff",
			fontStyle: "bold",
			stroke: "#000000",
			strokeThickness: 4,
		}).setOrigin(0.5);

		// 主要數字：生存時間 + 得分
		const survivalText = `${this.result.survivedSec} 秒`;
		addText(this, width / 2 - 180, 250, "生存時間", {
			fontSize: "22px",
			color: "#dddddd",
			stroke: "#000000",
			strokeThickness: 3,
		}).setOrigin(0.5);
		addText(this, width / 2 - 180, 300, survivalText, {
			fontSize: "56px",
			color: newSec ? "#ffeb70" : "#ffffff",
			fontStyle: "bold",
			stroke: "#000000",
			strokeThickness: 6,
		}).setOrigin(0.5);
		if (newSec) {
			addText(this, width / 2 - 180, 350, "★ 新紀錄", {
				fontSize: "22px",
				color: "#ffeb70",
				fontStyle: "bold",
				stroke: "#000000",
				strokeThickness: 4,
			}).setOrigin(0.5);
		}

		addText(this, width / 2 + 180, 250, "得分", {
			fontSize: "22px",
			color: "#dddddd",
			stroke: "#000000",
			strokeThickness: 3,
		}).setOrigin(0.5);
		addText(this, width / 2 + 180, 300, String(this.result.score), {
			fontSize: "56px",
			color: newScore ? "#ffeb70" : "#ffffff",
			fontStyle: "bold",
			stroke: "#000000",
			strokeThickness: 6,
		}).setOrigin(0.5);
		if (newScore) {
			addText(this, width / 2 + 180, 350, "★ 新紀錄", {
				fontSize: "22px",
				color: "#ffeb70",
				fontStyle: "bold",
				stroke: "#000000",
				strokeThickness: 4,
			}).setOrigin(0.5);
		}

		// 次要統計（顯示「更新後」的最高紀錄，這次成績破紀錄時自然會等於本次值）
		const best = SaveSystem.getSurvivalBest();
		const stats: Array<[string, string]> = [
			["最佳生存", `${best.sec} 秒`],
			["最高得分", String(best.score)],
			["滅鼠數", String(this.result.mouseHit)],
			["誤傷無辜", String(this.result.innocentHit)],
			["最高連擊", String(this.result.maxCombo)],
			["使用炸彈", String(this.result.bombsUsedThisStage)],
		];
		stats.forEach(([label, value], i) => {
			const y = 410 + i * 30;
			addText(this, width / 2 - 100, y, label, {
				fontSize: "20px",
				color: "#cccccc",
				stroke: "#000000",
				strokeThickness: 3,
			}).setOrigin(1, 0.5);
			addText(this, width / 2 - 80, y, value, {
				fontSize: "20px",
				color: "#ffffff",
				fontStyle: "bold",
				stroke: "#000000",
				strokeThickness: 3,
			}).setOrigin(0, 0.5);
		});

		// 按鈕：再來一場 / 主選單
		const targetH = 100;
		const replaySize = buttonSizeFromTexture(this, "btn-replay-run", { targetH, fallbackW: 220, fallbackH: 60 });
		const homeSize = buttonSizeFromTexture(this, "btn-main-menu", { targetH, fallbackW: 220, fallbackH: 60 });
		const gap = 24;
		const totalW = replaySize.width + homeSize.width + gap;
		const startX = (width - totalW) / 2;
		const btnY = height - 70;
		makeButton({
			scene: this,
			x: startX + replaySize.width / 2, y: btnY,
			targetH, fallbackW: replaySize.width, fallbackH: replaySize.height,
			textureKey: "btn-replay-run", fallbackColor: 0x4477aa,
			label: "再來一場",
			onClick: () => this.scene.start("GameScene", { stageId: 5, survival: true }),
		});
		makeButton({
			scene: this,
			x: startX + replaySize.width + gap + homeSize.width / 2, y: btnY,
			targetH, fallbackW: homeSize.width, fallbackH: homeSize.height,
			textureKey: "btn-main-menu", fallbackColor: 0x666666,
			label: "主選單",
			onClick: () => this.scene.start("TitleScene"),
		});

		// 成就解鎖通知
		showAchievementUnlockedPopups(this, AchievementSystem.consumePending());
	}
}
