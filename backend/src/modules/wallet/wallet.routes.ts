import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as walletService from "./wallet.service";

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
});

export default async function walletRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  app.get("/", async (request) => {
    return walletService.getMyWallet(request.user!.id);
  });

  app.get("/transactions", async (request) => {
    const { page, page_size } = listQuerySchema.parse(request.query);
    return walletService.listMyTransactions(request.user!.id, page, page_size);
  });
}
