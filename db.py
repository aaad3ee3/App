# -*- coding: utf-8 -*-
"""
طبقة قاعدة البيانات لمنصة "LibyanaPay" — خدمة SaaS لكشف تحويلات ليبيانا
تلقائياً لأي تاجر أو بوت، بنظام اشتراك شهري.
"""
import os
import re
import secrets
from datetime import datetime, timedelta

from pymongo import MongoClient

MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "libyanapay_saas")

client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=8000)
db = client[DB_NAME]

tenants_col = db["tenants"]  # المشتركين (التجار/أصحاب البوتات)
sessions_col = db["sessions"]
sms_log_col = db["sms_log"]  # سجل كل رسالة SMS استلمناها لكل مشترك

try:
    client.admin.command("ping")
    print(f"✅ تم الاتصال بقاعدة البيانات بنجاح (DB: {DB_NAME}).", flush=True)
except Exception as e:
    print(f"⚠️ تعذر التحقق الفوري من الاتصال بـ MongoDB: {e}", flush=True)

TRIAL_DAYS = 3
TRIAL_DEPOSIT_USD = float(os.environ.get("TRIAL_DEPOSIT_USD", "1"))
MONTHLY_PRICE_USD = float(os.environ.get("MONTHLY_PRICE_USD", "7"))

LIBYANA_SMS_PATTERN = re.compile(
    r"تم\s*تحويل\s*([\d.,]+)\s*دينار\s*من\s*الرقم\s*(\d+)\s*إلى\s*رصيدك\s*بنجاح"
)


# ---------------------------------------------------------------------------
# المشتركين (تسجيل بإيميل + كلمة سر)
# ---------------------------------------------------------------------------
def email_exists(email: str) -> bool:
    return tenants_col.find_one({"_id": email.lower()}) is not None


def phone_already_used_for_trial(phone: str) -> bool:
    """يتحقق هل هذا رقم ليبيانا استُخدم من قبل بأي حساب (تجربة أو مدفوع) — يمنع
    تكرار التجربة المجانية بنفس الرقم حتى لو غيّر الإيميل أو استخدم VPN."""
    return tenants_col.find_one({"libyana_phone": phone}) is not None


def create_tenant(email: str, password_hash: str, business_name: str, libyana_phone: str, signup_ip: str = None):
    webhook_secret = secrets.token_urlsafe(24)
    tenant = {
        "_id": email.lower(),
        "password_hash": password_hash,
        "business_name": business_name,
        "webhook_secret": webhook_secret,  # يُستخدم بمسار استقبال SMS الخاص فيه
        "outgoing_webhook_url": None,  # الرابط اللي نرسله له إشعارات الدفع
        "libyana_phone": libyana_phone,  # رقم ليبيانا الخاص فيه — مفتاح منع تكرار التجربة
        "signup_ip": signup_ip,  # طبقة حماية إضافية (غير كافية لحالها، لكن تفيد)
        "subscription_status": "pending_deposit",  # pending_deposit | trial | active | expired
        "subscription_expires_at": None,  # ما يُفعَّل إلا بعد دفع وديعة التجربة
        "created_at": datetime.utcnow(),
        "failed_login_attempts": 0,
        "locked_until": None,
    }
    tenants_col.insert_one(tenant)
    return tenant


def activate_trial_after_deposit(email: str):
    """يُنادى بعد ما نتحقق من دفعة وديعة التجربة (1$) عبر البلوكتشين فعلياً."""
    tenants_col.update_one(
        {"_id": email.lower()},
        {
            "$set": {
                "subscription_status": "trial",
                "subscription_expires_at": datetime.utcnow() + timedelta(days=TRIAL_DAYS),
            }
        },
    )


def get_tenant(email: str):
    return tenants_col.find_one({"_id": email.lower()})


def get_tenant_by_webhook_secret(secret: str):
    return tenants_col.find_one({"webhook_secret": secret})


def register_failed_login(email: str):
    tenant = tenants_col.find_one({"_id": email.lower()})
    if not tenant:
        return
    attempts = tenant.get("failed_login_attempts", 0) + 1
    update = {"failed_login_attempts": attempts}
    if attempts >= 5:
        update["locked_until"] = datetime.utcnow() + timedelta(minutes=5)
    tenants_col.update_one({"_id": email.lower()}, {"$set": update})


def reset_failed_login(email: str):
    tenants_col.update_one(
        {"_id": email.lower()}, {"$set": {"failed_login_attempts": 0, "locked_until": None}}
    )


def is_locked(email: str) -> bool:
    tenant = tenants_col.find_one({"_id": email.lower()})
    if not tenant or not tenant.get("locked_until"):
        return False
    return datetime.utcnow() < tenant["locked_until"]


def update_tenant_settings(email: str, outgoing_webhook_url: str = None):
    update = {}
    if outgoing_webhook_url is not None:
        update["outgoing_webhook_url"] = outgoing_webhook_url
    if update:
        tenants_col.update_one({"_id": email.lower()}, {"$set": update})


def is_subscription_active(tenant: dict) -> bool:
    if not tenant:
        return False
    expires = tenant.get("subscription_expires_at")
    return bool(expires and datetime.utcnow() < expires)


def extend_subscription(email: str, days: int = 30):
    tenant = tenants_col.find_one({"_id": email.lower()})
    if not tenant:
        return False
    now = datetime.utcnow()
    current_expiry = tenant.get("subscription_expires_at") or now
    base = current_expiry if current_expiry > now else now
    new_expiry = base + timedelta(days=days)
    tenants_col.update_one(
        {"_id": email.lower()},
        {"$set": {"subscription_expires_at": new_expiry, "subscription_status": "active"}},
    )
    return True


# ---------------------------------------------------------------------------
# الجلسات
# ---------------------------------------------------------------------------
def create_session(email: str) -> str:
    token = secrets.token_urlsafe(32)
    sessions_col.insert_one({"_id": token, "email": email.lower(), "created_at": datetime.utcnow()})
    return token


def get_session_email(token: str):
    doc = sessions_col.find_one({"_id": token})
    return doc.get("email") if doc else None


def delete_session(token: str):
    sessions_col.delete_one({"_id": token})


# ---------------------------------------------------------------------------
# سجل رسائل SMS
# ---------------------------------------------------------------------------
def log_sms(tenant_email: str, phone: str, amount_lyd: float, relayed_ok: bool):
    sms_log_col.insert_one(
        {
            "tenant_email": tenant_email,
            "phone": phone,
            "amount_lyd": amount_lyd,
            "relayed_ok": relayed_ok,
            "received_at": datetime.utcnow(),
        }
    )


def get_recent_sms_log(tenant_email: str, limit: int = 30):
    return list(
        sms_log_col.find({"tenant_email": tenant_email}).sort("received_at", -1).limit(limit)
    )


def ensure_indexes():
    try:
        sms_log_col.create_index([("tenant_email", 1), ("received_at", -1)])
        tenants_col.create_index([("webhook_secret", 1)])
        tenants_col.create_index(
            [("libyana_phone", 1)],
            unique=True,
            partialFilterExpression={"libyana_phone": {"$type": "string"}},
        )
        print("✅ فهارس قاعدة البيانات جاهزة.", flush=True)
    except Exception as e:
        print(f"⚠️ تعذر إنشاء الفهارس: {e}", flush=True)

