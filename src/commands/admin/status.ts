/**
 *Changes status of bot to 1 of 4 states
 Online makes the bot interactive with users
 Idle makes the bot stay connected with server but users can't interact with it
 Dnd makes the bot active but will not receive any notifications
 Invisible makes the bot appear offline to users but it is still running in the background
 */
import { BOT } from '@root/config';
import { BOTMASTER_PERMS } from '@lib/permissions';
import { ApplicationCommandOptionData, ApplicationCommandOptionType, ApplicationCommandPermissions, ChatInputCommandInteraction, InteractionResponse,
	PresenceStatusData } from 'discord.js';
import { Command } from '@lib/types/Command';

const STATUSES = ['online', 'idle', 'dnd', 'invisible'];
export default class extends Command {

	description = `Sets ${BOT.NAME}'s status.`;
	permissions: ApplicationCommandPermissions[] = BOTMASTER_PERMS;

	options: ApplicationCommandOptionData[] = [{
		name: 'status',
		description: 'The status to give the bot (online, idle, dnd, invis).',
		type: ApplicationCommandOptionType.String,
		required: true,
		choices: STATUSES.map((status) => ({
			name: status,
			value: status
		}))
	}]

	async run(interaction: ChatInputCommandInteraction): Promise<InteractionResponse<boolean> | void> {
		const status = interaction.options.getString('status') as PresenceStatusData;
		const bot = interaction.client;
		await bot.user.setStatus(status);

		return interaction.reply(`Set ${BOT.NAME}'s status to ${status}`);
	}

}
