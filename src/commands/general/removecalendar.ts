import {
	ChatInputCommandInteraction,
	StringSelectMenuInteraction,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle
} from 'discord.js';
import { Command } from '@root/src/lib/types/Command';
import { MongoClient } from 'mongodb';
import { PagifiedSelectMenu } from '@root/src/lib/utils/calendarUtils';

export default class RemoveCalendarCommand extends Command {

	name = 'removecalendar';
	description = 'Remove a calendar from tracking';

	async run(interaction: ChatInputCommandInteraction): Promise<void> {
		const client = new MongoClient(process.env.DB_CONN_STRING || '', {
			useUnifiedTopology: true
		});
		await client.connect();
		const collection = client
			.db('CalendarDatabase')
			.collection('calendarIds');
		const calendarDocs = await collection.find().toArray();
		if (calendarDocs.length === 0) {
			await interaction.reply({
				content: '⚠️ There are no calendars to remove.',
				ephemeral: true
			});
			await client.close();
			return;
		}
		// 1) Build paginated select menu (auto-splits >25 & adds nav) :contentReference[oaicite:0]{index=0}&#8203;:contentReference[oaicite:1]{index=1}
		const menu = new PagifiedSelectMenu();
		menu.createSelectMenu({
			customId: 'select_calendar_to_remove',
			placeHolder: 'Select a calendar to remove',
			minimumValues: 1,
			maximumValues: 1
		});
		calendarDocs.forEach((doc) =>
			menu.addOption({ label: doc.calendarName, value: doc.calendarId })
		);
		// 2) Always show Next/Prev row (disabled if only one page)
		const rows = menu.generateActionRows();
		if (menu.numPages <= 1) {
			const prevBtn = new ButtonBuilder()
				.setCustomId(`prev_button:select_calendar_to_remove`)
				.setLabel('Previous')
				.setStyle(ButtonStyle.Primary)
				.setDisabled(true);
			const nextBtn = new ButtonBuilder()
				.setCustomId(`next_button:select_calendar_to_remove`)
				.setLabel('Next')
				.setStyle(ButtonStyle.Primary)
				.setDisabled(true);
			rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(prevBtn, nextBtn));
		}
		// 3) Send menu + navigation buttons :contentReference[oaicite:2]{index=2}&#8203;:contentReference[oaicite:3]{index=3}
		await menu.generateMessage(
			async (i: StringSelectMenuInteraction) => {
				if (i.user.id !== interaction.user.id) return;
				const selectedId = i.values[0];
				await collection.deleteOne({ calendarId: selectedId });
				const removed = calendarDocs.find((calendarDoc) => calendarDoc.calendarId === selectedId);
				await i.update({
					content: `✅ Successfully removed **${removed?.calendarName}** (\`${selectedId}\`).`,
					components: []
				});
				await client.close();
			},
			interaction,
			rows,
			undefined,
			'**Select a calendar to remove:**'
		);
	}

}
