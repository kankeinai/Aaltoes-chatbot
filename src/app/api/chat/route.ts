import { streamText, generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import prisma from "../../../lib/prisma";
import getSession from "../../../lib/getSession";
import { MODELS } from "../../../lib/constants";
import { encodingForModel, TiktokenModel } from "js-tiktoken";
import { z } from "zod";
import { createDeepSeek } from '@ai-sdk/deepseek';

const deepseek = createDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY,
});

const openaiClient = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const reqSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    }),
  ),
  id: z.string(),
});

export async function POST(req: Request) {
  const session = await getSession();
  const user = session?.user;

  if (!session?.user) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
        message: "You must be signed in to use the chat",
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  try {
    const body = reqSchema.safeParse(await req.json());
    if (!body.success) {
      return new Response(
        JSON.stringify({
          error: "Invalid Request",
          message: body.error.errors,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    const { messages, id: chatId } = body.data;
    const model = req.headers.get('model') || "gpt-4o-mini";

    if (!chatId) {
      return new Response(
        JSON.stringify({
          error: "Missing Chat ID",
          message: "Chat ID is required",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Verify chat belongs to user
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: { user_id: true },
    });

    if (!chat || chat.user_id !== user?.id) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized", 
          message: "You do not have access to this chat",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const user_quota = await prisma.user.findUnique({
      where: { id: user.id },
      select: { quota: true },
    });

    if (user_quota?.quota && user_quota.quota <= 0) {
      return new Response(
        JSON.stringify({
          error: "Quota Exceeded",
          message:
            "Your message quota has been exceeded. Please contact admin to increase your quota.",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    try {
      if (messages.length !== 1) {
        await prisma.message.create({
          data: {
            role: "user",
            content: messages[messages.length - 1].content,
            chat_id: chatId,
          },
        });
      }

      if ( Math.random() < 0.5) {
        const data = await prisma.chat.findUnique({
          where: {
            id: chatId,
          },
          select: {
            topic: true
          }
        })
        new Promise((resolve, reject) => {
          prisma.message
            .findMany({
              where: { chat_id: chatId },
              orderBy: { created_at: "desc" },
              take: 5,
              select: { role: true, content: true },
            })
            .then((chatHistory) =>
              generateText({
                model: ((model === "deepseek-chat" || model === "deepseek-reasoner") ? deepseek(model as keyof typeof MODELS) : openaiClient(model)) as any,
                prompt: `Given current chat topic: ${data?.topic}, generate a new concise chat topic (5 words) taking into account the following new messages:\n${chatHistory
                  .reverse()
                  .map((m) => `${m.role}: ${m.content}`)
                  .join("\n")}`,
                maxTokens: 15,
                temperature: 0.7,
              }).then((response) =>
                prisma.chat.update({
                  where: { id: chatId },
                  data: { topic: response.text.trim() },
                }),
              ),
            )
            .then((res) => resolve(res))
            .catch(reject);
        }).catch((error) => {
          console.error("Error generating chat topic:", error);
        });
      }
      console.log(model)

      const stream = await streamText({
        model: ((model === "deepseek-chat" || model === "deepseek-reasoner") ? deepseek(model) : openaiClient(model)) as any,
        messages: [...messages],
        temperature: 0.7,
        frequencyPenalty: 0.5,
        presencePenalty: 0.5,

        async onFinish({ finishReason, usage, text }) {
          if (chatId && user.id) {
            const encoding = encodingForModel(model as TiktokenModel);
            const input_quota =
              encoding.encode(text).length *
              MODELS[model as keyof typeof MODELS].input_quota;
            const output_quota =
              encoding.encode(text).length *
              MODELS[model as keyof typeof MODELS].output_quota;

            await prisma.message.create({
              data: {
                role: "assistant",
                content: text,
                chat_id: chatId,
              },
            });

            await prisma.chat.update({
              where: { id: chatId },
              data: { updated_at: new Date() },
            });

            const updatedUser = await prisma.user.update({
              where: { id: user.id },
              data: {
                quota: (user_quota?.quota || 0) - (input_quota + output_quota),
              },
            });
          }
        },
      });

      return stream?.toDataStreamResponse();
    } catch (error: any) {
      console.error("OpenAI API Error:", error);
      return new Response(
        JSON.stringify({
          error: "API Error",
          message: error.message || "Failed to generate response",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  } catch (error: any) {
    console.error("Server Error:", error);
    return new Response(
      JSON.stringify({
        error: "Server Error",
        message: error.message || "An unexpected error occurred",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
