import { retrieveEvents, retrieveSyncToken } from '../../lib/auth';
import express from 'express';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.DB_CONN_STRING || '';
const DB_NAME = 'CalendarDatabase';
const COLLECTION_NAME = 'syncTokens';

const webhook = express();
const PORT = 3001;

webhook.post('/calendarWebhook', async () => {
	const client = new MongoClient(MONGO_URI, { useUnifiedTopology: true });
	await client.connect();
	const db = client.db(DB_NAME);
	const collection = db.collection(COLLECTION_NAME);
	const syncTokens = await collection.find().toArray();
	if (syncTokens.length) {
		const syncToken: string = syncTokens[0].token;
		const changedEvents = await retrieveEvents('c_8f94fb19936943d5980f19eac62aeb0c9379581cfbad111862852765f624bb1b@group.calendar.google.com', null, true, syncToken);
		console.log(changedEvents);
	} else {
		const token = await retrieveSyncToken();
		await collection.insert({ token: token });
	}
	await client.close();
});

webhook.listen(PORT, () => {
	console.log(`Listening on Port ${PORT}!`);
});
