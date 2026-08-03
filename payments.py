# -*- coding: utf-8 -*-
"""
مراقبة دفعات USDT (BSC/BEP20) لمنصة LibyanaPay — لتفعيل التجربة (1$ وديعة)
وتجديد الاشتراك الشهري (7$). نفس التقنية المُثبتة والمُختبرة من بوت هينكس
بالضبط (مراقبة مباشرة لشبكة BSC عبر NodeReal، بدون أي وسيط ثالث معرّض
لتغيير السياسات).

يتطلب: BSC_NODE_API_KEY (مفتاح NodeReal مجاني، نفس اللي يستخدمه البوت)
        SAAS_WALLET_ADDRESS (عنوان محفظة BSC لاستقبال الدفعات)
"""
import os
import time
import random
import threading
from decimal import Decimal
from datetime import datetime, timezone

import requests
from pymongo import ASCENDING
from pymongo.errors import DuplicateKeyError

import db

_NODEREAL_KEY = os.environ.get("BSC_NODE_API_KEY", "")
SAAS_WALLET_ADDRESS = os.environ.get("SAAS_WALLET_ADDRESS", "")

BSC_RPC_URLS = []
if _NODEREAL_KEY:
    BSC_RPC_URLS.append(f"https://bsc-mainnet.nodereal.io/v1/{_NODEREAL_KEY}")
BSC_RPC_URLS += [
    "https://bsc-dataseed.binance.org/",
    "https://bsc-dataseed1.defibit.io/",
]

USDT_BEP20_CONTRACT = "0x55d398326f99059fF775485246999027B3197955"
USDT_DECIMALS = 18
TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
BLOCKS_LOOKBACK = 3600

payment_requests_col = db.db["payment_requests"]
_block_time_cache = {}
_index_ready = False


def _ensure_index():
    global _index_ready
    if _index_ready:
        return
    try:
        payment_requests_col.create_index(
            [("amount_key", ASCENDING)],
            unique=True,
            partialFilterExpression={"status": "pending"},
        )
        _index_ready = True
    except Exception as e:
        print(f"[saas_payments] تحذير: تعذر إنشاء الفهرس: {e}", flush=True)


def _rpc_call(method: str, params: list):
    last_error = None
    for url in BSC_RPC_URLS:
        try:
            resp = requests.post(
                url, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params}, timeout=10
            )
            resp.raise_for_status()
            data = resp.json()
            if "error" in data:
                last_error = data["error"]
                continue
            return data["result"]
        except Exception as e:
            last_error = e
            continue
    raise RuntimeError(f"تعذر الاتصال بأي عقدة BSC: {last_error}")


def _get_block_timestamp(block_number: int) -> int:
    if block_number in _block_time_cache:
        return _block_time_cache[block_number]
    result = _rpc_call("eth_getBlockByNumber", [hex(block_number), False])
    ts = int(result["timestamp"], 16)
    _block_time_cache[block_number] = ts
    if len(_block_time_cache) > 500:
        _block_time_cache.clear()
    return ts


def _get_incoming_transfers(limit: int = 50):
    latest_hex = _rpc_call("eth_blockNumber", [])
    latest_block = int(latest_hex, 16)
    from_block = max(0, latest_block - BLOCKS_LOOKBACK)
    padded_address = "0x" + SAAS_WALLET_ADDRESS.lower().replace("0x", "").rjust(64, "0")

    logs = _rpc_call(
        "eth_getLogs",
        [{"fromBlock": hex(from_block), "toBlock": "latest", "address": USDT_BEP20_CONTRACT,
          "topics": [TRANSFER_TOPIC, None, padded_address]}],
    )

    out = []
    for log in logs[-limit:]:
        amount_wei = int(log["data"], 16)
        block_num = int(log["blockNumber"], 16)
        try:
            ts = _get_block_timestamp(block_num)
        except Exception:
            ts = 0
        out.append(
            {
                "hash": log["transactionHash"],
                "amount": Decimal(amount_wei) / (Decimal(10) ** USDT_DECIMALS),
                "timestamp": ts,
                "confirmations": max(0, latest_block - block_num),
            }
        )
    return out


def create_payment_request(tenant_email: str, purpose: str, base_amount_usd: float):
    """
    purpose: 'trial_deposit' أو 'subscription_renewal'
    يرجع (request_id, exact_amount) — مبلغ دقيق فريد، نفس تقنية البوت بالضبط.
    """
    if not SAAS_WALLET_ADDRESS:
        raise RuntimeError("لم يتم ضبط SAAS_WALLET_ADDRESS بمتغيرات البيئة بعد.")
    _ensure_index()

    base = Decimal(str(base_amount_usd))
    now = datetime.now(timezone.utc)

    forbidden = set()
    for p in payment_requests_col.find({"status": "pending"}, {"amount": 1}):
        try:
            forbidden.add(Decimal(p["amount"]))
        except Exception:
            continue

    for _ in range(200):
        offset = Decimal(random.randint(1, 999)) / Decimal(100000)
        candidate = (base + offset).quantize(Decimal("0.00001"))
        if candidate in forbidden:
            continue
        doc = {
            "tenant_email": tenant_email,
            "purpose": purpose,
            "base_amount": str(base),
            "amount": str(candidate),
            "amount_key": str(candidate),
            "status": "pending",
            "created_at": now,
            "created_ts": int(now.timestamp()),
        }
        try:
            inserted = payment_requests_col.insert_one(doc)
            return str(inserted.inserted_id), candidate
        except DuplicateKeyError:
            continue
    raise RuntimeError("عدد الطلبات المعلّقة كبير حالياً، حاول بعد شوي.")


def get_pending_request_for_tenant(tenant_email: str, purpose: str):
    return payment_requests_col.find_one(
        {"tenant_email": tenant_email, "purpose": purpose, "status": "pending"}
    )


def _check_all_pending():
    pending = list(payment_requests_col.find({"status": "pending"}))
    if not pending:
        return
    if not SAAS_WALLET_ADDRESS:
        return

    try:
        transfers = _get_incoming_transfers()
    except Exception as e:
        print(f"[saas_payments] فشل جلب التحويلات: {e}", flush=True)
        return

    print(f"[saas_payments] فحص دوري: {len(pending)} طلب معلّق، {len(transfers)} تحويل.", flush=True)
    EXACT_TOLERANCE = Decimal("0.000001")
    consumed = set()

    for req in pending:
        expected = Decimal(req["amount"])
        for tx in transfers:
            if tx["hash"] in consumed or tx["timestamp"] < req["created_ts"] or tx["confirmations"] < 1:
                continue
            if abs(tx["amount"] - expected) <= EXACT_TOLERANCE:
                result = payment_requests_col.find_one_and_update(
                    {"_id": req["_id"], "status": "pending"},
                    {"$set": {"status": "paid", "tx_hash": tx["hash"], "paid_at": datetime.now(timezone.utc)}},
                )
                if result:
                    consumed.add(tx["hash"])
                    _apply_payment(req)
                break


def _apply_payment(req: dict):
    email = req["tenant_email"]
    if req["purpose"] == "trial_deposit":
        db.activate_trial_after_deposit(email)
        print(f"[saas_payments] ✅ تفعيل تجربة {email}", flush=True)
    elif req["purpose"] == "subscription_renewal":
        db.extend_subscription(email, days=30)
        print(f"[saas_payments] ✅ تجديد اشتراك {email}", flush=True)


def start_checker(interval_seconds: int = 30):
    def loop():
        while True:
            try:
                _check_all_pending()
            except Exception as e:
                print(f"[saas_payments] خطأ بالفحص الدوري: {e}", flush=True)
            time.sleep(interval_seconds)

    threading.Thread(target=loop, daemon=True).start()

