// 集氣與炸彈庫存系統。
//
// 規則：
//  - 集氣槽容量 chargeMax (= 100)
//  - 庫存上限 maxBombs (= 3)
//  - 集滿一次 → 庫存 +1（不超過上限）→ 集氣槽歸 0、繼續累積
//  - 庫存已滿時集氣槽不再增加（停留在 max）
//  - 引爆需庫存 ≥ 1，扣 1 顆庫存
//  - 初始庫存依難度（由呼叫者傳入）

import { BALANCE } from "../config/balance.ts";

const MAX_BOMBS = 3;

export class ChargeSystem {
	private chargeValue: number = BALANCE.chargeStartValue;
	private bombs: number = 0;
	private listeners: Array<(state: { charge: number; bombs: number; chargeFull: boolean }) => void> = [];

	constructor(initialBombs: number = 0) {
		this.bombs = Math.max(0, Math.min(MAX_BOMBS, Math.floor(initialBombs)));
	}

	/** 集氣槽當前值（0~chargeMax） */
	get charge(): number {
		return this.chargeValue;
	}

	/** 炸彈庫存（0~maxBombs） */
	get bombStock(): number {
		return this.bombs;
	}

	/** 庫存是否滿（用來決定要不要繼續累積集氣） */
	get isStockFull(): boolean {
		return this.bombs >= MAX_BOMBS;
	}

	/** 集氣槽是否到達 100% */
	get chargeFull(): boolean {
		return this.chargeValue >= BALANCE.chargeMax;
	}

	/** 是否可釋放炸彈 */
	get canDetonate(): boolean {
		return this.bombs > 0;
	}

	/** 加減集氣值；若到達 chargeMax 且庫存未滿 → 庫存 +1、集氣歸 0、剩餘溢出值補進新一輪集氣 */
	add(delta: number): void {
		this.chargeValue += delta;
		if (this.chargeValue < 0) this.chargeValue = 0;

		// 集氣到滿且庫存還能增加 → 結算成炸彈、剩下的繼續往下一輪累積
		while (this.chargeValue >= BALANCE.chargeMax && this.bombs < MAX_BOMBS) {
			this.chargeValue -= BALANCE.chargeMax;
			this.bombs += 1;
		}
		// 庫存已滿：集氣固定壓在最大值（不再上升）
		if (this.bombs >= MAX_BOMBS && this.chargeValue > BALANCE.chargeMax) {
			this.chargeValue = BALANCE.chargeMax;
		}

		this.notify();
	}

	/** 嘗試扣一顆炸彈；成功回傳 true */
	consume(): boolean {
		if (this.bombs <= 0) return false;
		this.bombs -= 1;
		this.notify();
		return true;
	}

	onChange(cb: (state: { charge: number; bombs: number; chargeFull: boolean }) => void): void {
		this.listeners.push(cb);
	}

	private notify(): void {
		const state = {
			charge: this.chargeValue,
			bombs: this.bombs,
			chargeFull: this.chargeFull,
		};
		for (const cb of this.listeners) cb(state);
	}
}

export const BOMB_STOCK_MAX = MAX_BOMBS;
