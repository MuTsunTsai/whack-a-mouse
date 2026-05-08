// 資源 URL 解析：嘗試多種副檔名，找到實際存在於 server 的那一份
//
// 安全策略：
//   - 圖片：webp / png / jpg / jpeg 依序試。WebP 在「瀏覽器無法解碼時」會被跳過
//     （透過一支 1×1 純 WebP data URL 的探針），避免拿到 WebP 後 Phaser 解碼失敗
//     導致該資源變空白。
//   - 音訊：opus / mp3 / ogg / wav / m4a 依序試。Opus 同樣有能力偵測；mp3 是萬用 fallback。
//
// 為什麼用 HEAD？避免一次抓整段音訊只為了確認存在；HEAD 只看 status + Content-Type。
//
// 為什麼判斷 Content-Type 而非單看 status？
//   Rsbuild dev server 對找不到的 public/ 路徑會回 200 + HTML（SPA fallback），
//   單看 res.ok 會誤判成「檔案存在」。判斷 Content-Type 才能正確識別。

let webpSupportPromise: Promise<boolean> | null = null;
let opusSupport: boolean | null = null;

/**
 * 偵測瀏覽器是否能解碼 WebP。
 * 用一支極小的 WebP data URL 餵給 createImageBitmap 試解碼；可解 → 支援。
 * 結果快取一次、後續直接拿。
 */
function detectWebpSupport(): Promise<boolean> {
	if (webpSupportPromise) return webpSupportPromise;
	webpSupportPromise = (async () => {
		// 1×1 lossless WebP（base64）
		const dataUrl =
			"data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=";
		try {
			if (typeof createImageBitmap !== "function") {
				// 老到沒有 createImageBitmap 的瀏覽器，保險起見視為不支援
				return false;
			}
			const blob = await fetch(dataUrl).then((r) => r.blob());
			await createImageBitmap(blob);
			return true;
		} catch {
			return false;
		}
	})();
	return webpSupportPromise;
}

/**
 * 偵測瀏覽器是否能解碼 Opus（在 ogg / webm 容器內）。
 * 用 HTMLAudioElement.canPlayType 同步檢查；回傳 "probably" 或 "maybe" 都視為支援。
 * 結果快取一次、後續直接拿。
 */
function detectOpusSupport(): boolean {
	if (opusSupport !== null) return opusSupport;
	try {
		const a = document.createElement("audio");
		// .opus 檔副檔名約定為 ogg 容器 + opus codec；webm 容器版本部分舊版 Safari 才支援
		const oggOpus = a.canPlayType('audio/ogg; codecs="opus"');
		const webmOpus = a.canPlayType('audio/webm; codecs="opus"');
		opusSupport = oggOpus !== "" || webmOpus !== "";
	} catch {
		opusSupport = false;
	}
	return opusSupport;
}

async function assetExists(url: string): Promise<boolean> {
	try {
		const res = await fetch(url, { method: "HEAD" });
		if (!res.ok) return false;
		const contentType = res.headers.get("content-type") ?? "";
		return contentType.startsWith("image/");
	} catch {
		return false;
	}
}

/**
 * 嘗試多種副檔名找到實際存在的圖檔；找不到回傳 null。
 * 副檔名優先順序：
 *   - webp（瀏覽器支援時優先用、檔案小）
 *   - png / jpg / jpeg（webp 缺檔或瀏覽器不支援時的 fallback）
 * 若是 webp 但瀏覽器不支援會自動跳過。
 */
export async function resolveImageUrl(name: string): Promise<string | null> {
	const webpOk = await detectWebpSupport();
	const exts = ["webp", "png", "jpg", "jpeg"];
	for (const ext of exts) {
		if (ext === "webp" && !webpOk) continue;
		const url = `assets/images/${name}.${ext}`;
		if (await assetExists(url)) return url;
	}
	return null;
}

/**
 * 嘗試多種副檔名找到實際存在的音訊檔；找不到回傳 null。
 * 副檔名優先順序：
 *   - opus（瀏覽器支援時優先用、檔案最小、約 mp3 一半大）
 *   - mp3（萬用 fallback、所有瀏覽器都支援）
 *   - ogg / wav / m4a（其他可能格式）
 * 若是 opus 但瀏覽器不支援會自動跳過。
 */
export async function resolveAudioUrl(name: string): Promise<string | null> {
	const opusOk = detectOpusSupport();
	const exts = ["opus", "mp3", "ogg", "wav", "m4a"];
	for (const ext of exts) {
		if (ext === "opus" && !opusOk) continue;
		const url = `assets/audio/${name}.${ext}`;
		try {
			const res = await fetch(url, { method: "HEAD" });
			if (!res.ok) continue;
			const ct = res.headers.get("content-type") ?? "";
			if (ct.startsWith("audio/") || ct.startsWith("application/octet-stream")) return url;
		} catch {
			// 忽略
		}
	}
	return null;
}
