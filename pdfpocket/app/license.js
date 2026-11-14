// 离线授权（ECDSA P-256）：码 = base64url(payloadJson) + "." + base64url(签名)
// payload: {e: 邮箱, p: "pro", x: 到期日 或 "lifetime", i: 序号, v: 授权代际}
//
// 这里只有**公钥**——私钥在发布者本机（store/keys/private-key.pem），永远不进包。
// 公钥能验签但不能签发：即使有人把整份源码读完，也造不出一个能通过校验的码。
// 但请注意：离线校验挡不住"把下面 verify 改成 return {ok:true}" 这种做法，
// 那属于代码完整性问题，和签名算法无关。
const PUB = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEDL0hlSoF9q_AfvoiugOVyF7AvGZ6HXgmoFMSerAor9MpZWbOXZG4RvWfh946GJTP53h8K4-0HfPq4tFWQAcyLQ";

// 当前代码接受的授权代际。要收「大版本升级费」时 +1，并给老用户换发新码。
export const LICENSE_MAJOR = 1;

const enc = new TextEncoder();
let _key = null;

function unb64url(str) {
  const pad = str.length % 4 ? "=".repeat(4 - (str.length % 4)) : "";
  const s = atob(str.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function publicKey() {
  if (!_key) {
    _key = await crypto.subtle.importKey(
      "spki", unb64url(PUB),
      { name: "ECDSA", namedCurve: "P-256" },
      false, ["verify"],          // 只有"验"，拿不到"签"
    );
  }
  return _key;
}

// 返回 {ok, email, plan, until, seq, major} 或 {ok:false, reason}
export async function verify(key) {
  try {
    const [payload, sig] = String(key).trim().split(".");
    if (!payload || !sig) return { ok: false, reason: "badFormat" };
    const sigBytes = unb64url(sig);
    if (sigBytes.length !== 64) return { ok: false, reason: "badFormat" };
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      await publicKey(), sigBytes, enc.encode(payload),
    );
    if (!ok) return { ok: false, reason: "badKey" };
    const data = JSON.parse(new TextDecoder().decode(unb64url(payload)));
    if (data.p !== "pro") return { ok: false, reason: "badKey" };
    if (data.x !== "lifetime") {
      const today = new Date().toISOString().slice(0, 10);
      if (today > data.x) return { ok: false, reason: "expired", until: data.x };
    }
    const major = Number(data.v || 1);
    if (major < LICENSE_MAJOR) return { ok: false, reason: "upgrade", need: major, want: LICENSE_MAJOR };
    return { ok: true, email: data.e, plan: data.p, until: data.x, seq: data.i, major };
  } catch (e) {
    return { ok: false, reason: "badKey" };
  }
}
