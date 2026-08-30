import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";

export class HttpError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export default fp(async function errorHandlerPlugin(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      reply.status(400).send({
        error: { code: "validation_error", message: "Invalid request", details: error.flatten() },
      });
      return;
    }

    if (error instanceof HttpError) {
      reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details },
      });
      return;
    }

    // Fastify raises typed errors with an accurate statusCode for malformed requests —
    // body too large (413), bad JSON (400), unsupported media type (415), rate limited
    // (429). These are the caller's fault, so echo the status instead of masking them as
    // 500s, which would both mislead clients and bury real server faults in the logs.
    const fastifyError = error as { statusCode?: number; code?: string; message?: string };
    const statusCode = fastifyError.statusCode;
    if (typeof statusCode === "number" && statusCode >= 400 && statusCode < 500) {
      const code = statusCode === 429 ? "rate_limited" : (fastifyError.code ?? "bad_request");
      // This message is Fastify's own text, not anything user-supplied.
      reply.status(statusCode).send({ error: { code, message: fastifyError.message ?? "Bad request" } });
      return;
    }

    request.log.error({ err: error }, "unhandled_error");
    // Arabic, because the mobile app shows the server's message to the customer verbatim
    // — an English "Something went wrong" in the middle of an Arabic screen reads as a
    // crash. The detail stays in the log above; the customer only needs to know to retry.
    reply.status(500).send({ error: { code: "internal_error", message: "حدث خطأ غير متوقع، حاول مرة أخرى بعد قليل." } });
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({ error: { code: "not_found", message: "Not found" } });
  });
});
