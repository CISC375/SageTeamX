/**
 *Lists all commands that the bot can use
 Commands listed with '+' are ones user has access to and ones with '-' they do not
 */
import { ApplicationCommandPermissions, ChatInputCommandInteraction, Formatters, InteractionResponse } from 'discord.js';
import { BOTMASTER_PERMS } from '@lib/permissions';
import { Command } from '@lib/types/Command';

export default class extends Command {

	description = 'Show all commands, including disable commands.';
	permissions: ApplicationCommandPermissions[] = BOTMASTER_PERMS;

	async run(interaction: ChatInputCommandInteraction): Promise<InteractionResponse<boolean> | void> {
		let commands = '+ Enabled\n- Disabled\n';

		interaction.client.commands.forEach(command => {
			commands += `\n${command.enabled === false ? '-' : '+'} ${command.name}`;
		});

		return interaction.reply(Formatters.codeBlock('diff', commands));
	}

}
