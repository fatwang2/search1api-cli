import { Command } from "commander";
import { request } from "../api.js";
import { printReasoning, printJson } from "../output.js";

interface ReasoningResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export function registerReasoningCommand(program: Command): void {
  program
    .command("reasoning <content>")
    .alias("reason")
    .description("Deep thinking and reasoning (DeepSeek R1)")
    .option("--json", "output raw JSON")
    .action(async (content: string, opts) => {
      const data = await request<ReasoningResponse>("/v1/chat/completions", {
        model: "deepseek-r1-70b-fast-online",
        messages: [{ role: "user", content }],
      });

      if (opts.json) {
        printJson(data);
      } else {
        const text = data.choices?.[0]?.message?.content;
        if (text) {
          printReasoning(text);
        } else {
          console.error("No response from reasoning API.");
        }
      }
    });
}
