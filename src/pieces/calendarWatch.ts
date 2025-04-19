import { randomUUID } from 'crypto';
import { retrieveCalendarToken } from '../lib/auth';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

dotenv.config();

// Global constants
const MONGO_URI = process.env.DB_CONN_STRING || '';
const DB_NAME = 'CalendarDatabase';
const COLLECTION_NAME = 'watchChannels';
const ADDRESS = process.env.WEBHOOK_ADDRESS;

async function register(): Promise<void> {
	// Retrieve inital calendar token
	const calendar = await retrieveCalendarToken();

	// Find current active watch channels and delete them
	const client = new MongoClient(MONGO_URI, { useUnifiedTopology: true });
	await client.connect();
	const db = client.db(DB_NAME);
	const collection = db.collection(COLLECTION_NAME);
	const watchChannels = await collection.find().toArray();
	for (const channel of watchChannels) {
		console.log(await calendar.channels.stop({
			requestBody: {
				id: channel.channelId,
				resourceId: channel.resourceId
			}
		}));
		console.log(`${channel.channelId} ${channel.resourceId} removed`);
	}

	// Delete all records in the watchChannels DB
	await collection.remove({});

	const watchChannel = await calendar.events.watch({
		calendarId: 'c_8f94fb19936943d5980f19eac62aeb0c9379581cfbad111862852765f624bb1b@group.calendar.google.com',
		requestBody: {
			id: randomUUID(),
			type: 'web_hook',
			address: ADDRESS
		}
	});
	console.log(watchChannel);

	await collection.insertOne(
		{
			channelId: watchChannel.data.id,
			resourceId: watchChannel.data.resourceId
		}
	);

	await client.close();
}

export default register;
