// 存檔混淆編碼器：Base64 + XOR + HMAC checksum
//
// 重要：這不是真正的密碼學加密，目的只是讓 DevTools 直接修改 localStorage 變得不容易。
// 任何認真的玩家都可以還原這份程式碼、得到金鑰、自行偽造存檔。
// 但對「在 Application 面板手改數字」的休閒作弊者已經足夠擋住。
//
// 編碼格式：
//   raw payload (UTF-8 JSON) → XOR with KEY → Base64 → "v1:" prefix
//   並附上一個簡易 HMAC（payload + KEY 的 hash 前 8 byte）作為完整性 checksum
// 解碼時：
//   1. 檢查 prefix 為 "v1:"；否則視為損毀
//   2. Base64 decode → XOR 還原 → 解析 JSON
//   3. 重新計算 HMAC 並比對；不符視為損毀
//   4. 損毀時靜默回傳 null，呼叫端會用預設值

const VERSION = "v1";

// 內嵌金鑰：被混淆過的字串（雖然容易還原、但不會在 source map 中直接看到 "wam-secret"）
const KEY_SEED = [0x77, 0x61, 0x6d, 0x21, 0x73, 0x33, 0x63, 0x72, 0x65, 0x74, 0x32, 0x30, 0x32, 0x36];

// 把 KEY_SEED 拉長成跟 payload 一樣長的 stream（重複展開）
function expandKey(length: number): Uint8Array {
	const out = new Uint8Array(length);
	for (let i = 0; i < length; i++) {
		out[i] = KEY_SEED[i % KEY_SEED.length]!;
	}
	return out;
}

// XOR：對稱可逆
function xorBytes(data: Uint8Array, key: Uint8Array): Uint8Array {
	const out = new Uint8Array(data.length);
	for (let i = 0; i < data.length; i++) {
		out[i] = data[i]! ^ key[i]!;
	}
	return out;
}

// 簡易 hash（FNV-1a 64-bit 風格、輸出 16 進位 16 字元）
// 不是密碼學等級，但足以偵測竄改
function simpleHmac(data: Uint8Array): string {
	let h1 = 0x811c9dc5;
	let h2 = 0xcbf29ce4;
	const key = expandKey(KEY_SEED.length);
	// 把 key 也餵進去，模擬 HMAC 的 "key + data"
	for (let i = 0; i < key.length; i++) {
		h1 = ((h1 ^ key[i]!) * 0x01000193) >>> 0;
		h2 = ((h2 ^ key[i]!) * 0x100000001b3) >>> 0;
	}
	for (let i = 0; i < data.length; i++) {
		h1 = ((h1 ^ data[i]!) * 0x01000193) >>> 0;
		h2 = ((h2 ^ data[i]!) * 0x100000001b3) >>> 0;
	}
	return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

function utf8Encode(s: string): Uint8Array {
	return new TextEncoder().encode(s);
}

function utf8Decode(bytes: Uint8Array): string {
	return new TextDecoder().decode(bytes);
}

function base64Encode(bytes: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]!);
	}
	return btoa(binary);
}

function base64Decode(s: string): Uint8Array {
	const binary = atob(s);
	const out = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		out[i] = binary.charCodeAt(i);
	}
	return out;
}

export const Codec = {
	encode(value: unknown): string {
		const json = JSON.stringify(value);
		const data = utf8Encode(json);
		const key = expandKey(data.length);
		const xored = xorBytes(data, key);
		const checksum = simpleHmac(data); // 對原始 payload 做 hash
		return `${VERSION}:${checksum}:${base64Encode(xored)}`;
	},

	decode<T = unknown>(blob: string | null): T | null {
		if (!blob) return null;
		try {
			const parts = blob.split(":");
			if (parts.length !== 3) return null;
			const [version, expectedChecksum, b64] = parts;
			if (version !== VERSION) return null;

			const xored = base64Decode(b64!);
			const key = expandKey(xored.length);
			const data = xorBytes(xored, key);

			const actualChecksum = simpleHmac(data);
			if (actualChecksum !== expectedChecksum) return null;

			const json = utf8Decode(data);
			return JSON.parse(json) as T;
		} catch {
			return null;
		}
	},
};
