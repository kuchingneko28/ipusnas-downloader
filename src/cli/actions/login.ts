import { loginUser } from "../../api/auth";
import { logger, promptPassword, promptText, withSpinner } from "../ui";

export async function execute(email?: string, password?: string): Promise<void> {
  const resolvedEmail = email || (await promptText("Email"));
  const resolvedPassword = password || (await promptPassword("Password"));
  await withSpinner("Logging in...", () => loginUser(resolvedEmail, resolvedPassword));
  logger.success("Logged in!");
}
