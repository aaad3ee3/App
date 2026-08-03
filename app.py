# -*- coding: utf-8 -*-
"""
LibyanaPay — خدمة SaaS لكشف تحويلات ليبيانا تلقائياً، بنظام اشتراك شهري.
كل مشترك يحط رقم ليبيانا الخاص فيه + تطبيق SMS Gateway، ويربطه برابط
webhook خاص فيه يعطيه إياه النظام، ونحن ننقل له كل تحويل يوصل فوراً.
"""
import os
import re
import sys
import traceback

from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
import requests

import db
import payments

sys.stdout.reconfigure(line_buffering=True)

ADMIN_KEY = os.environ.get("ADMIN_KEY", "")

app = Flask(__name__)
CORS(app)

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _auth_email():
    token = request.headers.get("Authorization", "").replace("Bearer ", "").strip()
    if not token:
        return None
    return db.get_session_email(token)


def _require_auth():
    email = _auth_email()
    if not email:
        return None, (jsonify({"ok": False, "error": "unauthorized"}), 401)
    return email, None


# ---------------------------------------------------------------------------
# التسجيل وتسجيل الدخول
# ---------------------------------------------------------------------------
@app.route("/api/auth/register", methods=["POST"])
def register():
    data = request.get_json(force=True, silent=True) or {}
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    business_name = str(data.get("business_name", "")).strip()
    libyana_phone = str(data.get("libyana_phone", "")).strip()

    if not EMAIL_PATTERN.match(email):
        return jsonify({"ok": False, "error": "إيميل غير صالح"}), 400
    if len(password) < 6:
        return jsonify({"ok": False, "error": "كلمة السر لازم تكون 6 أحرف على الأقل"}), 400
    if not business_name:
        return jsonify({"ok": False, "error": "أدخل اسم نشاطك التجاري"}), 400
    if not libyana_phone.isdigit() or len(libyana_phone) < 8:
        return jsonify({"ok": False, "error": "رقم ليبيانا غير صالح"}), 400
    if db.email_exists(email):
        return jsonify({"ok": False, "error": "الإيميل مسجّل من قبل"}), 409
    if db.phone_already_used_for_trial(libyana_phone):
        # هذا رقم استُخدم من قبل بحساب ثاني — يمنع تكرار التجربة المجانية
        # حتى لو غيّر الإيميل أو استخدم VPN (الرقم نفسه لا يتكرر أبداً)
        return jsonify(
            {"ok": False, "error": "هذا الرقم مستخدم من قبل بحساب آخر، التجربة المجانية متاحة مرة وحدة بس لكل رقم"}
        ), 409

    password_hash = generate_password_hash(password)
    signup_ip = request.headers.get("X-Forwarded-For", request.remote_addr)
    try:
        tenant = db.create_tenant(email, password_hash, business_name, libyana_phone, signup_ip)
    except Exception:
        # حماية إضافية على مستوى قاعدة البيانات نفسها (Race Condition نادر جداً)
        return jsonify(
            {"ok": False, "error": "هذا الرقم مستخدم من قبل بحساب آخر"}
        ), 409

    token = db.create_session(email)

    # ننشئ طلب دفع الوديعة (1$) فوراً — التجربة ما تُفعَّل إلا بعد تأكيد الدفع فعلياً
    try:
        request_id, exact_amount = payments.create_payment_request(
            email, "trial_deposit", db.TRIAL_DEPOSIT_USD
        )
        deposit_info = {
            "request_id": request_id,
            "amount": str(exact_amount),
            "wallet_address": payments.SAAS_WALLET_ADDRESS,
        }
    except Exception as e:
        deposit_info = {"error": str(e)}

    return jsonify(
        {
            "ok": True,
            "token": token,
            "webhook_secret": tenant["webhook_secret"],
            "trial_days": db.TRIAL_DAYS,
            "deposit_required_usd": db.TRIAL_DEPOSIT_USD,
            "deposit_payment": deposit_info,
        }
    )


@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json(force=True, silent=True) or {}
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))

    tenant = db.get_tenant(email)
    if not tenant:
        return jsonify({"ok": False, "error": "بيانات الدخول غير صحيحة"}), 401

    if db.is_locked(email):
        return jsonify(
            {"ok": False, "error": "الحساب مقفل مؤقتاً بسبب محاولات فاشلة كثيرة، حاول بعد 5 دقايق"}
        ), 429

    if not check_password_hash(tenant["password_hash"], password):
        db.register_failed_login(email)
        return jsonify({"ok": False, "error": "بيانات الدخول غير صحيحة"}), 401

    db.reset_failed_login(email)
    token = db.create_session(email)
    return jsonify({"ok": True, "token": token})


@app.route("/api/auth/logout", methods=["POST"])
def logout():
    token = request.headers.get("Authorization", "").replace("Bearer ", "").strip()
    if token:
        db.delete_session(token)
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# لوحة التحكم والإعدادات
# ---------------------------------------------------------------------------
@app.route("/api/payment/status", methods=["GET"])
def payment_status():
    email, err = _require_auth()
    if err:
        return err
    tenant = db.get_tenant(email)
    return jsonify(
        {
            "ok": True,
            "subscription_status": tenant.get("subscription_status"),
            "subscription_active": db.is_subscription_active(tenant),
        }
    )


@app.route("/api/dashboard", methods=["GET"])
def dashboard():
    email, err = _require_auth()
    if err:
        return err
    tenant = db.get_tenant(email)
    logs = db.get_recent_sms_log(email, 30)
    base_url = request.url_root.rstrip("/")
    return jsonify(
        {
            "ok": True,
            "business_name": tenant.get("business_name"),
            "libyana_phone": tenant.get("libyana_phone"),
            "outgoing_webhook_url": tenant.get("outgoing_webhook_url"),
            "incoming_webhook_url": f"{base_url}/sms/{tenant['webhook_secret']}",
            "subscription_status": tenant.get("subscription_status"),
            "subscription_active": db.is_subscription_active(tenant),
            "subscription_expires_at": tenant["subscription_expires_at"].isoformat()
            if tenant.get("subscription_expires_at")
            else None,
            "monthly_price_usd": db.MONTHLY_PRICE_USD,
            "logs": [
                {
                    "phone": l["phone"],
                    "amount_lyd": l["amount_lyd"],
                    "relayed_ok": l["relayed_ok"],
                    "received_at": l["received_at"].isoformat(),
                }
                for l in logs
            ],
        }
    )


@app.route("/api/settings", methods=["POST"])
def update_settings():
    email, err = _require_auth()
    if err:
        return err
    data = request.get_json(force=True, silent=True) or {}
    webhook_url = data.get("outgoing_webhook_url")

    # ⚠️ لاحظ: رقم ليبيانا لا يمكن تغييره بعد التسجيل عمداً — هذا هو المفتاح
    # اللي يمنع استغلال التجربة المجانية بأكثر من حساب (لو سمحنا بتغييره، أي
    # شخص يسجّل برقم وهمي عشان يتجاوز الفحص، وبعدين يبدّله لرقمه الحقيقي)
    if webhook_url is not None and webhook_url and not webhook_url.startswith("https://"):
        return jsonify({"ok": False, "error": "رابط الـ webhook لازم يبدأ بـ https://"}), 400

    db.update_tenant_settings(email, outgoing_webhook_url=webhook_url)
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# استقبال SMS من تطبيق SMS Gateway الخاص بكل مشترك + إعادة توجيهه له فوراً
# ---------------------------------------------------------------------------
@app.route("/sms/<webhook_secret>", methods=["POST"])
def incoming_sms(webhook_secret):
    tenant = db.get_tenant_by_webhook_secret(webhook_secret)
    if not tenant:
        return jsonify({"ok": False, "error": "unauthorized"}), 401

    if not db.is_subscription_active(tenant):
        return jsonify({"ok": False, "error": "subscription_expired"}), 402

    data = request.get_json(force=True, silent=True) or {}
    message_text = data.get("message") or data.get("text") or ""
    sender = (data.get("sender") or "").strip()

    # نتقبل بس من أرقام Libyana المعروفة (نفس فكرة حماية بوتك الأصلي)
    if sender and sender.lower() not in ("libyana", "smslibyana"):
        return jsonify({"ok": True, "ignored": "sender_not_trusted"})

    match = db.LIBYANA_SMS_PATTERN.search(message_text)
    if not match:
        return jsonify({"ok": True, "ignored": "no_match"})

    amount_lyd = float(match.group(1).replace(",", ""))
    phone = match.group(2)

    relayed_ok = False
    webhook_url = tenant.get("outgoing_webhook_url")
    if webhook_url:
        try:
            requests.post(
                webhook_url,
                json={
                    "event": "libyana_payment",
                    "phone": phone,
                    "amount_lyd": amount_lyd,
                    "business_name": tenant.get("business_name"),
                },
                timeout=8,
            )
            relayed_ok = True
        except Exception as e:
            print(f"⚠️ فشل نقل الإشعار لمشترك {tenant['_id']}: {e}", flush=True)

    db.log_sms(tenant["_id"], phone, amount_lyd, relayed_ok)
    return jsonify({"ok": True, "relayed": relayed_ok})


# ---------------------------------------------------------------------------
# إدارة الاشتراك (يدوي حالياً — أدمن يمدد الاشتراك بعد استلام الدفعة الشهرية)
# ---------------------------------------------------------------------------
@app.route("/api/payment/pending", methods=["GET"])
def get_pending_payment():
    """يرجع تفاصيل أي طلب دفع معلّق حالياً (وديعة أو تجديد) — الواجهة تعرضه للمشترك."""
    email, err = _require_auth()
    if err:
        return err
    for purpose in ("trial_deposit", "subscription_renewal"):
        req = payments.get_pending_request_for_tenant(email, purpose)
        if req:
            return jsonify(
                {
                    "ok": True,
                    "pending": True,
                    "purpose": purpose,
                    "amount": req["amount"],
                    "wallet_address": payments.SAAS_WALLET_ADDRESS,
                }
            )
    return jsonify({"ok": True, "pending": False})


@app.route("/api/payment/create-renewal", methods=["POST"])
def create_renewal():
    email, err = _require_auth()
    if err:
        return err
    existing = payments.get_pending_request_for_tenant(email, "subscription_renewal")
    if existing:
        return jsonify(
            {
                "ok": True,
                "amount": existing["amount"],
                "wallet_address": payments.SAAS_WALLET_ADDRESS,
            }
        )
    try:
        request_id, exact_amount = payments.create_payment_request(
            email, "subscription_renewal", db.MONTHLY_PRICE_USD
        )
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 502
    return jsonify(
        {"ok": True, "amount": str(exact_amount), "wallet_address": payments.SAAS_WALLET_ADDRESS}
    )


@app.route("/api/admin/extend-subscription", methods=["POST"])
def extend_subscription():
    data = request.get_json(force=True, silent=True) or {}
    if not ADMIN_KEY or data.get("admin_key") != ADMIN_KEY:
        return jsonify({"ok": False, "error": "unauthorized"}), 401
    email = str(data.get("email", "")).strip().lower()
    days = int(data.get("days", 30))
    if not db.extend_subscription(email, days):
        return jsonify({"ok": False, "error": "tenant not found"}), 404
    return jsonify({"ok": True})


@app.route("/")
def serve_index():
    return app.send_static_file("index.html")


@app.route("/health")
def health():
    return jsonify({"ok": True})


if __name__ == "__main__":
    print("🚀 LibyanaPay SaaS يبدأ التشغيل...", flush=True)
    try:
        db.ensure_indexes()
        print("💰 تشغيل مراقب الدفعات (وديعة التجربة + الاشتراك الشهري)...", flush=True)
        payments.start_checker()
        port = int(os.environ.get("PORT", 8080))
        app.run(host="0.0.0.0", port=port, threaded=True)
    except Exception:
        print("💥 خطأ فادح أوقف السيرفر:", flush=True)
        print(traceback.format_exc(), flush=True)
        sys.exit(1)

