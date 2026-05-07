// 純邏輯遊戲模擬器：不依賴 Phaser、不依賴瀏覽器
// 用於 Rstest 跑大量自動化模擬，調整關卡參數、難度倍率
//
// 設計：離散事件模擬。呼叫者用 advanceTo(ms) 推進時間，
// 過程中會自動處理：生物冒出、lifespan 到期（老鼠瞬移、其他消失）、
// 漢他閾值檢查、關卡時間到。任何時候都可呼叫 whack/detonate。

import { BALANCE } from "../config/balance.ts";
import { CREATURES, type CreatureType } from "../config/creatures.ts";
import { DIFFICULTY, type Difficulty, type DifficultyMod } from "../config/difficulty.ts";
import { HAMMER } from "../config/hammer.ts";
import { type StageDef, getStageById } from "../config/stages.ts";
import { comboMultiplier } from "../systems/ScoreSystem.ts";
import { randomBetween, weightedPick } from "../utils/random.ts";

export interface SimCreature {
	id: number;
	type: CreatureType;
	holeIndex: number;
	x: number;
	y: number;
	/** 出生時間 ms */
	spawnedAtMs: number;
	/** 在這個時間點後會 retract */
	retractAtMs: number;
}

export type GameOverReason = "hanta" | "stage-end";

export interface StageResult {
	passed: boolean;
	reason: GameOverReason;
	score: number;
	mouseHit: number;
	innocentHit: number;
	bombUsed: boolean;
	bombsUsedCount: number;
	/** 結束的瞬間，集氣是多少（0~chargeMax）。漢他 game over 時可看「死的時候有沒有滿」 */
	endChargeValue: number;
	/** 結束的瞬間，場上活著的老鼠數 */
	endMouseCount: number;
	/** 整關曾出現的「同時存活老鼠」最大值（峰值） */
	peakLiveMice: number;
	maxCombo: number;
	endedAtMs: number;
}

interface InternalStage extends StageDef {
	hantaThreshold: number;
}

/** 把難度倍率套用到 stage（與 GameScene 內 applyDifficulty 邏輯相同） */
function applyDifficulty(stage: StageDef, mod: DifficultyMod): InternalStage {
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
		hantaThreshold: mod.hantaThreshold,
	};
}

/** 把洞口排好位置（與 GameScene.layoutHoles 相同邏輯） */
function layoutHoles(stage: StageDef): Array<{ x: number; y: number; index: number }> {
	const counts = stage.holeCount;
	const cols = Math.max(...counts);
	const rows = counts.length;
	const width = BALANCE.gameWidth;
	const height = BALANCE.gameHeight;
	const top = 160;
	const bottom = height - 60;
	const usableH = bottom - top;
	const cellH = usableH / rows;
	const cellW = width / cols;
	const out: Array<{ x: number; y: number; index: number }> = [];
	let placed = 0;
	for (let r = 0; r < rows; r++) {
		const rowItems = counts[r]!;
		const offsetX = (width - rowItems * cellW) / 2 + cellW / 2;
		for (let c = 0; c < rowItems; c++) {
			out.push({
				x: offsetX + c * cellW,
				y: top + r * cellH + cellH / 2,
				index: placed,
			});
			placed += 1;
		}
	}
	return out;
}

export class Simulation {
	readonly stage: InternalStage;
	readonly difficulty: Difficulty;
	private readonly mod: DifficultyMod;
	private readonly holes: Array<{ x: number; y: number; index: number }>;

	private nowMs: number = 0;
	/** 下次 spawn 排在此時間 */
	private nextSpawnAtMs: number;

	private creatures: SimCreature[] = [];
	private creatureIdSeq: number = 0;
	private holesInUse: Set<number> = new Set();

	private score: number = 0;
	private charge: number = 0;
	/** 炸彈庫存（0~3） */
	private bombs: number = 0;
	private mouseHit: number = 0;
	private innocentHit: number = 0;
	private bombUsed: boolean = false;
	private bombsUsedCount: number = 0;
	private combo: number = 0;
	private maxCombo: number = 0;
	/** 整關曾出現的「同時存活老鼠」最大值；用於診斷玩家是否瀕臨漢他 */
	private peakLiveMice: number = 0;

	private over: boolean = false;
	private overReason: GameOverReason = "stage-end";

	constructor(stageId: number, difficulty: Difficulty) {
		const baseStage = getStageById(stageId);
		this.difficulty = difficulty;
		this.mod = DIFFICULTY[difficulty];
		this.stage = applyDifficulty(baseStage, this.mod);
		this.holes = layoutHoles(this.stage);
		this.nextSpawnAtMs = this.rollSpawnDelay();
		// 套用難度的初始炸彈庫存
		this.bombs = Math.max(0, Math.min(3, this.mod.initialBombs));
	}

	private rollSpawnDelay(): number {
		return this.nowMs + randomBetween(this.stage.spawnIntervalMs[0], this.stage.spawnIntervalMs[1]);
	}

	private rollLifespanMs(): number {
		return randomBetween(this.stage.lifespanMs[0], this.stage.lifespanMs[1]);
	}

	private pickFreeHole(excludeIndex?: number): { x: number; y: number; index: number } | null {
		const free = this.holes.filter(
			(h) => h.index !== excludeIndex && !this.holesInUse.has(h.index),
		);
		if (free.length === 0) return null;
		return free[Math.floor(Math.random() * free.length)]!;
	}

	/** 場上活著的所有生物（給 player 觀察用） */
	getCreatures(): readonly SimCreature[] {
		return this.creatures;
	}

	/** 場上活著的老鼠數（漢他血條的數值） */
	getLiveMiceCount(): number {
		return this.creatures.filter((c) => c.type === "mouse").length;
	}

	getCharge(): number {
		return this.charge;
	}

	getBombStock(): number {
		return this.bombs;
	}

	canDetonate(): boolean {
		return this.bombs > 0;
	}

	getScore(): number {
		return this.score;
	}

	getNow(): number {
		return this.nowMs;
	}

	isOver(): boolean {
		return this.over;
	}

	/**
	 * 推進到指定的絕對時間。處理過程中：
	 *  - 觸發應 spawn 的事件（可能多次，若 nextSpawnAtMs <= targetMs）
	 *  - 觸發應 retract 的生物
	 *  - 檢查是否超過關卡時間限制
	 * 期間任何步驟可能造成 over=true（漢他、關卡結束）；over 後就停止推進。
	 */
	advanceTo(targetMs: number): void {
		while (!this.over && this.nowMs < targetMs) {
			// 找下一個事件：spawn 或最早的 retract
			let nextEventMs = Math.min(targetMs, this.stage.durationSec * 1000);
			let nextEvent: "spawn" | "retract" | "stage-end" | null = null;

			if (this.nextSpawnAtMs < nextEventMs) {
				nextEventMs = this.nextSpawnAtMs;
				nextEvent = "spawn";
			}
			for (const c of this.creatures) {
				if (c.retractAtMs < nextEventMs) {
					nextEventMs = c.retractAtMs;
					nextEvent = "retract";
				}
			}
			// 如果沒有任何事件，但 targetMs 還沒到 → 直接跳到 targetMs
			if (nextEvent === null) {
				if (this.nowMs >= this.stage.durationSec * 1000) {
					nextEvent = "stage-end";
					nextEventMs = this.stage.durationSec * 1000;
				} else {
					this.nowMs = targetMs;
					break;
				}
			}

			this.nowMs = nextEventMs;

			// 關卡時間到 → 結束
			if (this.nowMs >= this.stage.durationSec * 1000) {
				this.endStage();
				return;
			}

			if (nextEvent === "spawn") {
				this.doSpawn();
				this.nextSpawnAtMs = this.rollSpawnDelay();
			} else if (nextEvent === "retract") {
				this.handleRetracts();
			}

			// 更新「同時老鼠數峰值」（用於診斷玩家是否曾接近漢他閾值）
			const liveMice = this.getLiveMiceCount();
			if (liveMice > this.peakLiveMice) this.peakLiveMice = liveMice;

			// 漢他檢查
			if (liveMice >= this.stage.hantaThreshold) {
				this.over = true;
				this.overReason = "hanta";
				return;
			}
		}
	}

	private doSpawn(): void {
		const hole = this.pickFreeHole();
		if (!hole) return;
		const raw = weightedPick(this.stage.weights);
		// 友善動物去重升級（與 SpawnSystem 邏輯一致）
		const resolved = this.resolveInnocentUpgrade(raw);
		if (resolved === null) return; // 放棄這次 spawn
		const lifespan = this.rollLifespanMs();
		const creature: SimCreature = {
			id: this.creatureIdSeq++,
			type: resolved,
			holeIndex: hole.index,
			x: hole.x,
			y: hole.y,
			spawnedAtMs: this.nowMs,
			retractAtMs: this.nowMs + lifespan,
		};
		this.creatures.push(creature);
		this.holesInUse.add(hole.index);
	}

	/**
	 * 友善動物去重升級（cat → dog → owl → hawk）。與 SpawnSystem 同邏輯。
	 *  - mouse / 不在場上 → 直接回傳原值
	 *  - 已在場 → 沿鏈找下一個「未在場 + 本關有權重」的種類；找不到回傳 null。
	 */
	private resolveInnocentUpgrade(type: CreatureType): CreatureType | null {
		if (type === "mouse") return type;
		const present = new Set<CreatureType>(this.creatures.map((c) => c.type));
		if (!present.has(type)) return type;
		const chain: CreatureType[] = ["cat", "dog", "owl", "hawk"];
		const idx = chain.indexOf(type);
		if (idx < 0) return type;
		for (let i = idx + 1; i < chain.length; i++) {
			const next = chain[i]!;
			if ((this.stage.weights[next] ?? 0) > 0 && !present.has(next)) {
				return next;
			}
		}
		return null;
	}

	private handleRetracts(): void {
		const remaining: SimCreature[] = [];
		for (const c of this.creatures) {
			if (c.retractAtMs > this.nowMs) {
				remaining.push(c);
				continue;
			}
			// 老鼠：瞬移到另一個空洞；沒空洞 → 留在原地重設計時
			if (c.type === "mouse") {
				// 先暫時釋放，pickFreeHole 才能挑舊洞以外的位置
				this.holesInUse.delete(c.holeIndex);
				const newHole = this.pickFreeHole(c.holeIndex);
				if (newHole) {
					c.holeIndex = newHole.index;
					c.x = newHole.x;
					c.y = newHole.y;
					this.holesInUse.add(newHole.index);
				} else {
					// 沒空洞 → 留在原洞
					this.holesInUse.add(c.holeIndex);
				}
				c.retractAtMs = this.nowMs + this.rollLifespanMs();
				remaining.push(c);
			} else {
				// 其他生物：直接消失
				this.holesInUse.delete(c.holeIndex);
			}
		}
		this.creatures = remaining;
	}

	private endStage(): void {
		this.over = true;
		this.overReason = "stage-end";
	}

	/**
	 * 揮槌：以槌頭目標座標檢查命中所有 creatures，命中最近且距離 < hitRadius 者。
	 * 回傳被打中的 creature（若有）。揮空 → combo 中斷。
	 */
	whack(tipX: number, tipY: number): SimCreature | null {
		if (this.over) return null;
		let nearest: SimCreature | null = null;
		let nearestDist = Infinity;
		for (const c of this.creatures) {
			const dx = c.x - tipX;
			const dy = c.y - tipY;
			const d = Math.hypot(dx, dy);
			if (d < nearestDist) {
				nearestDist = d;
				nearest = c;
			}
		}
		if (!nearest || nearestDist > HAMMER.hitRadius) {
			// 揮空 → 中斷 combo，但給少量集氣
			this.combo = 0;
			const missGain = Math.round(CREATURES.mouse.chargeGain * BALANCE.missChargeGainRate);
			if (missGain !== 0) this.applyCharge(missGain);
			return null;
		}
		this.processHit(nearest);
		return nearest;
	}

	private processHit(c: SimCreature): void {
		const def = CREATURES[c.type];
		const isMouse = c.type === "mouse";

		// 基底分數（套難度倍率）
		const baseScore = isMouse
			? Math.round(def.hitScore * this.mod.hitScoreMultiplier)
			: Math.round(def.hitScore * this.mod.penaltyMultiplier);

		if (isMouse) {
			// 老鼠：先增 combo、再以新 combo 套加成
			this.combo += 1;
			if (this.combo > this.maxCombo) this.maxCombo = this.combo;
			const finalScore = Math.round(baseScore * comboMultiplier(this.combo));
			this.score += finalScore;
			this.mouseHit += 1;
		} else {
			// 打中無辜：combo 重置、不套加成
			this.combo = 0;
			this.score += baseScore;
			this.innocentHit += 1;
		}

		this.applyCharge(def.chargeGain);

		// 從 creatures 中移除、釋放洞
		this.creatures = this.creatures.filter((x) => x.id !== c.id);
		this.holesInUse.delete(c.holeIndex);
	}

	/**
	 * 集氣加減。集滿時 → 庫存 +1（最多 3）、集氣歸 0、剩餘溢出值往下一輪累積。
	 * 庫存滿時集氣固定壓在 max。
	 */
	private applyCharge(delta: number): void {
		this.charge += delta;
		if (this.charge < 0) this.charge = 0;
		while (this.charge >= BALANCE.chargeMax && this.bombs < 3) {
			this.charge -= BALANCE.chargeMax;
			this.bombs += 1;
		}
		if (this.bombs >= 3 && this.charge > BALANCE.chargeMax) {
			this.charge = BALANCE.chargeMax;
		}
	}

	/**
	 * 引爆炸彈：庫存 ≥ 1 才能釋放。清空場上所有生物並結算分數。
	 * 老鼠仍計為命中（對血條也沒差因為全部清空）。
	 */
	detonate(): boolean {
		if (this.over || this.bombs <= 0) return false;
		this.bombs -= 1;
		this.bombUsed = true;
		this.bombsUsedCount += 1;
		// 用炸彈中斷 combo（不論炸到什麼）
		this.combo = 0;
		for (const c of this.creatures) {
			const def = CREATURES[c.type];
			const isMouse = c.type === "mouse";
			const score = isMouse ? def.bombScore : Math.round(def.bombScore * this.mod.penaltyMultiplier);
			this.score += score;
			if (isMouse) this.mouseHit += 1;
			else this.innocentHit += 1;
		}
		this.creatures = [];
		this.holesInUse.clear();
		return true;
	}

	getResult(): StageResult {
		const passed = this.overReason === "stage-end" && this.score >= this.stage.passScore;
		return {
			passed,
			reason: this.overReason,
			score: this.score,
			mouseHit: this.mouseHit,
			innocentHit: this.innocentHit,
			bombUsed: this.bombUsed,
			bombsUsedCount: this.bombsUsedCount,
			endChargeValue: this.charge,
			endMouseCount: this.getLiveMiceCount(),
			peakLiveMice: this.peakLiveMice,
			maxCombo: this.maxCombo,
			endedAtMs: this.nowMs,
		};
	}
}
