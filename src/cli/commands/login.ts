import type { CAC } from 'cac';
import { loginUser } from '../../api/auth';
import { logger, promptPassword, promptText, withSpinner } from '../ui';
import { runCommand } from './run';

export async function loginCommand(email?: string, password?: string): Promise<void> {
  const resolvedEmail = email || (await promptText('Email'));
  const resolvedPassword = password || (await promptPassword('Password'));
  await withSpinner('Logging in...', () => loginUser(resolvedEmail, resolvedPassword));
  logger.success('Logged in!');
}

export function register(cli: CAC): void {
  cli
    .command('login', 'Login to iPusnas')
    .option('--email <email>', 'Email')
    .option('--password <password>', 'Password')
    .action(async (options: Record<string, string>) => {
      await runCommand('Login', false, () => loginCommand(options.email, options.password));
    });
}
