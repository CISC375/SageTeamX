/* eslint-disable */
import { DB } from '@root/config';
import { Command } from '@root/src/lib/types/Command';
import { Reminder } from '@root/src/lib/types/Reminder';
import { reminderTime } from '@root/src/lib/utils/generalUtils';
import { ActionRowBuilder, ApplicationCommandOptionData, ApplicationCommandOptionType, ChatInputCommandInteraction, ComponentType, SelectMenuBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';


const path = require('path');
const process = require('process');
const { google } = require('googleapis');

import parse from 'parse-duration';
import { authorize } from './auth';

export default class extends Command {

	name = 'calreminder';
	description = 'Setup reminders for calendar events';
	options: ApplicationCommandOptionData[] =
	[
		{
			name: 'offset',
			description: 'How long in advance',
			type: ApplicationCommandOptionType.String,
			required: false
		}

	];

	async run(interaction: ChatInputCommandInteraction): Promise<void> {
		const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
		const TOKEN_PATH = path.join(process.cwd(), 'token.json');
		const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');
		const auth = await authorize(TOKEN_PATH, SCOPES, CREDENTIALS_PATH);
		const now = new Date();
		const timeMin = now.toISOString();
		const timeMax = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString();
		const calendar = google.calendar({ version: 'v3', auth });
		const res = await calendar.events.list({
			calendarId: 'c_dd28a9977da52689612627d786654e9914d35324f7fcfc928a7aab294a4a7ce3@group.calendar.google.com',
			timeMin,
			timeMax,
			singleEvents: true,
			orderBy: 'startTime',
		});
		const events = res.data.items || [];
		
		let offset: number;
		const rawOffset: string = interaction.options.getString('offset');
		if (rawOffset) {
			offset = parse(rawOffset);
		}

		const selectMenu = new StringSelectMenuBuilder()
			.setCustomId('test')
			.setPlaceholder('Make a selection')
			.setMaxValues(1)
			.addOptions(events.slice(0, 25).map((event) => 
				new StringSelectMenuOptionBuilder()
					.setLabel(event.summary)
					.setDescription("Test")
					.setValue(event.start.dateTime)
			)
		);

		const content = 'For Office Hours';
		const repeat: 'daily' | 'weekly' = null;
		let dateNNumber: number;
		let remindDate: Date;
		const actionRow = new ActionRowBuilder<SelectMenuBuilder>().addComponents(selectMenu);
		const reply = await interaction.reply({components: [actionRow], ephemeral: true})

		const collector = reply.createMessageComponentCollector({
			componentType: ComponentType.StringSelect,
			time: 60_000
		})

		collector.on('collect', (interaction) => {
			dateNNumber = new Date(interaction.values[0]).getTime() - offset;
			remindDate = new Date(dateNNumber);
			const reminder: Reminder = {
				owner: interaction.user.id,
				content,
				mode: 'public',
				expires: remindDate,
				repeat
			};
			interaction.reply({ content: `I'll remind you about that at ${reminderTime(reminder)} Here is the event: ${events[0]?.start?.dateTime}.`, ephemeral: true });
			interaction.client.mongo.collection(DB.REMINDERS).insertOne(reminder);
		})
	}
}
