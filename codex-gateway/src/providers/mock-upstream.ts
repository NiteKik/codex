import Fastify from "fastify";
import { createHash } from "node:crypto";
import { createDemoSeeds } from "../demo/demo-data.js";
import { sleep } from "../utils/time.js";

interface MockQuotaState {
  weeklyTotal: number;
  weeklyUsed: number;
  weeklyResetAt: string;
  window5hTotal: number;
  window5hUsed: number;
  window5hResetAt: string;
}

const estimateCost = (body: unknown) => {
  const serialized = body ? JSON.stringify(body) : "";
  return Math.max(1, Math.ceil(serialized.length / 180));
};

const extractToken = (authorization: string | undefined) => {
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
};

export const createMockUpstreamServer = (port: number) => {
  const app = Fastify({ logger: false });
  const tokenMap = new Map<string, { accountId: string; quota: MockQuotaState }>();

  for (const seed of createDemoSeeds(port)) {
    tokenMap.set(seed.account.auth.token ?? "", {
      accountId: seed.account.id,
      quota: { ...seed.quota },
    });
  }

  const resolveState = (authorization: string | undefined) => {
    const token = extractToken(authorization);
    return token ? (tokenMap.get(token) ?? null) : null;
  };

  app.get("/quota", async (request, reply) => {
    const state = resolveState(request.headers.authorization);

    if (!state) {
      return reply.status(401).send({ error: "invalid_token" });
    }

    return reply.send(state.quota);
  });

  app.post("/v1/chat/completions", async (request, reply) => {
    const state = resolveState(request.headers.authorization);

    if (!state) {
      return reply.status(401).send({ error: "invalid_token" });
    }

    const body = (request.body ?? {}) as {
      messages?: Array<{ content?: string }>;
      stream?: boolean;
    };
    const cost = estimateCost(body);
    const remainingWeekly = state.quota.weeklyTotal - state.quota.weeklyUsed;
    const remainingWindow = state.quota.window5hTotal - state.quota.window5hUsed;

    if (remainingWeekly < cost || remainingWindow < cost) {
      return reply.status(429).send({
        error: "quota_exhausted",
        account_id: state.accountId,
      });
    }

    state.quota.weeklyUsed += cost;
    state.quota.window5hUsed += cost;

    const promptText = body.messages?.map((item) => item.content ?? "").join(" ") ?? "empty";
    const answer = `Mock answer from ${state.accountId}: ${promptText.slice(0, 60)}`;

    if (body.stream) {
      reply.hijack();
      reply.raw.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });

      const chunks = ["Mock", " answer", " from", ` ${state.accountId}`];

      for (const chunk of chunks) {
        const payload = {
          id: createHash("md5").update(`${state.accountId}:${chunk}`).digest("hex"),
          object: "chat.completion.chunk",
          choices: [{ index: 0, delta: { content: chunk } }],
        };

        reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
        await sleep(90);
      }

      reply.raw.write("data: [DONE]\n\n");
      reply.raw.end();
      return reply;
    }

    return reply.send({
      id: createHash("md5").update(answer).digest("hex"),
      object: "chat.completion",
      account_id: state.accountId,
      usage: {
        total_units: cost,
      },
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: answer,
          },
        },
      ],
    });
  });

  return {
    app,
    listen: () => app.listen({ port, host: "127.0.0.1" }),
  };
};
