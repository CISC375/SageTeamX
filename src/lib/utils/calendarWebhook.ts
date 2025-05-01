/* eslint-disable camelcase */
import 'module-alias/register';
import { retrieveEvents, retrieveSyncToken } from '@lib/auth';
import express from 'express';
import { Collection, MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { BOT, DB } from '@root/config';
import { notifyEventChange } from './webhookUtils';
import { calendar_v3 } from 'googleapis';

dotenv.config();

const MONGO_URI = process.env.DB_CONN_STRING || '';
const DB_NAME = 'CalendarDatabase';
const CHANNEL_COLLECTION_NAME = 'watchChannels';
const TOKEN_COLLECTION_NAME = 'syncTokens';


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

async function handleChangedReminders(collection: Collection, token: string, channel: WatchChannel, client: MongoClient): Promise<void> {
	const changedEvents = await retrieveEvents(channel.calendarId, null, true, token);
	const newSyncToken = await retrieveSyncToken(channel.calendarId, token);
	await collection.updateOne({ token: token }, { $set: { token: newSyncToken } });

	const singleEvents: Map<string, calendar_v3.Schema$Event> = new Map<string, calendar_v3.Schema$Event>();
	const parentEvents: Map<string, calendar_v3.Schema$Event> = new Map<string, calendar_v3.Schema$Event>();
	for (const event of changedEvents) {
		if (!event.recurrence && event.status !== 'cancelled') {
			singleEvents.set(event.id, event);
		} else {
			parentEvents.set(event.summary, event);
		}
	}

	const botDB = client.db(BOT.NAME);
	collection = botDB.collection(DB.REMINDERS);
	const reminders = await collection.find().toArray();
	for (const reminder of reminders) {
		const changedEvent = singleEvents.get(reminder.eventId);
		const changedReccuringEvent = parentEvents.get(reminder.content.split('Starts at:')[0].trim());
		if (changedEvent) {
			console.log(changedEvent);
			const dateObj = new Date(changedEvent.start.dateTime);
			const newExpirationDate = new Date(dateObj.getTime() - reminder.offset);
			const newContent = `${changedEvent.summary} Starts at: ${dateObj.toLocaleString()}`;
			await collection.updateOne({ _id: reminder._id }, { $set: { expires: newExpirationDate, content: newContent } });
			await notifyEventChange(reminder, newExpirationDate);
		} else if (changedReccuringEvent) {
			console.log(changedReccuringEvent);
			const dateObj = new Date(changedReccuringEvent.start.dateTime);
			const newExpirationDate = new Date(dateObj.getTime() - reminder.offset);
			const newContent = `${changedReccuringEvent.summary} Starts at: ${dateObj.toLocaleString()}`;
			await collection.updateOne({ _id: reminder._id }, { $set: { expires: newExpirationDate, content: newContent } });
			await notifyEventChange(reminder, newExpirationDate);
		}
	}
	console.log(changedEvents);
}

webhook.post('/calendarWebhook', async (req, res) => {
	// Send a 200 OK status
	res.sendStatus(200);

	// Connect to MongoDB and retrieve the correct watch channel
	const client = new MongoClient(MONGO_URI, { useUnifiedTopology: true });
	await client.connect();
	const db = client.db(DB_NAME);
	const channelCollection = db.collection(CHANNEL_COLLECTION_NAME);
	const channel: WatchChannel = await channelCollection.findOne({ channelId: req.headers['x-goog-channel-id'] });

	// Retrive the current sync token if it exists
	const tokenCollection = db.collection(TOKEN_COLLECTION_NAME);
	const syncToken: SyncToken = await tokenCollection.findOne({ calendarId: channel.calendarId });
	if (syncToken) {
		// Check for changed events
		await handleChangedReminders(tokenCollection, syncToken.token, channel, client);
	} else {
		// Insert a new sync token if one doesn't exist (Full Sync)
		const token = await retrieveSyncToken(channel.calendarId);
		await tokenCollection.insertOne({ token: token, calendarId: channel.calendarId });
	}
	await client.close();
});

webhook.listen(PORT, () => {
	console.log(`Listening on Port ${PORT}!`);
});
