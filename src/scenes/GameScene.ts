// 核心玩法：打老鼠、集氣條、老鼠藥炸彈、漢他病毒倒數
// 難度倍率作用於：漢他秒數、關卡時長、出洞間隔、生物停留時間、生物權重、得分、扣分

import Phaser from "phaser";
import { BALANCE } from "../config/balance.ts";
import { CREATURES, type CreatureType } from "../config/creatures.ts";
import { DIFFICULTY, type DifficultyMod } from "../config/difficulty.ts";
import { HAMMER } from "../config/hammer.ts";
import { STAGES, getStageById, type StageDef } from "../config/stages.ts";
import { Creature } from "../objects/Creature.ts";
import { Hammer } from "../objects/Hammer.ts";
import { Hole } from "../objects/Hole.ts";
import { HUD } from "../objects/HUD.ts";
import { PoisonBomb } from "../objects/PoisonBomb.ts";
import { AchievementSystem } from "../systems/AchievementSystem.ts";
import { Analytics } from "../systems/Analytics.ts";
import { ChargeSystem } from "../systems/ChargeSystem.ts";
import { MusicSystem } from "../systems/MusicSystem.ts";
import { RunState } from "../systems/RunState.ts";
import { SaveSystem } from "../systems/SaveSystem.ts";
import { ScoreSystem } from "../systems/ScoreSystem.ts";
import { SfxSystem } from "../systems/SfxSystem.ts";
import { SpawnSystem } from "../systems/SpawnSystem.ts";
import { computeGuaranteedMice } from "../utils/spawnGuarantee.ts";
import { pickBomb, pickHitMouse, pickMissKill } from "../utils/taunt.ts";
import { addText } from "../utils/text.ts";
import { waitForAsset } from "../utils/waitForAsset.ts";

interface GameSceneData {
	stageId: number;
	survival?: boolean; // 生存模式：時間無限、漢他爆發即結束、結算跳 SurvivalEndScene
}

export type GameOverReason = "hanta" | "stage-end";

export class GameScene extends Phaser.Scene {
	constructor() {
		super({ key: "GameScene" });
	}

	private stage!: StageDef;
	private mod!: DifficultyMod;
	// 套用難度後的有效關卡參數（不修改原 stages.ts，runtime 計算）
	private effectiveStage!: StageDef;
	private holes: Hole[] = [];
	/** 場上活著的所有生物（含老鼠瞬移狀態下） */
	private creatures: Set<Creature> = new Set();
	private hud!: HUD;
	private bomb!: PoisonBomb;
	private spawn!: SpawnSystem;
	private score!: ScoreSystem;
	private charge!: ChargeSystem;

	private spawnTimer?: Phaser.Time.TimerEvent;
	private stageTimer!: Phaser.Time.TimerEvent;

	private stageSecondsLeft: number = 0;
	private over: boolean = false;
	private bombsUsedThisStage: number = 0;
	// 關卡實際開始的時間戳（用 Date.now()），給「出師不利」成就用
	private stageStartedAt: number = 0;
	// 生存模式 flag：時間無限、計時改為正向、結算跳 SurvivalEndScene
	private survival: boolean = false;
	// 生存模式累計秒數（正向計時）
	private survivalSeconds: number = 0;
	// 保證冒出的老鼠數（一般模式）：full combo 通關所需的 1.5 倍。
	// 生存模式無過關概念 → init 時直接設 0、不會啟用保證 spawn 機制。
	private guaranteedMiceTotal: number = 0;
	// 已 spawn 過的老鼠累計（含瞬移後的同隻仍計 1 次；瞬移本身不算新 spawn）
	private miceSpawned: number = 0;
	/**
	 * 炸彈動畫進行中：true 期間暫停 spawn 新生物。
	 * 視覺上避免「炸彈剛清場 → 新動物立刻冒出」的違和感（會讓玩家誤以為沒炸到）。
	 */
	private bombFreeze: boolean = false;

	// === 漢他病毒新機制（畫面同時老鼠數）===
	/** 畫面上目前活著的老鼠 reference set（用於追蹤數量、套用閃紅效果） */
	private liveMice: Set<Creature> = new Set();
	/** 達此數量 → game over，由難度決定 */
	private hantaThreshold: number = 7;
	/** 警報等級：0 = 安全；1 = 慢閃 (count >= n-2)；2 = 快閃 (count >= n-1) */
	private alarmLevel: 0 | 1 | 2 = 0;
	/** 警報音效週期計時器（不要每幀都播） */
	private alarmTimer?: Phaser.Time.TimerEvent;

	private hammer!: Hammer;
	private isMobile: boolean = false;
	/**
	 * 手機版：點擊揮擊的 queue。
	 * 每次點擊把座標 push 進來；若槌子目前不在冷卻 → 立即觸發；否則等冷卻結束後依序觸發。
	 * 冷卻間隔 = MOBILE_TAP_COOLDOWN_MS（含揮擊動畫時間）。
	 * 引爆炸彈時清空（避免炸完還繼續執行積壓的舊點擊）。
	 */
	private mobileTapQueue: Array<{ x: number; y: number }> = [];
	private mobileSwinging: boolean = false;
	/** 三指偵測用：目前畫布上活躍的 touch pointer 數 */
	private mobileActiveTouches: number = 0;

	init(data: GameSceneData): void {
		this.survival = data.survival === true;
		this.stage = getStageById(data.stageId);

		// 套用難度：生存模式強制 hard、不依賴 RunState（生存模式不算在一般 run 裡）
		const difficulty = this.survival ? "hard" : RunState.getDifficulty();
		this.mod = DIFFICULTY[difficulty];
		this.effectiveStage = applyDifficulty(this.stage, this.mod);

		this.holes = [];
		this.creatures = new Set();
		this.stageSecondsLeft = Math.round(this.effectiveStage.durationSec);
		this.survivalSeconds = 0;
		this.over = false;
		this.bombsUsedThisStage = 0;
		this.miceSpawned = 0;
		// 一般模式：計算「保證冒出多少隻老鼠」（full combo 通關所需 × guaranteedMouseFactor）。
		// 生存模式無過關門檻、永久進行 → 不需要保證機制。
		this.guaranteedMiceTotal = this.survival
			? 0
			: computeGuaranteedMice(this.effectiveStage.passScore, this.mod);

		// 漢他新機制：依難度決定門檻
		this.hantaThreshold = this.mod.hantaThreshold;
		this.liveMice = new Set();
		this.alarmLevel = 0;
	}

	create(): void {
		const { width, height } = this.scale;
		this.drawBackground();
		// 最後一關（大安魔王關）使用獨立 BGM；其他關卡用通用遊戲 BGM
		const isFinalStage = this.stage.id === STAGES[STAGES.length - 1]!.id;
		const bgmKey = isFinalStage ? "bgm-game-boss" : "bgm-game";
		// 大安魔王 BGM 是延後載入的大檔；若未到位則先顯示 loading 等待
		waitForAsset(this, bgmKey, () => MusicSystem.play(this, bgmKey));

		this.score = new ScoreSystem();
		this.charge = new ChargeSystem(this.mod.initialBombs);
		this.spawn = new SpawnSystem(this.effectiveStage);
		this.bomb = new PoisonBomb(this);
		this.hud = new HUD(this, width, height);

		this.charge.onChange((state) => {
			this.hud.setCharge(state.charge, state.bombs);
		});
		// 初始化 HUD 顯示
		this.hud.setCharge(this.charge.charge, this.charge.bombStock);

		if (this.survival) {
			this.hud.setStageName(`生存模式　${this.stage.name}`);
			this.hud.setPassScore(0); // 生存模式無過關門檻
			this.hud.setSurvivalTimer(0); // 從 0 起算正向計時
		} else {
			this.hud.setStageName(`第 ${this.stage.id} 關 ${this.stage.name}（${this.mod.label}）`);
			this.hud.setPassScore(this.effectiveStage.passScore);
			this.hud.setStageTimer(this.stageSecondsLeft);
		}
		this.hud.setScore(0);
		this.hud.setHanta(0, this.hantaThreshold, 0);

		this.layoutHoles();
		this.scheduleNextSpawn();

		this.stageTimer = this.time.addEvent({
			delay: 1000,
			loop: true,
			callback: () => this.tickStage(),
		});
		this.stageStartedAt = Date.now();

		this.input.keyboard?.on("keydown-SPACE", () => this.tryDetonate());

		this.setupHammerInput();

		// 開場介紹文字
		const intro = addText(this, width / 2, height / 2, `${this.stage.name}\n${this.stage.description}`, {
			fontSize: "36px",
			color: "#ffeb70",
			fontStyle: "bold",
			align: "center",
			stroke: "#000000",
			strokeThickness: 6,
		})
			.setOrigin(0.5)
			.setDepth(900);
		this.tweens.add({
			targets: intro,
			alpha: 0,
			delay: 1100,
			duration: 500,
			onComplete: () => intro.destroy(),
		});
	}

	// 槌子游標 + 命中判定的 input 設定
	private setupHammerInput(): void {
		const { width, height } = this.scale;

		// 偵測是否為手機（觸控且非桌面 OS）
		const dev = this.game.device;
		this.isMobile = !!dev.input.touch && !dev.os.desktop;

		// 隱藏系統游標（桌面才隱藏；手機本來沒游標）
		if (!this.isMobile) {
			this.input.setDefaultCursor("none");
			// scene shutdown 時還原游標，避免其他 scene 也看不到
			this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
				this.input.setDefaultCursor("default");
			});
		}

		// 啟用多點觸控（最多 5 隻手指夠了）
		this.input.addPointer(4); // 預設 1 + 加 4 = 共 5

		// 建立槌子（初始位置：桌面 = 滑鼠位置；手機 = 畫面中央）
		const startX = this.isMobile ? width / 2 : this.input.activePointer.x;
		const startY = this.isMobile ? height / 2 : this.input.activePointer.y;
		this.hammer = new Hammer(this, startX, startY);

		if (!this.isMobile) {
			// 桌面：滑鼠移動 → 槌子絕對跟隨
			this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
				this.hammer.setPointerAbsolute(pointer.x, pointer.y);
			});
			// 桌面：點擊 = 揮擊
			this.input.on("pointerdown", () => this.tryWhack());
		} else {
			// 手機：點擊位置 = 揮擊位置。槌子瞬移過去、揮擊、消失。
			// 連續點擊在 250ms 冷卻內會 queue、依序觸發；引爆炸彈時清空 queue。
			// 手機初始隱藏槌子。
			this.hammer.setVisible(false);
			this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
				if (this.over) return;
				this.mobileActiveTouches += 1;

				// 三指（含以上）同時按 → 觸發炸彈（會清空 queue + 重置觸控計數）
				if (this.mobileActiveTouches >= 3 && this.charge.canDetonate) {
					this.tryDetonate();
					return;
				}
				this.enqueueMobileTap(pointer.x, pointer.y);
			});
			this.input.on("pointerup", () => {
				if (this.mobileActiveTouches > 0) this.mobileActiveTouches -= 1;
			});
			// pointer cancel / scene shutdown 都重置觸控計數
			this.input.on("pointercancel", () => {
				if (this.mobileActiveTouches > 0) this.mobileActiveTouches -= 1;
			});
		}
	}

	/** 手機版：把點擊座標放入 queue，若槌子未在揮擊就立即觸發 */
	private enqueueMobileTap(x: number, y: number): void {
		this.mobileTapQueue.push({ x, y });
		this.tryDispatchNextMobileTap();
	}

	/** 手機版：若槌子目前可揮，從 queue 取下一筆觸發；揮完後再呼叫一次自己。 */
	private tryDispatchNextMobileTap(): void {
		if (this.over) {
			this.mobileTapQueue.length = 0;
			return;
		}
		if (this.mobileSwinging) return;
		const next = this.mobileTapQueue.shift();
		if (!next) return;
		this.mobileSwinging = true;
		this.performWhackAtPointer(next.x, next.y, () => {
			// 揮擊動畫（150ms）後再加 150ms 冷卻硬直 → 兩次點擊間隔最少 300ms
			const COOLDOWN_MS = 150;
			this.time.delayedCall(COOLDOWN_MS, () => {
				this.mobileSwinging = false;
				this.tryDispatchNextMobileTap();
			});
		});
	}

	/** 手機版：清空 queue + 重置 swinging（炸彈時呼叫） */
	private clearMobileTapQueue(): void {
		this.mobileTapQueue.length = 0;
		// swinging 不立即重置，讓正在播的揮擊動畫播完；冷卻結束後 dispatch 會看到空 queue 而不動
	}

	// 揮槌：以槌頭位置與所有活生物比距離，命中最近且在半徑內者
	/** 桌面：以「當前槌子 tip 位置」揮擊（連同 hammer 揮擊動畫）*/
	private tryWhack(): void {
		if (this.over) return;
		this.hammer.swing();
		const tip = this.hammer.tipPosition();
		this.resolveWhackHit(tip.x, tip.y);
	}

	/**
	 * 手機：以指定點擊座標揮擊。槌子先瞬移到該位置、揮擊、然後消失（揮完隱藏）。
	 * 命中判定發生在「揮到底」的瞬間（onImpact），不是按下瞬間 — 給玩家「揮中」的儀式感。
	 */
	private performWhackAtPointer(x: number, y: number, onDone?: () => void): void {
		if (this.over) {
			onDone?.();
			return;
		}
		this.hammer.swingAt(
			x, y,
			() => {
				// 揮到底 → 此時才用 tipPosition 判定（場上生物可能在揮擊期間移動 / 撤回）
				if (this.over) return;
				const tip = this.hammer.tipPosition();
				this.resolveWhackHit(tip.x, tip.y);
			},
			onDone,
		);
	}

	/** 命中判定共用邏輯：桌面與手機都呼叫。 */
	private resolveWhackHit(tipX: number, tipY: number): void {
		let nearest: Creature | null = null;
		let nearestDist = Infinity;
		for (const c of this.creatures.values()) {
			if (!c.isAlive) continue;
			const d = Phaser.Math.Distance.Between(tipX, tipY, c.visualX, c.visualY);
			if (d < nearestDist) {
				nearestDist = d;
				nearest = c;
			}
		}
		if (nearest && nearestDist <= HAMMER.hitRadius) {
			// 命中：先做計分 / 集氣 / 浮出（讓 +N 在打中的瞬間就出現），
			// 再播 hitByHammer 的「敗北抖動 + 落洞」動畫
			this.handleHit(nearest);
			nearest.hitByHammer();
		} else {
			// 揮空：中斷 combo，但仍給少量集氣（mouse 的 missChargeGainRate 倍）
			this.score.registerMiss();
			this.hud.setCombo(this.score.snapshot.combo);
			const missGain = Math.round(CREATURES.mouse.chargeGain * BALANCE.missChargeGainRate);
			if (missGain !== 0) this.charge.add(missGain);
		}
	}

	private drawBackground(): void {
		const { width, height } = this.scale;
		const bgKey = `bg-${this.stage.key}`;
		if (this.textures.exists(bgKey)) {
			const bg = this.add.image(width / 2, height / 2, bgKey);
			const scale = Math.max(width / bg.width, height / bg.height);
			bg.setScale(scale);
			bg.setDepth(-10);
		} else {
			this.cameras.main.setBackgroundColor(this.stage.bgColor);
			const g = this.add.graphics();
			g.lineStyle(1, 0xffffff, 0.05);
			for (let x = 0; x <= width; x += 40) {
				g.lineBetween(x, 0, x, height);
			}
			for (let y = 0; y <= height; y += 40) {
				g.lineBetween(0, y, width, y);
			}
			g.setDepth(-10);
		}
	}

	private layoutHoles(): void {
		const counts = this.effectiveStage.holeCount;
		const cols = Math.max(...counts);
		const rows = counts.length;

		const { width, height } = this.scale;
		const top = 160;
		const bottom = height - 60;
		const usableH = bottom - top;
		const cellH = usableH / rows;
		const cellW = width / cols;

		let placed = 0;
		for (let r = 0; r < rows; r++) {
			const rowItems = counts[r];
			const offsetX = (width - rowItems * cellW) / 2 + cellW / 2;
			for (let c = 0; c < rowItems; c++) {
				const x = offsetX + c * cellW;
				const y = top + r * cellH + cellH / 2;
				this.holes.push(new Hole(this, placed, x, y));
				placed += 1;
			}
		}
	}

	private scheduleNextSpawn(): void {
		if (this.over) return;
		let delay = this.spawn.nextDelayMs();
		// 保證機制：若還沒 spawn 滿配額，計算「剩餘秒 ÷ 剩餘必出老鼠」當動態上限，
		// 確保最後一隻老鼠也能在時限結束前冒出（再扣掉一個安全裕度）。
		//
		// 三重保護排除「除以零 / 不適用情境」：
		//   1. !this.survival：生存模式無過關概念、不啟用此機制
		//   2. remainingMice > 0：保證量已滿（或生存模式 guaranteedMiceTotal=0
		//      導致 remainingMice ≤ 0）→ 跳過、避免除以零
		//   3. stageSecondsLeft > 0：時限已到（gameOver 尚未觸發的瞬間）→ 跳過
		const remainingMice = this.guaranteedMiceTotal - this.miceSpawned;
		if (!this.survival && remainingMice > 0 && this.stageSecondsLeft > 0) {
			const maxIntervalMs = (this.stageSecondsLeft * 1000) / remainingMice
				- BALANCE.guaranteedSpawnSafetyMs;
			if (maxIntervalMs > 0 && delay > maxIntervalMs) {
				delay = maxIntervalMs;
			}
		}
		this.spawnTimer = this.time.delayedCall(delay, () => this.doSpawn());
	}

	private doSpawn(): void {
		if (this.over) return;
		// 炸彈動畫進行中 → 跳過此次 spawn、稍後再重排（避免「炸完瞬間冒新動物」的違和感）
		if (this.bombFreeze) {
			this.scheduleNextSpawn();
			return;
		}
		// 收集目前場上活著的友善動物種類，供升級去重用
		const presentInnocents = new Set<CreatureType>();
		for (const c of this.creatures) {
			if (!c.isAlive) continue;
			if (c.type === "mouse") continue;
			presentInnocents.add(c.type);
		}
		const req = this.spawn.roll(presentInnocents);
		if (!req) {
			this.scheduleNextSpawn();
			return;
		}
		const hole = this.holes[req.holeIndex];
		if (!hole) {
			this.scheduleNextSpawn();
			return;
		}
		this.attachCreature(req.creature, req.holeIndex, hole, req.lifespanMs);

		this.scheduleNextSpawn();
	}

	/**
	 * 在指定洞口生出一隻指定生物，並掛上必要的 callbacks（mouse 的 retract 瞬移、onExit）。
	 * 用於：
	 *   - SpawnSystem 排程的常規 spawn
	 *   - 生存模式中「打到友善動物 → 立刻補一隻老鼠」的懲罰
	 */
	private attachCreature(
		type: CreatureType,
		holeIndex: number,
		hole: Hole,
		lifespanMs: number,
	): Creature {
		this.spawn.markBusy(holeIndex);

		const creature = new Creature(this, hole, type, lifespanMs);
		this.creatures.add(creature);

		// 計入 spawn 配額（瞬移不算新 spawn、由 setRetractStrategy 內部處理）
		if (type === "mouse") {
			this.miceSpawned += 1;
		}

		// 老鼠：retract 時改成瞬移到另一個空洞，永遠不會自然消失（必須被打才會減少）
		if (type === "mouse") {
			this.liveMice.add(creature);
			this.updateHantaUI();
			creature.setRetractStrategy(
				() => {
					if (this.over) return null;
					// 找一個其他空洞（排除自己當前的 holeIndex 避免瞬移到原地）
					const oldHole = creature.hole;
					const newHoleIndex = this.spawn.pickFreeHole(oldHole.index);
					if (newHoleIndex === null) return null;
					const newHole = this.holes[newHoleIndex];
					if (!newHole) return null;
					// 卡位新洞（舊洞先不釋放，避免 retract 動畫期間新 spawn 補進來造成「兩隻同洞」）
					// 舊洞會在 teleport 動畫實際開始時（onTeleport callback）才釋放
					this.spawn.markBusy(newHoleIndex);
					return newHole;
				},
				lifespanMs,
			);
			creature.onTeleport((oldHole) => {
				this.spawn.markFree(oldHole.index);
			});
		}

		creature.onExit((_reason, self) => {
			// 計分與浮出已在「揮槌命中」當下立即處理（resolveWhackHit），
			// 這裡不再呼叫 handleHit，避免延遲到動畫結束才浮出 +N。
			// 任何 exit reason 都釋放洞 + 從 creatures 移除
			this.spawn.markFree(self.hole.index);
			// 若死亡時 retract strategy 已卡位新洞但還沒 teleport 過去 → 一併釋放，避免 leak
			const reserved = self.pendingReservedHole;
			if (reserved && reserved.index !== self.hole.index) {
				this.spawn.markFree(reserved.index);
			}
			this.creatures.delete(self);
			// 老鼠特殊處理：從 liveMice 拿掉並更新血條
			if (self.type === "mouse") {
				this.liveMice.delete(self);
				this.updateHantaUI();
			}
		});

		return creature;
	}

	private handleHit(creature: Creature): void {
		const def = CREATURES[creature.type];
		// 套用難度倍率
		const isMouse = creature.type === "mouse";
		const score = isMouse
			? Math.round(def.hitScore * this.mod.hitScoreMultiplier)
			: Math.round(def.hitScore * this.mod.penaltyMultiplier); // hitScore 對無辜本來就是負數

		const actualDelta = this.score.registerHit(creature.type, score);
		// 集氣：生存模式下增量減半（避免炸彈無腦循環）
		const chargeGain = this.survival ? Math.round(def.chargeGain / 2) : def.chargeGain;
		this.charge.add(chargeGain);
		// 浮出得分：在動物的右上角（往右上偏移）
		this.hud.showScoreDelta(actualDelta, creature.hole.x + 30, creature.hole.y - 40);

		// 成就：無辜動物被槌子打中也算「動物殺手」累計
		if (!isMouse) {
			RunState.addInnocentHit();
			this.checkAnimalKillerUnlock();
			// 生存模式懲罰：打到友善動物 → 立刻在隨機空洞補一隻老鼠（提升難度）
			if (this.survival) {
				this.spawnPenaltyMouse();
			}
		}

		// 成就：垂死掙扎（場上老鼠數已達 threshold-1、再多一隻就漢他爆發時，徒手槌中老鼠）
		// 注意：呼叫端尚未從 liveMice 拿掉自己，所以 size 包含本隻 → 判定 size === threshold-1
		if (isMouse && this.liveMice.size === this.hantaThreshold - 1) {
			const total = SaveSystem.incrementLastGaspCount();
			if (total >= 30) {
				AchievementSystem.unlock("last_gasp");
			}
		}

		// 成就：精準打擊（combo 達 30）
		if (isMouse && this.score.snapshot.combo >= 30) {
			AchievementSystem.unlock("precision_strike");
		}

		// 注意：新機制下，老鼠數的扣減已在 onExit("hit") 中處理（從 liveMice 移除 + updateHantaUI）；
		// 這裡只處理分數、集氣、台詞。

		this.hud.setScore(this.score.snapshot.score);
		this.hud.setCombo(this.score.snapshot.combo);

		if (Math.random() < 0.35) {
			const line = isMouse ? pickHitMouse() : pickMissKill();
			const color = isMouse ? "#aaffaa" : "#ff8888";
			this.hud.showTaunt(line, creature.hole.x, creature.hole.y - 60, color);
		}
	}

	private tryDetonate(): void {
		if (this.over || !this.charge.canDetonate) return;
		this.charge.consume();
		this.bombsUsedThisStage += 1;
		RunState.markBombUsed();
		// 成就：累積跨 run 的炸彈使用數
		this.checkPoisonManiacUnlock();
		// 手機版：清空積壓的點擊（避免炸完還繼續執行舊揮擊）
		if (this.isMobile) this.clearMobileTapQueue();
		// 用炸彈中斷 combo（即使炸到老鼠也算）
		this.score.registerBombUsed();
		this.hud.setCombo(this.score.snapshot.combo);

		const { width, height } = this.scale;
		this.bomb.detonate(width / 2, height / 2);

		const result: Record<CreatureType, number> = {
			mouse: 0, cat: 0, dog: 0, owl: 0, hawk: 0,
		};
		for (const creature of [...this.creatures.values()]) {
			const def = CREATURES[creature.type];
			result[creature.type] += 1;
			const score = creature.type === "mouse"
				? def.bombScore // 老鼠正得分不套 penalty
				: Math.round(def.bombScore * this.mod.penaltyMultiplier);
			this.score.registerBombKill(creature.type, score);
			this.hud.showScoreDelta(score, creature.hole.x + 30, creature.hole.y - 40);
			creature.bombKill();
			// 成就：被炸彈炸到的無辜動物也算「動物殺手」累計
			if (creature.type !== "mouse") {
				RunState.addInnocentHit();
			}
		}
		this.checkAnimalKillerUnlock();

		this.hud.showTaunt(pickBomb(), width / 2, height / 2 - 100, "#ffee77");
		const innocent = result.cat + result.dog + result.owl + result.hawk;
		const summary = `✅ 滅鼠 ${result.mouse}　⚠️ 誤傷 ${innocent}`;
		this.hud.showTaunt(summary, width / 2, height / 2 + 60, "#ffffff");
		this.hud.setScore(this.score.snapshot.score);

		// 進入炸彈動畫凍結期：暫停 spawn 直到動畫結束（鏡頭震動 500 + 粒子壽命 800 + 緩衝 200，
		// 同時涵蓋 creature.bombKill 的 600ms 飛走動畫）
		this.bombFreeze = true;
		this.spawnTimer?.remove();
		this.spawnTimer = undefined;
		const BOMB_FREEZE_MS = 1000;
		this.time.delayedCall(BOMB_FREEZE_MS, () => {
			this.bombFreeze = false;
			if (!this.over) this.scheduleNextSpawn();
		});
	}

	override update(_time: number, dt: number): void {
		if (this.over) return;
		// 推進集氣條的動態色澤動畫（呼吸 + 高光掃描）
		this.hud.tickCharge(dt);
	}

	private tickStage(): void {
		if (this.over) return;
		if (this.survival) {
			// 生存模式：正向計時，無時限（漢他爆發才會結束）
			this.survivalSeconds += 1;
			this.hud.setSurvivalTimer(this.survivalSeconds);
			return;
		}
		this.stageSecondsLeft -= 1;
		this.hud.setStageTimer(this.stageSecondsLeft);
		if (this.stageSecondsLeft <= 0) {
			this.gameOver("stage-end");
		}
	}

	/**
	 * 重新計算漢他血條與警報等級。任何時候 liveMice 數量改變都該呼叫。
	 *  - count >= threshold：game over
	 *  - count >= threshold - 1：alarmLevel 2（快閃）
	 *  - count >= threshold - 2：alarmLevel 1（慢閃）
	 *  - 其他：alarmLevel 0（無警報）
	 */
	private updateHantaUI(): void {
		if (this.over) return;
		const count = this.liveMice.size;
		const n = this.hantaThreshold;

		if (count >= n) {
			// 漢他爆發 → 血條定格在滿血、停止閃爍，避免玩家誤會「為什麼條沒滿就 game over」
			this.hud.setHanta(n, n, 0);
			// 觸發漢他的「最後一隻老鼠」也要閃紅光（否則它剛冒出就直接被 freeze、
			// 永遠看不到警報外觀）。用 level 2 的快閃週期，與其他老鼠視覺一致。
			for (const m of this.liveMice) {
				m.setFlicker(130);
			}
			this.gameOver("hanta");
			return;
		}

		let level: 0 | 1 | 2 = 0;
		if (count >= n - 1) level = 2;
		else if (count >= n - 2) level = 1;

		// 警報等級對應的閃爍週期（毫秒；越短越急促）
		const flickerMs = level === 2 ? 130 : level === 1 ? 280 : 0;
		// 套用到 HUD 血條
		this.hud.setHanta(count, n, flickerMs);
		// 套用到所有現存老鼠的 tint 閃紅
		for (const m of this.liveMice) {
			m.setFlicker(flickerMs);
		}

		// 警報音效週期（與閃爍同步重新觸發）
		if (level !== this.alarmLevel) {
			this.alarmLevel = level;
			this.alarmTimer?.remove();
			this.alarmTimer = undefined;
			if (level > 0) {
				const periodMs = level === 2 ? 600 : 1100;
				// 立即播一聲，然後每 periodMs 重複
				SfxSystem.play(this, "sfx-alarm");
				this.alarmTimer = this.time.addEvent({
					delay: periodMs,
					loop: true,
					callback: () => SfxSystem.play(this, "sfx-alarm"),
				});
			}
		}
	}

	private gameOver(reason: GameOverReason): void {
		if (this.over) return;
		this.over = true;

		this.spawnTimer?.remove();
		this.stageTimer.remove();
		this.alarmTimer?.remove();

		// 漢他爆發時：保留場上所有動物（特別是閃紅的老鼠）作為視覺反饋，僅凍結它們的計時器；
		// scene.start 切場景時會自然清掉。其他 reason（過關 / 不及格）一律 destroy。
		if (reason === "hanta") {
			for (const c of this.creatures.values()) {
				c.freeze();
			}
			// 成就：出師不利（開局 5 秒內漢他爆發）
			if (Date.now() - this.stageStartedAt <= 5000) {
				AchievementSystem.unlock("bad_start");
			}
		} else {
			for (const c of this.creatures.values()) {
				c.destroy();
			}
			this.creatures.clear();
			this.spawn.freeAll();
		}

		const snapshot = this.score.snapshot;

		// 生存模式：跳過所有「過關 / 解鎖 / RunState 統計 / Analytics 陣亡」邏輯，
		// 直接切到 SurvivalEndScene 顯示結算。
		if (this.survival) {
			this.playGameOverBanner(reason, false, () => {
				this.scene.start("SurvivalEndScene", {
					survivedSec: this.survivalSeconds,
					score: snapshot.score,
					mouseHit: snapshot.mouseHit,
					innocentHit: snapshot.innocentHit,
					maxCombo: snapshot.maxCombo,
					bombsUsedThisStage: this.bombsUsedThisStage,
				});
			});
			return;
		}

		const passed = reason === "stage-end" && snapshot.score >= this.effectiveStage.passScore;

		const difficulty = RunState.getDifficulty();
		SaveSystem.setHighScore(difficulty, this.stage.id, snapshot.score);
		if (passed) {
			SaveSystem.setUnlocked(difficulty, this.stage.id + 1);
		}

		// 把這關結果記到 RunState
		RunState.registerStageResult({
			stageId: this.stage.id,
			passed,
			score: snapshot.score,
			mouseHit: snapshot.mouseHit,
			innocentHit: snapshot.innocentHit,
		});

		// Analytics：陣亡 = 漢他 OR 時間到但不及格（過關不算陣亡）
		if (reason === "hanta" || !passed) {
			Analytics.stageDeath({
				difficulty,
				stageId: this.stage.id,
				reason: reason === "hanta" ? "hanta" : "fail",
			});
		}

		// 過場：先在遊戲畫面中央播 2 秒大字動畫，再切到 GameOverScene
		this.playGameOverBanner(reason, passed, () => {
			this.scene.start("GameOverScene", {
				stageId: this.stage.id,
				reason,
				passed,
				score: snapshot.score,
				mouseHit: snapshot.mouseHit,
				innocentHit: snapshot.innocentHit,
				maxCombo: snapshot.maxCombo,
				bombsUsedThisStage: this.bombsUsedThisStage,
			});
		});
	}

	/**
	 * 結算過場大字：依 reason × passed 顯示不同標題（彈跳出現 → 停留 → 淡出 → 切場景）。
	 * 採黑色半透明遮罩 + 文字 scale 0 → 1.1 → 1.0 的彈性入場動畫。
	 */
	private playGameOverBanner(
		reason: GameOverReason,
		passed: boolean,
		onDone: () => void,
	): void {
		const { width, height } = this.scale;

		// 標題與顏色：用元組陣列，集中決定文字 / 主色 / 描邊色
		let title: string;
		let mainColor: string;
		let strokeColor: string;
		if (reason === "hanta") {
			title = "漢他病毒爆發！";
			mainColor = "#ff5050";
			strokeColor = "#3a0606";
		} else if (passed) {
			title = "通關成功！";
			mainColor = "#ffe070";
			strokeColor = "#3a2a06";
		} else {
			title = "鼠患失控⋯";
			mainColor = "#cccccc";
			strokeColor = "#1a1a1a";
		}

		// 半透明遮罩淡入
		const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0)
			.setDepth(950);
		this.tweens.add({
			targets: overlay,
			fillAlpha: 0.55,
			duration: 250,
		});

		// 大字（先縮在中心、alpha 0）
		const banner = addText(this, width / 2, height / 2, title, {
			fontSize: "92px",
			color: mainColor,
			fontStyle: "bold",
			stroke: strokeColor,
			strokeThickness: 12,
			align: "center",
		})
			.setOrigin(0.5)
			.setDepth(951)
			.setAlpha(0)
			.setScale(0.3);

		// 入場：bounce 放大 + 淡入
		this.tweens.add({
			targets: banner,
			alpha: 1,
			scale: 1,
			duration: 480,
			ease: "Back.Out",
		});

		// 入場後輕微呼吸（停留期間做點動感）
		this.time.delayedCall(520, () => {
			this.tweens.add({
				targets: banner,
				scale: 1.06,
				duration: 700,
				yoyo: true,
				repeat: -1,
				ease: "Sine.InOut",
			});
		});

		// 2 秒停留結束 → 一起淡出 → 切場景
		this.time.delayedCall(2000, () => {
			this.tweens.killTweensOf(banner);
			this.tweens.add({
				targets: [banner, overlay],
				alpha: 0,
				duration: 280,
				onComplete: () => {
					banner.destroy();
					overlay.destroy();
					onDone();
				},
			});
		});
	}

	// 成就：毒餌狂魔（單一場 run 內釋放 15 次老鼠藥）
	private checkPoisonManiacUnlock(): void {
		if (RunState.getBombsUsed() >= 15) {
			AchievementSystem.unlock("poison_maniac");
		}
	}

	// 成就：動物殺手（單一場 run 內打中 30 次無辜動物）
	private checkAnimalKillerUnlock(): void {
		if (RunState.getInnocentHitCount() >= 30) {
			AchievementSystem.unlock("animal_killer");
		}
	}

	// 生存模式懲罰：找一個空洞、立刻補一隻老鼠（沒空洞就放棄）
	private spawnPenaltyMouse(): void {
		if (this.over) return;
		const holeIndex = this.spawn.pickFreeHole();
		if (holeIndex === null) return;
		const hole = this.holes[holeIndex];
		if (!hole) return;
		this.attachCreature("mouse", holeIndex, hole, this.spawn.rollLifespanMs());
	}
}

// 將難度倍率套用到關卡資料，回傳新物件不修改原始
function applyDifficulty(stage: StageDef, mod: DifficultyMod): StageDef {
	const weights: StageDef["weights"] = {};
	for (const [k, v] of Object.entries(stage.weights)) {
		const key = k as keyof typeof stage.weights;
		if (v == null) continue;
		const mult = key === "mouse" ? mod.mouseWeightMultiplier : mod.innocentWeightMultiplier;
		weights[key] = v * mult;
	}

	return {
		...stage,
		durationSec: stage.durationSec * mod.durationMultiplier,
		passScore: Math.round(stage.passScore * mod.passScoreMultiplier),
		spawnIntervalMs: [
			stage.spawnIntervalMs[0] * mod.spawnIntervalMultiplier,
			stage.spawnIntervalMs[1] * mod.spawnIntervalMultiplier,
		],
		lifespanMs: [
			stage.lifespanMs[0] * mod.lifespanMultiplier,
			stage.lifespanMs[1] * mod.lifespanMultiplier,
		],
		weights,
	};
}
