let TOKEN = localStorage.getItem("token") || null;
let MODE = "register";

function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 2500);
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (TOKEN) headers["Authorization"] = `Bearer ${TOKEN}`;
  const resp = await fetch(path, { ...options, headers });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || "حدث خطأ");
  return data;
}

function toggleMode() {
  MODE = MODE === "register" ? "login" : "register";
  document.getElementById("registerFields").classList.toggle("hidden", MODE === "login");
  document.getElementById("authBtn").textContent = MODE === "register" ? "إنشاء حساب" : "دخول";
  document.querySelector(".link-toggle").innerHTML =
    MODE === "register"
      ? 'عندك حساب؟ <a onclick="toggleMode()">سجّل دخولك</a>'
      : 'ما عندك حساب؟ <a onclick="toggleMode()">أنشئ الآن</a>';
}

async function submitAuth() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const errBox = document.getElementById("authError");
  errBox.style.display = "none";

  const payload = { email, password };
  let path = "/api/auth/login";
  if (MODE === "register") {
    payload.business_name = document.getElementById("bizName").value.trim();
    payload.libyana_phone = document.getElementById("phoneReg").value.trim();
    path = "/api/auth/register";
  }

  try {
    const data = await api(path, { method: "POST", body: JSON.stringify(payload) });
    TOKEN = data.token;
    localStorage.setItem("token", TOKEN);
    await loadDashboard();
  } catch (e) {
    errBox.textContent = e.message;
    errBox.style.display = "block";
  }
}

function logout() {
  api("/api/auth/logout", { method: "POST" }).catch(() => {});
  TOKEN = null;
  localStorage.removeItem("token");
  document.getElementById("dashView").classList.add("hidden");
  document.getElementById("authView").classList.remove("hidden");
}

async function loadDashboard() {
  try {
    const data = await api("/api/dashboard");
    document.getElementById("authView").classList.add("hidden");
    document.getElementById("dashView").classList.remove("hidden");

    const badge = document.getElementById("subBadge");
    badge.textContent = data.subscription_active ? "فعّال ✅" : "منتهي ❌";
    badge.className = "badge " + (data.subscription_active ? "active" : "expired");
    document.getElementById("subExpiry").textContent = data.subscription_expires_at
      ? new Date(data.subscription_expires_at).toLocaleDateString("ar")
      : "-";
    document.getElementById("subPrice").textContent = `$${data.monthly_price_usd}/شهرياً`;
    document.getElementById("incomingUrl").textContent = data.incoming_webhook_url;
    document.getElementById("phoneInput").value = data.libyana_phone || "";
    document.getElementById("webhookInput").value = data.outgoing_webhook_url || "";

    const logsList = document.getElementById("logsList");
    if (!data.logs.length) {
      logsList.innerHTML = "لا توجد عمليات بعد";
    } else {
      logsList.innerHTML = data.logs
        .map(
          (l) =>
            `<div class="log-item"><span>${l.phone} — ${l.amount_lyd} د.ل</span><span>${
              l.relayed_ok ? "✅" : "⚠️"
            } ${new Date(l.received_at).toLocaleString("ar")}</span></div>`
        )
        .join("");
    }

    await loadPendingPayment();
  } catch (e) {
    logout();
  }
}

async function loadPendingPayment() {
  try {
    const data = await api("/api/payment/pending");
    const card = document.getElementById("paymentCard");
    if (data.pending) {
      card.classList.remove("hidden");
      document.getElementById("paymentTitle").textContent =
        data.purpose === "trial_deposit" ? "💳 فعّل تجربتك المجانية (وديعة 1$)" : "💳 تجديد الاشتراك (7$)";
      document.getElementById("paymentAmount").textContent = `${data.amount} USDT`;
      document.getElementById("paymentAddress").textContent = data.wallet_address;
    } else {
      card.classList.add("hidden");
    }
  } catch (e) {}
}

async function requestRenewal() {
  try {
    await api("/api/payment/create-renewal", { method: "POST" });
    showToast("✅ جهّزنا لك طلب التجديد، شوف تفاصيله بالأسفل");
    loadPendingPayment();
  } catch (e) {
    showToast("❌ " + e.message);
  }
}

async function saveSettings() {
  try {
    await api("/api/settings", {
      method: "POST",
      body: JSON.stringify({
        outgoing_webhook_url: document.getElementById("webhookInput").value.trim(),
      }),
    });
    showToast("✅ تم الحفظ");
    loadDashboard();
  } catch (e) {
    showToast("❌ " + e.message);
  }
}

function copyText(id) {
  navigator.clipboard.writeText(document.getElementById(id).textContent);
  showToast("✅ تم النسخ");
}

if (TOKEN) loadDashboard();

