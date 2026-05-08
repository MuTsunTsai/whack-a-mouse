// 延遲資源載入：
// 把比較後面才會用到的大資源（魔王關 BGM / 結局 BGM / 過關 + 結局插畫）
// 從 BootScene 拿掉、改在玩家進入 StartScene 後在背景中下載。
//
// 用法：
//   1. StartScene / TitleScene 啟動時呼叫 LazyLoader.start(game) 開始背景拉
//   2. 需要某資源時呼叫 await LazyLoader.waitFor(scene, key)：
//      - 若已載入：立刻 resolve
//      - 若還在下載：傳回 Promise，呼叫端可顯示 loading 直到完成
//      - 若無此資源（檔案不存在）：resolve（程式自身已有 fallback）
//   3. MusicSystem 直接 fire-and-forget LazyLoader.requestNow(key)：
//      在背景拉完後再次呼叫 play() 就會自動播
//
// 為什麼要透過 assetResolver 而不是直接 this.load.image(key, "assets/...")？
//   專案 BootScene 對缺檔資產採「靜默 fallback」策略，這裡也比照辦理：
//   檔案不存在不報錯，呼叫端的程式仍能用既有 fallback（emoji / 純色 rect / 靜音）。
//   另外 resolveImageUrl 內含 WebP 能力探測，遇到只放 webp 但瀏覽器不支援會自動跳過。

import Phaser from "phaser";
import { resolveAudioUrl, resolveImageUrl } from "../utils/assetResolver.ts";

type AssetKind = "image" | "audio";

interface LazyAsset {
	key: string;
	kind: AssetKind;
	// 解析出的實際 URL（可能 null = 檔案不存在）
	url: string | null;
	// 載入 Promise（resolve 時 = 此資源已完成處理；無檔案 / 已載入 / 載入失敗都會 resolve）
	promise: Promise<void>;
}

const assets = new Map<string, LazyAsset>();
let started = false;
let game: Phaser.Game | null = null;

// === 哪些資源要延後 ===
// 注意：這份清單跟 BootScene 的「不延後」清單互斥。修改任一邊都要同步檢查另一邊。
// 圖片不延後（單檔都不大、初始 43MB 主要是音樂）；只把後期才聽到的大 BGM 延後。
const LAZY_IMAGES: string[] = [];
const LAZY_AUDIO = [
	"bgm-game-boss",   // 5.9 MB（第 5 關才聽到）
	"bgm-ending-good", // 5.3 MB（全破才聽到）
	"bgm-ending-bad",  // 3.9 MB（全破才聽到）
];

// resolveImageUrl / resolveAudioUrl 由 src/utils/assetResolver.ts 共用提供（含 WebP 能力探測）

// 用一個獨立的 LoaderPlugin 在背景拉資源（不阻擋 scene）
function loadOne(asset: LazyAsset): Promise<void> {
	return new Promise<void>((resolve) => {
		if (!game || !asset.url) {
			resolve();
			return;
		}

		// 已經在 cache 中 → 直接 resolve
		if (asset.kind === "image" && game.textures.exists(asset.key)) {
			resolve();
			return;
		}
		if (asset.kind === "audio" && game.cache.audio.exists(asset.key)) {
			resolve();
			return;
		}

		// 為這一筆資源建獨立 loader plugin（避免跟 scene 的 loader 互卡）
		const loader = new Phaser.Loader.LoaderPlugin(game.scene.systemScene);
		if (asset.kind === "image") {
			loader.image(asset.key, asset.url);
		} else {
			loader.audio(asset.key, asset.url);
		}
		loader.once(Phaser.Loader.Events.COMPLETE, () => resolve());
		// 即使載入失敗也 resolve，由呼叫端處理 fallback
		loader.once(Phaser.Loader.Events.FILE_LOAD_ERROR, () => resolve());
		loader.start();
	});
}

export const LazyLoader = {
	/**
	 * 啟動背景下載。應該在玩家進入 StartScene 時呼叫一次（重複呼叫會被忽略）。
	 */
	start(g: Phaser.Game): void {
		if (started) return;
		started = true;
		game = g;

		const allAssets: Array<{ key: string; kind: AssetKind }> = [
			...LAZY_IMAGES.map((key) => ({ key, kind: "image" as const })),
			...LAZY_AUDIO.map((key) => ({ key, kind: "audio" as const })),
		];

		for (const a of allAssets) {
			const promise = (async () => {
				const url = a.kind === "image"
					? await resolveImageUrl(a.key)
					: await resolveAudioUrl(a.key);
				const entry: LazyAsset = { key: a.key, kind: a.kind, url, promise: Promise.resolve() };
				// 暫存於 map（promise 之後會 reassign）
				assets.set(a.key, entry);
				if (!url) return; // 檔案不存在 → 不載入、靜默 fallback
				await loadOne(entry);
			})();
			// 暫時用 placeholder entry，下面 waitFor 會等它的 promise
			assets.set(a.key, {
				key: a.key,
				kind: a.kind,
				url: null,
				promise,
			});
		}
	},

	/**
	 * 等待某資源載入完成。回傳 Promise；
	 *   - 不在延後清單內的 key：resolve(false)（呼叫端不需 await）
	 *   - 已載入：resolve(false)（沒有等待）
	 *   - 還在下載：等到完成或失敗才 resolve(true)
	 * 回傳的 boolean 表示「呼叫端是否真的等了」，可用來決定要不要顯示 loading 動畫。
	 */
	async waitFor(key: string): Promise<boolean> {
		const entry = assets.get(key);
		if (!entry) return false;
		// 已載入則立刻 false
		if (game) {
			if (entry.kind === "image" && game.textures.exists(key)) return false;
			if (entry.kind === "audio" && game.cache.audio.exists(key)) return false;
		}
		await entry.promise;
		return true;
	},

	/**
	 * 同步檢查資源是否已就緒（可能尚未開始下載、可能已完成）。
	 * 主要給 MusicSystem 在「先試播、不行就 fire-and-forget 拉」的時序判斷用。
	 */
	isReady(key: string): boolean {
		if (!game) return false;
		const entry = assets.get(key);
		if (!entry) return false;
		if (entry.kind === "image") return game.textures.exists(key);
		return game.cache.audio.exists(key);
	},
};
