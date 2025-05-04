/* eslint-disable camelcase */
import 'module-alias/register';
import express from 'express';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import { SyncToken, WatchChannel } from '../types/EventWatch';
import { handleChangedReminders } from './webhookUtils';
import { retrieveSyncToken } from '../auth';

dotenv.config();

const MONGO_URI = process.env.DB_CONN_STRING || '';
const DB_NAME = 'CalendarDatabase';
const CHANNEL_COLLECTION_NAME = 'watchChannels';
const TOKEN_COLLECTION_NAME = 'syncTokens';


const webhook = express();
const PORT = 3001;

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
