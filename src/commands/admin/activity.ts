import { ApplicationCommandOptionData, ApplicationCommandOptionType, ApplicationCommandPermissions, ChatInputCommandInteraction, InteractionResponse, ActivityType } from 'discord.js';
import { BOT, DB } from '@root/config';
import { BOTMASTER_PERMS } from '@lib/permissions';
import { Command } from '@lib/types/Command';

const ACTIVITIES = ['Playing', 'Streaming', 'Listening', 'Watching', 'Competing'];

export default class extends Command {

	description = `Sets ${BOT.NAME}'s activity to the given status and content`;
	permissions: ApplicationCommandPermissions[] = BOTMASTER_PERMS;

	options: ApplicationCommandOptionData[] = [
		{
			name: 'status',
			description: 'The activity status.',
			type: ApplicationCommandOptionType.String,
			required: true,
			choices: ACTIVITIES.map((activity) => ({
				name: activity,
				value: activity
			}))
		},
		{
			name: 'content',
			description: 'The activity itself (ex: /help).',
			type: ApplicationCommandOptionType.String,
			required: true
		},
		{
			name: 'url',
			description: 'The URL for the stream (only for Streaming status).',
			type: ApplicationCommandOptionType.String,
			required: false
		}
	]

	async run(interaction: ChatInputCommandInteraction): Promise<InteractionResponse<boolean> | void> {
		const bot = interaction.client;
		const content = interaction.options.getString('content');
		const type = interaction.options.getString('status') as keyof typeof ActivityType;
		const url = interaction.options.getString('url');

		if (type === 'Streaming' && !url) {
			return interaction.reply({
				content: 'A URL is required for the streaming status.',
				ephemeral: true
			});
		}

		const activityType = ActivityType[type];

		const activityOptions = {
			type: activityType,
			url: type === 'Streaming' ? url : undefined
		};

		bot.user.setActivity(content, activityOptions);

		//	updating Sage's activity status in the database (so that it stays upon a restart)
		bot.mongo.collection(DB.CLIENT_DATA).updateOne(
			{ _id: bot.user.id },
			{ $set: { status: { type, content, url: activityOptions.url } } },
			{ upsert: true });

		let reply = `Set ${BOT.NAME}'s activity to *${type} ${content}*`;
		if (type === 'Streaming') reply += ` at ${url}`;

		interaction.reply({ content: reply, ephemeral: true });
	}

}