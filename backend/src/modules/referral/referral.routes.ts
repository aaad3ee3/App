import type { FastifyInstance } from "fastify";
import * as referralService from "./referral.service";

export default async function referralRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  app.get("/me", async (request) => {
    return referralService.getMyReferralInfo(request.user!.id);
  });
}
