import { MongoClient } from 'mongodb';
import { schedule } from 'node-cron';
import { retrieveCalendarToken } from '../lib/auth';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';

dotenv.config();

const MONGO_URI = process.env.DB_CONN_STRING || '';
const COLLECTION_NAME = 'watchChannels';
const DB_NAME = 'CalendarDatabase';
const ADDRESS = process.env.WEBHOOK_ADDRESS;

async function register(): Promise<void> {
	schedule('0/30 * * * * *', () => {
		handleRenewal();
	});
}

async function handleRenewal(): Promise<void> {
	const calendar = await retrieveCalendarToken();
	const client = new MongoClient(MONGO_URI, { useUnifiedTopology: true });
	await client.connect();
	const db = client.db(DB_NAME);
	const collection = db.collection(COLLECTION_NAME);
	const channels = await collection.find().toArray();
	for (const channel of channels) {
		const test = new Date();
		test.setDate(test.getDate() + 2);
		const time = test.getTime();
		const channelExpiration = new Date(channel.expires).getTime();
		if (channelExpiration < time) {
			console.log(await calendar.channels.stop({
				requestBody: {
					id: channel.channelId,
					resourceId: channel.resourceId
				}
			}));
			console.log(channel.calendarId);
			await collection.deleteOne(channel);
			const watchChannel = await calendar.events.watch({
				calendarId: channel.calendarId,
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
					calendarId: channel.calendarId,
					channelId: watchChannel.data.id,
					resourceId: watchChannel.data.resourceId,
					expires: new Date(Number(watchChannel.data.expiration))
				}
			);
		}
	}
	await client.close();
}

export default register;
