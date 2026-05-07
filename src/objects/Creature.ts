// 通用生物：浮出 → 待機 → （點擊 / 縮回 / 炸彈死亡 / 老鼠瞬移）
// 動畫設計：
//   冒出：從洞口下方升起，配合 scale 0.2→1 與 alpha 0→1，
//         最高點 overshoot 後落定；之後在洞口微幅上下擺動（呼吸）
//   被打：texture 切換為 stunned，物件水平震動（如卡通眼花），
//         然後旋轉墜回洞口、淡出
//   縮回：時間到自動退場前先往上彈一下，再快速 scale 0 + alpha 0 縮回
//   炸彈：被毒餌波及時的死亡動畫（旋轉、上飛、淡出）
//   老鼠瞬移（新）：時間到時不消失，改為縮回 → 換洞 → 重新冒出，並 emit "teleport"
//
// 視覺微調：所有「位置 / 尺寸」相關常數集中在 config/creatureOffsets.ts。
//
// 縮放實作說明：
//   來源圖檔可能是任意尺寸（256 / 384 / 1024 都可），程式以 setDisplaySize 強制
//   顯示為設定大小。但 setDisplaySize 是用「改寫物件的 scale」實現的，所以
//   後續 tween 不能直接寫 scale: 1（會把圖回復到原始檔案尺寸）。
//   我們記下 baseScale，後續 tween 用 baseScale × 倍率 計算。

import Phaser from "phaser";
import { CREATURE_VISUAL, getCreatureOffset } from "../config/creatureOffsets.ts";
import {
	CREATURES,
	pickVariantKey,
	type CreatureType,
} from "../config/creatures.ts";
import { SfxSystem } from "../systems/SfxSystem.ts";
import { applyDefaultTextStyle } from "../utils/text.ts";
import type { Hole } from "./Hole.ts";

export type CreatureExitReason = "hit" | "retract" | "bomb";

type Renderable = Phaser.GameObjects.Image | Phaser.GameObjects.Text;

/**
 * Retract 行為策略：時間到時要做什麼？
 *   - "destroy"：縮回後消失（其他生物 + 一般情境）
 *   - 函式 () => Hole | null：先探查
 *       - 回傳 Hole：縮回 → 瞬移到此洞 → 重新冒出
 *       - 回傳 null：完全不縮回（跳過 retract 動畫），重設下一次計時、繼續呼吸
 */
export type RetractStrategy = "destroy" | (() => Hole | null);

export class Creature {
	readonly type: CreatureType;
	private currentHole: Hole; // 可變：瞬移時會更新
	private readonly scene: Phaser.Scene;
	private readonly visual: Renderable;
	private readonly useImage: boolean;
	private readonly baseScaleX: number;
	private readonly baseScaleY: number;
	// 視覺座標微調（dx / emergeY / hiddenY），瞬移時會重算
	private dx: number;
	private emergeY: number;
	private hiddenY: number;
	private alive: boolean = true;
	private exitCallback?: (reason: CreatureExitReason, self: Creature) => void;
	// 瞬移開始時的回呼，傳入「即將離開的舊洞」。GameScene 用此釋放舊洞（在新洞已卡位之後）。
	private teleportCallback?: (oldHole: Hole, self: Creature) => void;
	// 已被 retract strategy 卡位、但 teleport 動畫還沒抵達的新洞。
	// 若老鼠在 retract 動畫期間死亡（被打 / 被炸） → 此洞需釋放（否則永遠 leak）。
	private reservedNextHole: Hole | null = null;
	private retractTimer?: Phaser.Time.TimerEvent;
	private breathingTween?: Phaser.Tweens.Tween;
	private flickerTween?: Phaser.Tweens.Tween;
	// retract 動畫進行中的 tween（兩階段）；bombKill / hitByHammer 觸發時要 stop 掉，
	// 否則 retract 的 onComplete 會在死亡動畫期間呼叫 handleRetractComplete，
	// 進而觸發 teleport / strategy callback，造成「老鼠飛走但新洞沒被佔住」的 race，
	// 最終可能讓兩隻 creature 落到同一個洞。
	private retractTween?: Phaser.Tweens.Tween;
	// 瞬移時用：當 retract 處理完且決定 teleport 後，下次的 lifespanMs
	private retractStrategy: RetractStrategy = "destroy";
	private nextLifespanMs: number = 0;

	constructor(scene: Phaser.Scene, hole: Hole, type: CreatureType, lifespanMs: number) {
		this.scene = scene;
		this.type = type;
		this.currentHole = hole;

		const def = CREATURES[type];

		// 先抽 normal 變體（多變體時讓畫面更豐富）
		const normalKey = pickVariantKey(type, "normal", (k) => scene.textures.exists(k));
		this.useImage = normalKey !== null;

		// 用選中的 variant key 取 offset
		const offset = getCreatureOffset(type, normalKey ?? undefined);
		const emergeOffsetY = offset.emergeOffsetY ?? CREATURE_VISUAL.emergeOffsetY;

		this.dx = offset.dx;
		this.emergeY = hole.y + emergeOffsetY + offset.dy;
		this.hiddenY = hole.y + CREATURE_VISUAL.hiddenOffsetY;

		const x = hole.x + this.dx;
		const targetSize = CREATURE_VISUAL.displaySize * offset.sizeMul;

		if (this.useImage && normalKey) {
			const image = scene.add.image(x, this.hiddenY, normalKey);
			image.setDisplaySize(targetSize, targetSize);
			this.baseScaleX = image.scaleX;
			this.baseScaleY = image.scaleY;
			this.visual = image;
		} else {
			const text = scene.add.text(
				x,
				this.hiddenY,
				def.emoji,
				applyDefaultTextStyle({ fontSize: `${Math.round(96 * offset.sizeMul)}px` }),
			);
			text.setOrigin(0.5, 0.5);
			this.baseScaleX = 1;
			this.baseScaleY = 1;
			this.visual = text;
		}

		this.visual.setDepth(10);
		this.visual.setAlpha(0);
		this.applyScaleMultiplier(0.2);

		this.playEmerge();

		// 設定縮回計時器（lifespanMs 後自動退回）
		this.retractTimer = scene.time.delayedCall(lifespanMs, () => {
			if (this.alive) {
				this.retract();
			}
		});
	}

	onExit(cb: (reason: CreatureExitReason, self: Creature) => void): void {
		this.exitCallback = cb;
	}

	/**
	 * 設定 teleport 完成後要執行的回呼，傳入「即將離開的舊洞」。
	 * 與 retract strategy 配套使用：
	 *   1. retract 入口呼叫 strategy → 卡位新洞（markBusy）
	 *   2. retract + teleport 動畫期間，新洞、舊洞「都」保持 markBusy（避免新 spawn 補進）
	 *   3. teleportTo 一進來就 emit 此 callback → GameScene 釋放舊洞
	 */
	onTeleport(cb: (oldHole: Hole, self: Creature) => void): void {
		this.teleportCallback = cb;
	}

	/**
	 * 設定 retract 行為。對老鼠應該設成 () => spawnSystem.pickHole 之類的策略；
	 * 其他生物保留預設 "destroy"。
	 * 也可動態替換（例如打到老鼠後改為 destroy 之後再來看到的瞬移老鼠）。
	 */
	setRetractStrategy(strategy: RetractStrategy, nextLifespanMs: number = 0): void {
		this.retractStrategy = strategy;
		this.nextLifespanMs = nextLifespanMs;
	}

	get hole(): Hole {
		return this.currentHole;
	}

	/**
	 * 已被 retract strategy 卡位、但 teleport 還沒抵達的新洞。
	 * 死亡（hit / bomb）時 GameScene 必須釋放此洞，否則會永遠 busy。
	 */
	get pendingReservedHole(): Hole | null {
		return this.reservedNextHole;
	}

	private applyScaleMultiplier(m: number): void {
		this.visual.setScale(this.baseScaleX * m, this.baseScaleY * m);
	}

	private playEmerge(): void {
		// 浮出：上升 + 放大到 1× baseScale + 淡入，落點略高再回來（overshoot）製造彈性
		this.scene.tweens.add({
			targets: this.visual,
			y: this.emergeY,
			scaleX: this.baseScaleX,
			scaleY: this.baseScaleY,
			alpha: 1,
			duration: 260,
			ease: "Back.Out",
			onComplete: () => {
				if (!this.alive) return;
				this.startBreathing();
			},
		});
	}

	private startBreathing(): void {
		this.breathingTween = this.scene.tweens.add({
			targets: this.visual,
			y: this.emergeY - CREATURE_VISUAL.breathingAmplitude,
			duration: 700,
			ease: "Sine.InOut",
			yoyo: true,
			repeat: -1,
		});
	}

	private stopBreathing(): void {
		this.breathingTween?.stop();
		this.breathingTween = undefined;
	}

	// 由 GameScene 在槌子命中時呼叫
	hitByHammer(): boolean {
		if (!this.alive) {
			return false;
		}
		this.alive = false;
		this.cancelRetract();
		this.stopBreathing();
		this.stopFlicker();
		this.swapToStunned();
		SfxSystem.play(this.scene, "sfx-hit");
		this.playInnocentVoice(); // 友善動物的個別叫聲（mouse 沒有，方法內會自行判斷）

		const baseX = this.visual.x;
		this.scene.tweens.add({
			targets: this.visual,
			x: { from: baseX - 8, to: baseX + 8 },
			duration: 60,
			yoyo: true,
			repeat: 3,
			onComplete: () => {
				this.visual.x = baseX;
				this.fallIntoHole();
			},
		});
		return true;
	}

	get visualX(): number {
		return this.visual.x;
	}
	get visualY(): number {
		return this.visual.y;
	}

	private fallIntoHole(): void {
		this.scene.tweens.add({
			targets: this.visual,
			y: this.hiddenY,
			scaleX: this.baseScaleX * 0.4,
			scaleY: this.baseScaleY * 0.4,
			angle: 35,
			alpha: 0,
			duration: 280,
			ease: "Quad.In",
			onComplete: () => {
				this.exitCallback?.("hit", this);
				this.destroy();
			},
		});
	}

	private retract(): void {
		if (!this.alive) {
			return;
		}

		// 老鼠（teleport 策略）：先探查能不能找到下一個洞。
		//   找不到（場上沒空洞）→ 完全不縮回，重設下一次計時、繼續呼吸與 lifespan。
		//   找得到 → 走完整 retract 動畫，並在動畫結束後 teleport 到該洞。
		// 其他策略（destroy）：照常播 retract 動畫，結束後消失。
		let plannedHole: Hole | null = null;
		if (this.retractStrategy !== "destroy") {
			plannedHole = this.retractStrategy();
			if (plannedHole === null) {
				// 不縮回：重設 retract 計時、保留呼吸動畫
				this.retractTimer?.remove();
				this.retractTimer = this.scene.time.delayedCall(this.nextLifespanMs, () => {
					if (this.alive) this.retract();
				});
				return;
			}
			// 記下被 strategy 卡位的新洞；若中途被打 / 被炸，GameScene 會用 pendingReservedHole 釋放
			this.reservedNextHole = plannedHole;
		}

		// 注意：retract 過程中 this.alive 不立刻變 false，因為老鼠瞬移後仍要繼續存活
		this.stopBreathing();

		// 階段 1：往上彈一下（驚覺）
		this.retractTween = this.scene.tweens.add({
			targets: this.visual,
			y: this.emergeY - 14,
			duration: 110,
			ease: "Quad.Out",
			onComplete: () => {
				// 若中途已被打死或炸死 → 中止 retract 流程
				if (!this.alive) return;
				// 階段 2：縮進洞口
				this.retractTween = this.scene.tweens.add({
					targets: this.visual,
					y: this.hiddenY,
					scaleX: this.baseScaleX * 0.2,
					scaleY: this.baseScaleY * 0.2,
					alpha: 0,
					duration: 200,
					ease: "Quad.In",
					onComplete: () => {
						this.retractTween = undefined;
						if (!this.alive) return;
						this.handleRetractComplete(plannedHole);
					},
				});
			},
		});
	}

	/**
	 * 中止 retract 流程：停掉動畫、清掉計時器。
	 * hitByHammer / bombKill 必須先呼叫，否則 retract 的 onComplete 仍會跑，
	 * 進而觸發 teleport，與死亡動畫搶 visual、與 spawn 系統搶洞。
	 */
	private cancelRetract(): void {
		this.retractTween?.stop();
		this.retractTween = undefined;
		this.retractTimer?.remove();
		this.retractTimer = undefined;
	}

	/**
	 * retract 動畫完成後：依事先在 retract 入口探查到的 plannedHole 決定行為。
	 *  - plannedHole 非 null → teleport 到該洞重新冒出（瞬移）
	 *  - plannedHole 為 null → destroy（其他生物的預設路徑）
	 *
	 * 注意：對 mouse 策略而言，「沒空洞」的情況已在 retract() 入口被攔截、
	 * 根本不會走到這裡，所以這裡看到 null 一定是 "destroy" 路徑。
	 */
	private handleRetractComplete(plannedHole: Hole | null): void {
		if (plannedHole) {
			this.teleportTo(plannedHole, this.nextLifespanMs);
			return;
		}
		// destroy 路徑
		this.alive = false;
		this.exitCallback?.("retract", this);
		this.destroy();
	}

	/**
	 * 瞬移到新洞：在隱藏狀態下移動位置 → 重新計算 emergeY/hiddenY → 再播 emerge 動畫
	 * 不會 emit "retract"，因為這個老鼠仍視為同一隻活著的個體。
	 */
	private teleportTo(newHole: Hole, lifespanMs: number): void {
		// 通知 GameScene：舊洞已可釋放（新洞已在 retract 入口被卡位）
		const oldHole = this.currentHole;
		if (oldHole !== newHole) {
			this.teleportCallback?.(oldHole, this);
		}
		this.currentHole = newHole;
		// 預約已實際抵達 → 清掉 reservedNextHole，不再需要在死亡時補釋放
		this.reservedNextHole = null;
		// 重新算位置（新洞可能適用同一份 offset，不依賴 variant 重抽）
		const offset = getCreatureOffset(this.type);
		const emergeOffsetY = offset.emergeOffsetY ?? CREATURE_VISUAL.emergeOffsetY;
		this.dx = offset.dx;
		this.emergeY = newHole.y + emergeOffsetY + offset.dy;
		this.hiddenY = newHole.y + CREATURE_VISUAL.hiddenOffsetY;

		// 移到新洞下方（保持 alpha=0、scale 小，下一輪 emerge 會處理）
		this.visual.x = newHole.x + this.dx;
		this.visual.y = this.hiddenY;
		this.visual.setAlpha(0);
		this.applyScaleMultiplier(0.2);

		// 重新冒出
		this.playEmerge();

		// 重新計時下一次 retract
		this.retractTimer?.remove();
		this.retractTimer = this.scene.time.delayedCall(lifespanMs, () => {
			if (this.alive) this.retract();
		});
	}

	bombKill(): void {
		if (!this.alive) {
			return;
		}
		this.alive = false;
		this.cancelRetract();
		this.stopBreathing();
		this.stopFlicker();
		this.swapToStunned();
		this.playInnocentVoice(); // 被炸時也疊播友善動物叫聲（mouse 不會發聲）

		this.scene.tweens.add({
			targets: this.visual,
			angle: 360,
			alpha: 0,
			scaleX: this.baseScaleX * 0.4,
			scaleY: this.baseScaleY * 0.4,
			y: this.currentHole.y - 80,
			duration: 600,
			ease: "Cubic.In",
			onComplete: () => {
				this.exitCallback?.("bomb", this);
				this.destroy();
			},
		});
	}

	/**
	 * 友善動物（cat / dog / owl / hawk）被打中或被炸時的個別叫聲。
	 * 與場景級的 sfx-hit / sfx-bomb 疊播；mouse 不發聲（cuteness 而已，不額外加吵雜聲）。
	 * 缺檔時 SfxSystem 會靜默處理。
	 */
	private playInnocentVoice(): void {
		const map: Partial<Record<CreatureType, "sfx-cat" | "sfx-dog" | "sfx-owl" | "sfx-hawk">> = {
			cat: "sfx-cat",
			dog: "sfx-dog",
			owl: "sfx-owl",
			hawk: "sfx-hawk",
		};
		const key = map[this.type];
		if (key) SfxSystem.play(this.scene, key);
	}

	private swapToStunned(): void {
		if (!this.useImage) return;
		const stunnedKey = pickVariantKey(this.type, "stunned", (k) =>
			this.scene.textures.exists(k),
		);
		if (!stunnedKey) return;
		(this.visual as Phaser.GameObjects.Image).setTexture(stunnedKey);
	}

	/**
	 * 紅色閃爍效果（漢他警報用）。
	 *   intervalMs > 0：以該週期切換 tint 為紅色 / 白色
	 *   intervalMs <= 0：停止閃爍、回到原本色
	 */
	setFlicker(intervalMs: number): void {
		this.stopFlicker();
		if (intervalMs <= 0) return;
		// 只有圖片可以 setTint；emoji 文字版無視
		if (!(this.visual instanceof Phaser.GameObjects.Image)) return;

		const img = this.visual;
		this.flickerTween = this.scene.tweens.addCounter({
			from: 0,
			to: 1,
			duration: intervalMs,
			yoyo: true,
			repeat: -1,
			onUpdate: (tween) => {
				const t = tween.getValue() ?? 0;
				// 介於白色 (0xffffff) 與紅色 (0xff5555) 之間插值
				const r = 0xff;
				const g = Math.round(0xff - (0xff - 0x55) * t);
				const b = Math.round(0xff - (0xff - 0x55) * t);
				img.setTint((r << 16) | (g << 8) | b);
			},
		});
	}

	private stopFlicker(): void {
		this.flickerTween?.stop();
		this.flickerTween = undefined;
		if (this.visual instanceof Phaser.GameObjects.Image) {
			this.visual.clearTint();
		}
	}

	destroy(): void {
		this.stopBreathing();
		this.stopFlicker();
		this.visual.destroy();
	}

	get isAlive(): boolean {
		return this.alive;
	}
}
