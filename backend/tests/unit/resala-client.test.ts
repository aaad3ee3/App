import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ResalaAccountExpiredError,
  ResalaApiError,
  ResalaAuthError,
  ResalaClient,
  ResalaInsufficientCreditError,
  ResalaPermissionError,
  ResalaValidationError,
} from "../../src/adapters/resala/resala.client";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const client = new ResalaClient({ baseUrl: "https://dev.resala.ly/api/v1", apiToken: "test-token" });

describe("ResalaClient.sendPin", () => {
  it("sends the phone in the body and returns the generated pin", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(201, {
        id: "abc",
        pin: "123456",
        code: "218",
        number: "910001234",
        content: "your code is 123456",
        created_at: "2026-01-01T00:00:00Z",
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.sendPin("218910001234", { test: true, serviceName: "سايح" });

    expect(result.pin).toBe("123456");
    expect(result.nationalNumber).toBe("910001234");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/pins?test&service_name=");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-token");
    expect(JSON.parse(init.body)).toEqual({ phone: "218910001234" });
  });

  it("builds a bare ?test flag with no value, per the documented example", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(201, { id: "1", pin: "111111", code: "218", number: "910001234", content: "", created_at: "" })
    );
    vi.stubGlobal("fetch", fetchMock);

    await client.sendPin("218910001234", { test: true });

    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url).endsWith("/pins?test")).toBe(true);
  });

  it("never retries on a network failure — a retried POST could send a duplicate SMS", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(client.sendPin("218910001234")).rejects.toThrow(ResalaApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps 401 to ResalaAuthError even with no type field (status fallback)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, { message: "Unauthenticated" })));
    await expect(client.sendPin("218910001234")).rejects.toThrow(ResalaAuthError);
  });

  it("maps type: TokenExpired to ResalaAuthError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(401, { status: 401, type: "TokenExpired", message: "Token expired" }))
    );
    await expect(client.sendPin("218910001234")).rejects.toThrow(ResalaAuthError);
  });

  it("maps 403 to ResalaPermissionError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(403, { message: "Forbidden" })));
    await expect(client.sendPin("218910001234")).rejects.toThrow(ResalaPermissionError);
  });

  it("maps 422 to ResalaValidationError carrying the field errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(422, { errors: { phone: ["The phone field is required."] } }))
    );

    const err = await client.sendPin("218910001234").catch((e) => e);
    expect(err).toBeInstanceOf(ResalaValidationError);
    expect((err as ResalaValidationError).fieldErrors.phone).toEqual(["The phone field is required."]);
  });

  // Resala's own docs are explicit: branch on `type`, not the human-readable `message`
  // text, since the wording can be reworded/translated without notice.
  it("maps type: InsufficientCredit to ResalaInsufficientCreditError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(400, { status: 400, type: "InsufficientCredit", message: "لا يوجد رصيد كافٍ" })
      )
    );
    await expect(client.sendPin("218910001234")).rejects.toThrow(ResalaInsufficientCreditError);
  });

  it("maps type: AccountExpired to ResalaAccountExpiredError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(400, { status: 400, type: "AccountExpired", message: "الحساب منتهي" }))
    );
    await expect(client.sendPin("218910001234")).rejects.toThrow(ResalaAccountExpiredError);
  });

  it("does not misclassify an unrelated 400 (type: BadRequest) as a credit error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(400, { status: 400, type: "BadRequest", message: "Invalid phone format" }))
    );

    const err = await client.sendPin("218910001234").catch((e) => e);
    expect(err).toBeInstanceOf(ResalaApiError);
    expect(err).not.toBeInstanceOf(ResalaInsufficientCreditError);
    expect(err).not.toBeInstanceOf(ResalaAccountExpiredError);
  });
});

describe("ResalaClient.sendTemplateMessage", () => {
  it("posts a multipart/form-data body with a records field, not JSON", async () => {
    // Resala's own docs: this endpoint requires multipart/form-data with `records` as a
    // single JSON-stringified form field — a JSON body is silently rejected.
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { status: true }));
    vi.stubGlobal("fetch", fetchMock);

    await client.sendTemplateMessage("11111111-1111-1111-1111-111111111111", [
      { phone: "218910001234", $1: "value1" },
    ]);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("sms_template_id=11111111-1111-1111-1111-111111111111");
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.body.get("records")).toBe(JSON.stringify([{ phone: "218910001234", $1: "value1" }]));
    // Content-Type must be left for fetch to set itself (with the multipart boundary) —
    // an explicit "application/json" here would make Resala reject the request.
    expect(init.headers["Content-Type"]).toBeUndefined();
  });

  it("never retries on a network failure", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(client.sendTemplateMessage("tid", [{ phone: "218910001234" }])).rejects.toThrow(ResalaApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("ResalaClient.getSentView", () => {
  it("returns the paginated delivery log", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, { data: [{ id: "1", status: "delivered" }], meta: { current_page: 1 } })
      )
    );

    const result = await client.getSentView({ filters: "source:pin", page: 1, paginate: 10, sorts: "-created_at" });
    expect(result.data[0]!.status).toBe("delivered");
  });

  it("retries up to twice on a network failure before giving up", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(client.getSentView()).rejects.toThrow(ResalaApiError);
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it("succeeds after a transient failure followed by a good response", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(jsonResponse(200, { data: [], meta: {} }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.getSentView();
    expect(result.data).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
