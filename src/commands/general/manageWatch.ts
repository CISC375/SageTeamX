import { Command } from '@root/src/lib/types/Command';
import { ApplicationCommandOptionType, ApplicationCommandStringOptionData, ChatInputCommandInteraction } from 'discord.js';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { retrieveCalendarToken } from '@root/src/lib/auth';
import { randomUUID } from 'crypto';

dotenv.config();

const MONGO_URI = process.env.DB_CONN_STRING || '';
const DB_NAME = 'CalendarDatabase';
const ADDRESS = process.env.WEBHOOK_ADDRESS;

export default class extends Command {

	name = 'managewatch';
	description = 'create a watch hook';
	options: ApplicationCommandStringOptionData[] = [
		{
			type: ApplicationCommandOptionType.String,
			name: 'calendar',
			description: 'Enter the course code for the class calendar you want (e.g., CISC108).',
			required: true
		},
		{
			type: ApplicationCommandOptionType.String,
			name: 'remove',
			description: 'Remove hook',
			required: false
		}
	]

	async run(interaction: ChatInputCommandInteraction): Promise<void> {
		let COLLECTION_NAME = 'calendarIds';

		const calendarCode = interaction.options.getString(this.options[0].name, this.options[0].required);
		const remove = interaction.options.getString('remove', false);

		const client = new MongoClient(MONGO_URI, { useUnifiedTopology: true });
		await client.connect();
		const db = client.db(DB_NAME);
		let collection = db.collection(COLLECTION_NAME);
		const calendarInDB = await collection.findOne({ calendarName: calendarCode.toUpperCase() });
		const calendarID: string = calendarInDB.calendarId;

		const calendar = await retrieveCalendarToken();
		COLLECTION_NAME = 'watchChannels';
		collection = db.collection(COLLECTION_NAME);
		const channel = await collection.findOne({ calendarId: calendarID });
		if (remove && channel) {
			console.log(await calendar.channels.stop({
				requestBody: {
					id: channel.channelId,
					resourceId: channel.resourceId
				}
			}));
			await collection.deleteOne(channel);
		} else if (!channel) {
			const watchChannel = await calendar.events.watch({
				calendarId: calendarID,
				requestBody: {
					id: randomUUID(),
					type: 'web_hook',
					address: ADDRESS
				},
				maxResults: 2500
			});
			console.log(watchChannel);

			await collection.insertOne(
				{
					calendarId: calendarID,
					channelId: watchChannel.data.id,
					resourceId: watchChannel.data.resourceId
				}
			);
		} else {
			console.log('Channel already exists');
		}
		await client.close();
	}

}
