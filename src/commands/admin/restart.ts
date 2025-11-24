import { BOT, DB } from '@root/config';
import { BOTMASTER_PERMS } from '@lib/permissions';
import { ApplicationCommandPermissions, ChatInputCommandInteraction, InteractionResponse, PresenceStatusData } from 'discord.js';
import { Command } from '@lib/types/Command';

export default class extends Command {

	description = `Clears ${BOT.NAME}'s status.`;
	permissions: ApplicationCommandPermissions[] = BOTMASTER_PERMS;

	async run(interaction: ChatInputCommandInteraction): Promise<InteractionResponse<boolean> | void> {
		const bot = interaction.client;

		await bot.user.setPresence({ activities: [], status: 'online' as PresenceStatusData });
		bot.mongo.collection(DB.CLIENT_DATA).updateOne(
			{ _id: bot.user.id },
			{ $set: { status: null } },
			{ upsert: true });

		return interaction.reply({ content: `Cleared ${BOT.NAME}'s activity.`, ephemeral: true });
	}

}