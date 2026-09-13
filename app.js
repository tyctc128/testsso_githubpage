// SSO 測試站共用程式。
// 正式的遊戲網站真正需要的只有：PORTAL 網址、import sso-client.js、sso.login() / sso.logout() / sso.getUser()。
const LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);
const PORTAL = LOCAL ? "http://localhost:3000" : "https://hspssso-portal.vercel.app";

const site = document.body.dataset.site;
const siteName = document.body.dataset.name;
const $ = (id) => document.getElementById(id);
const log = (msg) => {
  const t = new Date().toLocaleTimeString("zh-TW", { hour12: false });
  $("log").textContent = `[${t}] ${msg}\n` + $("log").textContent;
};
$("origin").textContent = `本站：${location.origin}　｜　統一登入頁：${PORTAL}`;

let sso, fs, db;
try {
  sso = await import(`${PORTAL}/sso-client.js`);
  fs = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js");
  db = fs.getFirestore(sso.app);
} catch (e) {
  $("status").className = "status out";
  $("status").textContent = "載入統一登入程式失敗。統一登入頁是否已啟動？";
  log(String(e));
  throw e;
}


function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

async function render(user) {
  const st = $("status");
  if (!user) {
    st.className = "status out"; st.textContent = "未登入";
    $("who").textContent = "";
    $("btnLogin").disabled = false; $("btnLogout").disabled = true; $("btnWrite").disabled = true; $("btnRead").disabled = true;
    return;
  }
  const t = await user.getIdTokenResult();
  st.className = "status in"; st.textContent = `已登入：${user.uid}`;
  $("who").innerHTML = [
    ["uid", user.uid], ["email", user.email], ["displayName", user.displayName || "-"],
    ["登入方式", t.signInProvider],
    ["role", t.claims.role ?? "-"], ["no", t.claims.no ?? "-"], ["studentId", t.claims.studentId ?? "-"],
    ["登入時間", t.authTime],
  ].map(([k, v]) => `<div><b>${k}</b>${esc(v)}</div>`).join("");
  $("btnLogin").disabled = true; $("btnLogout").disabled = false; $("btnWrite").disabled = false; $("btnRead").disabled = false;
}

// 先等 ready：若是從統一登入頁帶票回來，這時票已經換好，不會先閃一下「未登入」
const first = await sso.ready;
const cb = sso.getCallbackResult();
if (cb) log(cb.ok ? "從統一登入頁帶票回來，已用票換成本站的登入狀態" : `帶票回來但換票失敗：${cb.error}`);
await render(first);
log(first ? `登入狀態：已登入 ${first.uid}` : "登入狀態：未登入");
sso.onAuthStateChanged(sso.auth, (u) => { render(u); log(u ? `登入狀態變更：已登入 ${u.uid}` : "登入狀態變更：未登入"); });

$("btnLogin").onclick = () => { log("轉址到統一登入頁…"); sso.login(); };
$("btnLogout").onclick = async () => { await sso.logout(); log("已登出本站。其他站與統一登入頁不受影響。"); };
$("btnWrite").onclick = async () => {
  const u = sso.getUser(); if (!u) return;
  try {
    await fs.setDoc(
      fs.doc(db, "gameProgress", u.uid, site, "latest"),
      { site, siteName, origin: location.origin, at: fs.serverTimestamp(), count: fs.increment(1) },
      { merge: true }
    );
    log(`已寫入 gameProgress/${u.uid}/${site}/latest`);
  } catch (e) { log(`寫入失敗：${e.code || e.message}`); }
};
$("btnRead").onclick = async () => {
  const u = sso.getUser(); if (!u) return;
  for (const s of ["githubpage", "vercel", "cloudflare"]) {
    try {
      const snap = await fs.getDoc(fs.doc(db, "gameProgress", u.uid, s, "latest"));
      if (!snap.exists()) { log(`${s}：沒有資料`); continue; }
      const d = snap.data();
      const when = d.at && d.at.toDate ? d.at.toDate().toLocaleString("zh-TW", { hour12: false }) : "-";
      log(`${s}：來自 ${d.origin}，寫入 ${d.count} 次，最後 ${when}`);
    } catch (e) { log(`${s}：讀取失敗 ${e.code || e.message}`); }
  }
};
