import { retrieveEvents, retrieveSyncToken } from '../../lib/auth';
import express from 'express';
import { Collection, MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { bot } from '@root/src/sage';
import { DB } from '@root/config';
dotenv.config();

const MONGO_URI = process.env.DB_CONN_STRING || '';
const DB_NAME = 'CalendarDatabase';


const webhook = express();
const PORT = 3001;

interface SyncToken {
	token: string;
	calendarId: string;
}


interface WatchChannel {
	calendarId: string,
	channelId: string,
	resourceId: string
}

async function handleChangedReminders(collection: Collection, token: string, channel: WatchChannel) {
	const changedEvents = await retrieveEvents(channel.calendarId, null, true, token);
	const newSyncToken = await retrieveSyncToken(channel.calendarId, token);
	await collection.updateOne({ token: token }, { $set: { token: newSyncToken } });

	collection = bot.mongo.collection(DB.REMINDERS);
	const reminders = await collection.find().toArray();
	for (const reminder of reminders) {
		if (reminder.eventId) {
			for (const changedEvent of changedEvents) {
				if (changedEvent.id === reminder.eventId) {
					//
				}
			}
		}
	}
	console.log(changedEvents);
}

webhook.post('/calendarWebhook', async (req, res) => {
	res.sendStatus(200);
	let collectionName = 'watchChannels';
	console.log(req.headers);

	const client = new MongoClient(MONGO_URI, { useUnifiedTopology: true });
	await client.connect();
	const db = client.db(DB_NAME);
	let collection = db.collection(collectionName);
	const channel: WatchChannel = await collection.findOne({ channelId: req.headers['x-goog-channel-id'] });

	collectionName = 'syncTokens';
	collection = db.collection(collectionName);
	const syncToken: SyncToken = await collection.findOne({ calendarId: channel.calendarId });
	if (syncToken) {
		await handleChangedReminders(collection, syncToken.token, channel);
	} else {
		const token = await retrieveSyncToken(channel.calendarId);
		await collection.insertOne({ token: token, calendarId: channel.calendarId });
	}
	await client.close();
});

webhook.listen(PORT, () => {
	console.log(`Listening on Port ${PORT}!`);
});
