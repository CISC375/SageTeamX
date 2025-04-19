import express from 'express';

const webhook = express();
const PORT = 3001;

webhook.listen(PORT, () => {
	console.log(`Listening on Port ${PORT}!`);
});
