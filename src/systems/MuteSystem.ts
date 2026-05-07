// 全域靜音狀態：影響 BGM 與 SFX，狀態存於 localStorage
//
// 使用方式：
//   - 取狀態：MuteSystem.isMuted()
//   - 切換：MuteSystem.toggle(game) — 並立即套用到 game.sound.mute
//   - 同步：MuteSystem.apply(game) — 啟動時呼叫，把 localStorage 的值套到 sound 系統

import Phaser from "phaser";

const KEY_MUTED = "wam:muted";

type Listener = (muted: boolean) => void;
const listeners: Listener[] = [];

function read(): boolean {
	try {
		return localStorage.getItem(KEY_MUTED) === "1";
	} catch {
		return false;
	}
}

function write(muted: boolean): void {
	try {
		localStorage.setItem(KEY_MUTED, muted ? "1" : "0");
	} catch {
		// 忽略
	}
}

export const MuteSystem = {
	isMuted(): boolean {
		return read();
	},

	apply(game: Phaser.Game): void {
		game.sound.mute = read();
	},

	toggle(game: Phaser.Game): boolean {
		const next = !read();
		write(next);
		game.sound.mute = next;
		for (const cb of listeners) cb(next);
		return next;
	},

	onChange(cb: Listener): () => void {
		listeners.push(cb);
		return () => {
			const idx = listeners.indexOf(cb);
			if (idx >= 0) listeners.splice(idx, 1);
		};
	},
};
