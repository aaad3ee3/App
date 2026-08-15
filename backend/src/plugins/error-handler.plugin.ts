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

    // @fastify/rate-limit throws errors with statusCode 429
    if ((error as { statusCode?: number }).statusCode === 429) {
      reply.status(429).send({ error: { code: "rate_limited", message: "Too many requests" } });
      return;
    }

    request.log.error({ err: error }, "unhandled_error");
    reply.status(500).send({ error: { code: "internal_error", message: "Something went wrong" } });
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({ error: { code: "not_found", message: "Not found" } });
  });
});
