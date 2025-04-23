import {
	ChatInputCommandInteraction,
	PermissionFlagsBits,
	ApplicationCommandOptionData,
	ApplicationCommandOptionType
} from 'discord.js';
import { Command } from '@root/src/lib/types/Command';
import { MongoClient } from 'mongodb';
import 'dotenv/config';
import { retrieveEvents } from '@root/src/lib/auth';
import { validateCalendarId } from '@root/src/lib/CalendarConfig';
const MONGO_URI = process.env.DB_CONN_STRING ?? '';
const DB_NAME = 'CalendarDatabase';
const COLLECTION_NAME = 'calendarIds';
export default class ImportCalendarCommand extends Command {

	public name = 'importcalendar';
	public description =
	'Adds a new Google Calendar ID for event tracking (Admin only)';
	public options: ApplicationCommandOptionData[] = [
		{
			type: ApplicationCommandOptionType.String,
			name: 'calendarid',
			description: 'Enter the Google Calendar ID to add',
			required: true
		},
		{
			type: ApplicationCommandOptionType.String,
			name: 'calendarname',
			description: 'Enter a name for this calendar',
			required: true
		}
	];

	public async run(interaction: ChatInputCommandInteraction): Promise<void> {
		// 1️⃣ Permission check
		if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
			await interaction.reply({
				content: '❌ You do not have permission to use this command.',
				ephemeral: true
			});
			return;
		}
		// 2️⃣ Defer the reply so we can use editReply later
		await interaction.deferReply({ ephemeral: true });
		// 3️⃣ Get & trim inputs
		const calendarId = interaction.options.getString('calendarid', true).trim();
		const calendarName = interaction.options
			.getString('calendarname', true).toUpperCase()
			.trim();
			// 4️⃣ Validate format
		if (!validateCalendarId(calendarId)) {
			await interaction.editReply({
				content:
			'❌ Invalid Calendar ID format. Please check the ID and try again.'
			});
			return;
		}
		const client = new MongoClient(MONGO_URI, {
			useNewUrlParser: true,
			useUnifiedTopology: true
		});
		try {
		// 5️⃣ Connect & check duplicates
			await client.connect();
			const col = client.db(DB_NAME).collection(COLLECTION_NAME);
			const exists = await col.findOne({ calendarId });
			if (exists) {
				await interaction.editReply({
					content: `⚠️ Calendar ID \`${calendarId}\` is already imported as **${exists.calendarName}**.`
				});
				return;
			}

			// 6️⃣ Verify with Google Calendar API
			// let events;
			await retrieveEvents(calendarId);
			// 7️⃣ Insert into DB
			await col.insertOne({ calendarId, calendarName });

			// 8️⃣ Success
			await interaction.followUp({
				content: `✅ Successfully added **${calendarName}** (\`${calendarId}\`) to the calendar list.`
			});
		} catch (dbErr) {
			console.error('Database error:', dbErr);
			await interaction.editReply({
				content:
			'❌ An internal error occurred while adding the calendar. Please try again later.'
			});
		} finally {
			await client.close();
		}
	}

}
