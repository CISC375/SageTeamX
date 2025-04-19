import express from 'express';

const webhook = express();
const PORT = 3001;

webhook.post('/calendarWebhook', (req) => {
	console.log(req.headers);
});

webhook.listen(PORT, () => {
	console.log(`Listening on Port ${PORT}!`);
});
