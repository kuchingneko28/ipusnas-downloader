import { loginUser } from "../../api/auth";
import { logger, promptPassword, promptText, withSpinner } from "../ui";

export async function execute(email?: string, password?: string): Promise<void> {
  const e = email || (await promptText("Email"));
  const p = password || (await promptPassword("Password"));
  await withSpinner("Logging in...", () => loginUser(e, p));
  logger.success("Logged in!");
}
