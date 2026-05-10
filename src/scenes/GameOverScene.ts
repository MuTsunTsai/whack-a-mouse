// 結算畫面：成績、嘲諷台詞、下一關 / 重玩 / 主選單
//
// 重要：當「過了第 5 關」時，本場景仍會顯示一秒結算（讓玩家看到分數），
// 然後自動切到 EndingScene 顯示 good / bad ending。

import Phaser from "phaser";
import { STAGES, getStageById } from "../config/stages.ts";
import { AchievementSystem } from "../systems/AchievementSystem.ts";
import { Analytics } from "../systems/Analytics.ts";
import { MusicSystem } from "../systems/MusicSystem.ts";
import { RunState } from "../systems/RunState.ts";
import { SaveSystem } from "../systems/SaveSystem.ts";
import { showAchievementUnlockedPopups } from "../utils/achievementPopup.ts";
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

		// 成就：安鼠鐵粉（每進到結算畫面 +1，包含贏 / 輸 / 漢他）
		const totalCompleted = SaveSystem.incrementStagesCompleted();
		if (totalCompleted >= 100) {
			AchievementSystem.unlock("iron_fan");
		}

		// 失敗 → 破壞 cleanRun（達人類成就要全程不失敗）
		if (!this.result.passed) {
			RunState.breakCleanRun();
		}

		// 成就：安鼠高手 / 達人 / 神人 — 必須「從第 1 關連續玩到第 5 關」+ 全程 cleanRun。
		// hasClearedSequenceFrom1 確保不是從中途關卡開始玩（玩家可從 StageSelect 直接點某關）。
		// 在這裡解鎖（而非 EndingScene），讓玩家在過關畫面就能看到通知。
		if (allCleared && RunState.isCleanRun() && RunState.hasClearedSequenceFrom1(this.result.stageId)) {
			const id = difficulty === "easy"
				? "expert_easy"
				: difficulty === "normal"
					? "expert_normal"
					: "expert_hard";
			AchievementSystem.unlock(id);
		}

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

		// 共用按鈕定義
		const replayBtn = {
			label: "再挑戰",
			cb: () => {
				// 重玩同關 → 破壞達人類成就條件
				RunState.breakCleanRun();
				this.scene.start("GameScene", { stageId: this.result.stageId });
			},
			bg: 0x4477aa,
			key: "btn-replay",
		};
		const selectBtn = {
			label: "選關",
			cb: () => {
				RunState.breakCleanRun();
				this.scene.start("StageSelectScene");
			},
			bg: 0x666666,
			key: "btn-stage-select",
		};
		const mainMenuBtn = {
			label: "主選單",
			cb: () => {
				RunState.end();
				this.scene.start("TitleScene");
			},
			bg: 0x444444,
			key: "btn-main-menu",
		};

		const passedNonFinal = this.result.passed && !isLastStage;
		const btnY = height - 70;

		if (passedNonFinal || allCleared) {
			// 過關（非最後一關）或全破的三段式排版：
			//   - 中央加大主按鈕（過關 = 「下一關」、全破 = 「繼續」進結局）
			//   - 「再挑戰」放在左側
			//   - 「選關 / 主選單」放在右側上下並列
			const centerBtn = passedNonFinal
				? {
					label: "下一關",
					cb: () => this.scene.start("GameScene", { stageId: this.result.stageId + 1 }),
					bg: 0x44aa44,
					key: "btn-next-stage",
				}
				: {
					label: "繼續",
					cb: () => {
						const ending = RunState.wasBombUsed() ? "bad" : "good";
						Analytics.allCleared({ difficulty, ending });
						this.scene.start("EndingScene", { ending });
					},
					bg: 0xddaa44,
					key: "btn-next-ending",
				};
			// 中央按鈕用更大尺寸（targetH 1.4×）凸顯「玩家應該點這個」；文字也對等放大
			const centerH = 140;
			const centerSize = buttonSizeFromTexture(this, centerBtn.key, { targetH: centerH, fallbackW: 220, fallbackH: 84 });
			makeButton({
				scene: this,
				x: width / 2, y: btnY,
				targetH: centerH, fallbackW: centerSize.width, fallbackH: centerSize.height,
				textureKey: centerBtn.key, fallbackColor: centerBtn.bg,
				label: centerBtn.label, fontSize: "32px",
				onClick: centerBtn.cb,
			});

			// 左側：再挑戰（緊貼左邊距）
			const sideH = 90;
			const replaySize = buttonSizeFromTexture(this, replayBtn.key, { targetH: sideH, fallbackW: 156, fallbackH: 54 });
			const sideMargin = 24;
			makeButton({
				scene: this,
				x: sideMargin + replaySize.width / 2, y: btnY,
				targetH: sideH, fallbackW: replaySize.width, fallbackH: replaySize.height,
				textureKey: replayBtn.key, fallbackColor: replayBtn.bg,
				label: replayBtn.label,
				onClick: replayBtn.cb,
			});

			// 右側：選關 + 主選單水平並排（更貼右邊、彼此更靠近）
			const rightBtns = [selectBtn, mainMenuBtn];
			const rightSizes = rightBtns.map((b) =>
				buttonSizeFromTexture(this, b.key, { targetH: sideH, fallbackW: 156, fallbackH: 54 }),
			);
			const rightGap = -30;
			const rightMargin = 8;
			// 從畫面右邊往內倒著排，最後一顆貼右邊距、第一顆在更內側
			let rightCursorX = width - rightMargin;
			for (let i = rightBtns.length - 1; i >= 0; i--) {
				const b = rightBtns[i]!;
				const s = rightSizes[i]!;
				const x = rightCursorX - s.width / 2;
				makeButton({
					scene: this,
					x, y: btnY,
					targetH: sideH, fallbackW: s.width, fallbackH: s.height,
					textureKey: b.key, fallbackColor: b.bg,
					label: b.label,
					onClick: b.cb,
				});
				rightCursorX -= s.width + rightGap;
			}
		} else {
			// 失敗：保留原本「按鈕橫排置中」的排版
			const buttons = [replayBtn, selectBtn, mainMenuBtn];

			const targetH = 100;
			const sizes = buttons.map((b) =>
				buttonSizeFromTexture(this, b.key, { targetH, fallbackW: 156, fallbackH: 60 }),
			);
			const gap = 14;
			const totalW = sizes.reduce((acc, s) => acc + s.width, 0) + (buttons.length - 1) * gap;
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

		// 成就解鎖通知（若這次結算前有新解鎖的成就）
		showAchievementUnlockedPopups(this, AchievementSystem.consumePending());
	}
}
