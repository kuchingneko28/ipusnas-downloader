import { getSession } from "../../core/config";
import { logger } from "../ui";

export async function execute(): Promise<void> {
  const session = getSession();
  const hasPop = !!session?.privatePem && !!session?.attestationToken;
  const hasUser = !!session?.userToken;
  logger.info(`Device PoP Key : ${hasPop ? "OK" : "Missing"} (${session?.deviceId || "not registered"})`);
  logger.info(`User Session   : ${hasUser ? "OK" : "Missing"} (${session?.email || "no email"})`);
  if (session) {
    logger.debug(`  privatePem        : ${session.privatePem ? session.privatePem.slice(0, 40) + "..." : "none"}`);
    logger.debug(`  attestationToken  : ${session.attestationToken ? "present" : "none"}`);
    logger.debug(`  attestRefreshToken: ${session.attestationRefreshToken ? "present" : "none"}`);
    logger.debug(`  userToken         : ${session.userToken ? session.userToken.slice(0, 40) + "..." : "none"}`);
    logger.debug(`  deviceId          : ${session.deviceId}`);
  }
}
