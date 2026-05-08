// 結局畫面：通關 5 關後依「是否使用過老鼠藥炸彈」分流為 good / bad ending
//
// Good End：整場 run 完全沒按過炸彈 → 純靠手打老鼠收場 → 天敵與毛孩無傷
// Bad End：用過至少一次炸彈 → 鼠患雖平、生態崩盤、天敵跟毛孩相繼倒下

import Phaser from "phaser";
import { DIFFICULTY } from "../config/difficulty.ts";
import { AchievementSystem } from "../systems/AchievementSystem.ts";
import { Analytics } from "../systems/Analytics.ts";
import { MusicSystem } from "../systems/MusicSystem.ts";
import { RunState } from "../systems/RunState.ts";
import { SaveSystem, type Ending } from "../systems/SaveSystem.ts";
import { showAchievementUnlockedPopups } from "../utils/achievementPopup.ts";
import { makeButton } from "../utils/button.ts";
import { buttonSizeFromTexture } from "../utils/buttonSize.ts";
import { addText } from "../utils/text.ts";

interface EndingSceneData {
	ending: Ending;
}

const GOOD_END_LINES = [
	"終於平定了鼠患，而且是靠著自己的實力，",
	"沒有牽拖中央、也沒有傷害到生態！",
	"沉浸在市民的歡呼之中，您不禁覺得——",
	"好像要角逐總統之位也不是問題？",
];

const BAD_END_LINES = [
	"鼠患暫時平了，但老鷹也平了。",
	"上萬公斤毒餌的代價：一座沒有天敵的城市。",
	"逃過一劫的老鼠們在暗地裡偷笑：牠們的下一代會有更強的抗藥性。",
	"——這真的是您要的市政嗎？",
];

export class EndingScene extends Phaser.Scene {
	constructor() {
		super({ key: "EndingScene" });
	}

	private payload!: EndingSceneData;

	init(data: EndingSceneData): void {
		this.payload = data;
	}

	create(): void {
		const { width, height } = this.scale;
		const ending = this.payload.ending;
		const isGood = ending === "good";

		// 寫入存檔（紀錄此難度最佳結局）
		const difficulty = RunState.getDifficulty();
		SaveSystem.setBestEnding(difficulty, ending);

		// CG 收集
		SaveSystem.unlockCg(`bg-ending-${ending}`);

		// 成就：安鼠高手 / 達人 / 神人 — 五關全破且整場 run 都「乾淨通關」
		// （沒用過炸彈、沒失敗、沒重玩、沒退出選關 / 主畫面）
		if (RunState.isCleanRun()) {
			const id = difficulty === "easy"
				? "expert_easy"
				: difficulty === "normal"
					? "expert_normal"
					: "expert_hard";
			AchievementSystem.unlock(id);
		}

		// BGM
		MusicSystem.play(this, isGood ? "bgm-ending-good" : "bgm-ending-bad");

		// 背景圖
		const bgKey = `bg-ending-${ending}`;
		if (this.textures.exists(bgKey)) {
			const bg = this.add.image(width / 2, height / 2, bgKey);
			const scale = Math.max(width / bg.width, height / bg.height);
			bg.setScale(scale);
			bg.setDepth(-10);
		} else {
			this.cameras.main.setBackgroundColor(isGood ? "#1a3a2e" : "#3a1a1a");
		}

		// 標題
		const title = isGood ? "🏆 Good Ending" : "💀 Bad Ending";
		const subtitle = isGood ? "親力親為的市政" : "毒餌氾濫的代價";
		const titleColor = isGood ? "#88ff99" : "#ff6655";

		addText(this, width / 2, 60, title, {
			fontSize: "48px",
			color: titleColor,
			fontStyle: "bold",
			stroke: "#000000",
			strokeThickness: 6,
		}).setOrigin(0.5);

		addText(this, width / 2, 120, subtitle, {
			fontSize: "22px",
			color: "#ffffff",
			stroke: "#000000",
			strokeThickness: 4,
		}).setOrigin(0.5);

		// 結局描述（多行）
		const lines = isGood ? GOOD_END_LINES : BAD_END_LINES;
		addText(this, width / 2, height - 300, lines.join("\n"), {
			fontSize: "22px",
			color: "#ffffff",
			align: "center",
			fontStyle: "bold",
			lineSpacing: 8,
			stroke: "#000000",
			strokeThickness: 4,
		}).setOrigin(0.5, 0);

		// 統計小卡（炸彈使用、總分等）
		const run = RunState.get();
		if (run) {
			const mod = DIFFICULTY[run.difficulty];
			const bombText = isGood ? "✨ 全程未使用老鼠藥" : "💊 使用過老鼠藥（生態波及）";
			addText(this, width / 2, 165, bombText, {
				fontSize: "22px",
				color: isGood ? "#aaffaa" : "#ffaaaa",
				stroke: "#000000",
				strokeThickness: 3,
			}).setOrigin(0.5);

			addText(
				this,
				width / 2,
				190,
				`難度 ${mod.label}　|　總分 ${run.totalScore}　|　滅鼠 ${run.totalMouseHit}　|　誤傷 ${run.totalInnocentHit}`,
				{
					fontSize: "20px",
					color: "#cccccc",
					stroke: "#000000",
					strokeThickness: 3,
				},
			).setOrigin(0.5);
		}

		// 按鈕（依 texture 實際 aspect 動態算寬）
		const targetH = 110;
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
			label: "再一局",
			onClick: () => {
				const d = RunState.getDifficulty();
				RunState.start(d);
				Analytics.startRun(d);
				this.scene.start("StageSelectScene");
			},
		});
		makeButton({
			scene: this,
			x: startX + replaySize.width + gap + homeSize.width / 2, y: btnY,
			targetH, fallbackW: homeSize.width, fallbackH: homeSize.height,
			textureKey: "btn-main-menu", fallbackColor: 0x666666,
			label: "主選單",
			onClick: () => {
				RunState.end();
				this.scene.start("TitleScene");
			},
		});

		// 成就解鎖通知（若這次結算前有新解鎖的成就）
		showAchievementUnlockedPopups(this, AchievementSystem.consumePending());
	}
}
