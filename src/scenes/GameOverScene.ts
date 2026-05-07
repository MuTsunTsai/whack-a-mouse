// 結算畫面：成績、嘲諷台詞、下一關 / 重玩 / 主選單
//
// 重要：當「過了第 5 關」時，本場景仍會顯示一秒結算（讓玩家看到分數），
// 然後自動切到 EndingScene 顯示 good / bad ending。

import Phaser from "phaser";
import { STAGES, getStageById } from "../config/stages.ts";
import { Analytics } from "../systems/Analytics.ts";
import { MusicSystem } from "../systems/MusicSystem.ts";
import { RunState } from "../systems/RunState.ts";
import { SaveSystem } from "../systems/SaveSystem.ts";
import { makeButton } from "../utils/button.ts";
import { buttonSizeFromTexture } from "../utils/buttonSize.ts";
import { pickRandom } from "../utils/random.ts";
import { fillTemplate, pickHantaGameOver, pickStageFail, ALL_CLEAR_LINES } from "../utils/taunt.ts";
import { addText } from "../utils/text.ts";
import type { GameOverReason } from "./GameScene.ts";
import { getDifficulty } from "../config/difficulty.ts";

interface GameOverData {
	stageId: number;
	reason: GameOverReason;
	passed: boolean;
	score: number;
	mouseHit: number;
	innocentHit: number;
	maxCombo: number;
	bombsUsedThisStage: number;
}

export class GameOverScene extends Phaser.Scene {
	constructor() {
		super({ key: "GameOverScene" });
	}

	private result!: GameOverData;

	init(data: GameOverData): void {
		this.result = data;
	}

	create(): void {
		const { width, height } = this.scale;

		const stage = getStageById(this.result.stageId);
		const isLastStage = this.result.stageId === STAGES[STAGES.length - 1]!.id;
		const allCleared = this.result.passed && isLastStage;
		const difficulty = RunState.getDifficulty();

		// Analytics：過關（含最後一關全破）→ 送 wam_stage_clear
		if (this.result.passed) {
			Analytics.stageClear({
				difficulty,
				stageId: this.result.stageId,
				combo: this.result.maxCombo,
				bomb: this.result.bombsUsedThisStage,
				score: this.result.score,
			});
		}

		// 依結果選擇音樂、背景、CG 解鎖
		let cgKey: string;
		if (this.result.passed) {
			MusicSystem.play(this, "bgm-stage-clear");
			cgKey = `bg-clear-${stage.key}`;
		} else if (this.result.reason === "hanta") {
			MusicSystem.play(this, "bgm-gameover");
			cgKey = "bg-gameover-hanta";
		} else {
			MusicSystem.play(this, "bgm-gameover");
			cgKey = "bg-gameover-fail";
		}

		if (this.textures.exists(cgKey)) {
			const bg = this.add.image(width / 2, height / 2, cgKey);
			const scale = Math.max(width / bg.width, height / bg.height);
			bg.setScale(scale);
			bg.setDepth(-10);
			// 上下淡黑遮罩讓文字可讀
			this.add.rectangle(width / 2, 120, width, 130, 0x000000, 0.45).setDepth(-5);
			this.add.rectangle(width / 2, height - 70, width, 140, 0x000000, 0.55).setDepth(-5);
		} else {
			// 沒插畫時用對應的暗色純底
			const fallback = this.result.passed ? "#1a3a2e" : "#0e0e1a";
			this.cameras.main.setBackgroundColor(fallback);
		}

		// 紀錄 CG 收集（圖檔不存在也仍記錄解鎖，等使用者後續加圖時就能看到）
		SaveSystem.unlockCg(cgKey);

		// 結果標題
		let title: string;
		let titleColor: string;
		if (allCleared) {
			title = "🏆 五區全破！";
			titleColor = "#ffeb70";
		} else if (this.result.passed) {
			title = "✅ 過關！";
			titleColor = "#88ff88";
		} else if (this.result.reason === "hanta") {
			title = "💀 漢他病毒 Game Over";
			titleColor = "#ff5555";
		} else {
			title = "📉 議員質詢中…";
			titleColor = "#ff8866";
		}

		addText(this, width / 2, 100, title, {
			fontSize: "44px",
			color: titleColor,
			fontStyle: "bold",
			stroke: "#000000",
			strokeThickness: 6,
		}).setOrigin(0.5);

		addText(this, width / 2, 160, `第 ${stage.id} 關 ${stage.name}`, {
			fontSize: "20px",
			color: "#ffffff",
			fontStyle: "bold",
			stroke: "#000000",
			strokeThickness: 4,
		}).setOrigin(0.5);

		// 嘲諷台詞
		let line: string;
		if (allCleared) {
			const tpl = pickRandom(ALL_CLEAR_LINES);
			line = fillTemplate(tpl, {
				mouse: String(this.result.mouseHit),
				innocent: String(this.result.innocentHit),
			});
		} else if (this.result.reason === "hanta") {
			line = pickHantaGameOver();
		} else if (!this.result.passed) {
			line = pickStageFail();
		} else {
			line = "下一關等著您。";
		}
		addText(this, width / 2, 210, `「${line}」`, {
			fontSize: "22px",
			color: "#ffcc88",
			align: "center",
			wordWrap: { width: width - 80 },
			stroke: "#000000",
			strokeThickness: 4,
		}).setOrigin(0.5);

		// 統計
		const high = SaveSystem.getHighScore(difficulty, this.result.stageId);
		const mod = getDifficulty(difficulty);
		const stats: Array<[string, string]> = [
			["分數", String(this.result.score)],
			["最高分", String(high)],
			["過關門檻", String(Math.ceil(stage.passScore * mod.passScoreMultiplier))],
			["滅鼠數", String(this.result.mouseHit)],
			["誤傷無辜", String(this.result.innocentHit)],
			["最高連擊", String(this.result.maxCombo)],
		];
		const statsStartY = 280;
		stats.forEach(([label, value], i) => {
			const y = statsStartY + i * 36;
			addText(this, width / 2 - 100, y, label, {
				fontSize: "20px",
				color: "#dddddd",
				stroke: "#000000",
				strokeThickness: 3,
			}).setOrigin(1, 0.5);
			addText(this, width / 2 - 80, y, value, {
				fontSize: "22px",
				color: "#ffffff",
				fontStyle: "bold",
				stroke: "#000000",
				strokeThickness: 4,
			}).setOrigin(0, 0.5);
		});

		// 依結果配置按鈕
		const buttons: Array<{ label: string; cb: () => void; bg: number; key: string }> = [];
		if (allCleared) {
			// 五區全破：依整場 run 是否用過炸彈分流到 good / bad ending
			buttons.push({
				label: "繼續",
				cb: () => {
					const ending = RunState.wasBombUsed() ? "bad" : "good";
					Analytics.allCleared({ difficulty, ending });
					this.scene.start("EndingScene", { ending });
				},
				bg: 0xddaa44,
				key: "btn-next-ending",
			});
		} else if (this.result.passed && !isLastStage) {
			buttons.push({
				label: "下一關",
				cb: () => this.scene.start("GameScene", { stageId: this.result.stageId + 1 }),
				bg: 0x44aa44,
				key: "btn-next-stage",
			});
		}
		buttons.push({
			label: "再挑戰",
			cb: () => this.scene.start("GameScene", { stageId: this.result.stageId }),
			bg: 0x4477aa,
			key: "btn-replay",
		});
		buttons.push({
			label: "選關",
			cb: () => this.scene.start("StageSelectScene"),
			bg: 0x666666,
			key: "btn-stage-select",
		});
		buttons.push({
			label: "主選單",
			cb: () => {
				RunState.end();
				this.scene.start("TitleScene");
			},
			bg: 0x444444,
			key: "btn-main-menu",
		});

		// 每顆按鈕依各自 texture aspect 算寬度；統一目標高度 100、缺檔 fallback 為 156×60
		const targetH = 100;
		const sizes = buttons.map((b) =>
			buttonSizeFromTexture(this, b.key, { targetH, fallbackW: 156, fallbackH: 60 }),
		);
		const gap = 14;
		const totalW = sizes.reduce((acc, s) => acc + s.width, 0) + (buttons.length - 1) * gap;
		const btnY = height - 70;
		let cursorX = (width - totalW) / 2;
		buttons.forEach((b, i) => {
			const s = sizes[i]!;
			const x = cursorX + s.width / 2;
			makeButton({
				scene: this, x, y: btnY,
				targetH, fallbackW: s.width, fallbackH: s.height,
				textureKey: b.key, fallbackColor: b.bg,
				label: b.label,
				onClick: b.cb,
			});
			cursorX += s.width + gap;
		});
	}
}
