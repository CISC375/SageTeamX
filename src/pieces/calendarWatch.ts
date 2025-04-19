import { randomUUID } from 'crypto';
import { retrieveCalendarToken } from '../lib/auth';

async function register(): Promise<void> {
	const calendar = await retrieveCalendarToken();
	console.log(await calendar.events.watch({
		calendarId: 'c_8f94fb19936943d5980f19eac62aeb0c9379581cfbad111862852765f624bb1b@group.calendar.google.com',
		requestBody: {
			id: randomUUID(),
			type: 'web_hook',
			address: 'localhost:3001/calendarWebhook'
		}
	}));
}

export default register;
