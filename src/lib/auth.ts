/* eslint-disable */

const fs = require('fs').promises;
const { authenticate } = require('@google-cloud/local-auth');
const { google } = require('googleapis');

// Loads saved credentials if they exist
export async function loadSavedCredentialsIfExist(TOKEN_PATH) {
	try {
		const content = await fs.readFile(TOKEN_PATH);
		const credentials = JSON.parse(content);
		return google.auth.fromJSON(credentials);
	} catch {
		return null;
	}
}

// Saves calendar access token.json into its own folder when authenticating
export async function saveCredentials(client, CREDENTIALS_PATH, TOKEN_PATH) {
	const content = await fs.readFile(CREDENTIALS_PATH);
	const keys = JSON.parse(content);
	const key = keys.installed || keys.web;
	const payload = JSON.stringify({
		type: 'authorized_user',
		client_id: key.client_id,
		client_secret: key.client_secret,
		refresh_token: client.credentials.refresh_token,
	});
	await fs.writeFile(TOKEN_PATH, payload);
}

// Loads the credentials that were authenticated by the user on their first use
export async function authorize(TOKEN_PATH, SCOPES, CREDENTIALS_PATH) {
	let client = await loadSavedCredentialsIfExist(TOKEN_PATH);
	if (client) {
		return client;
	}
	client = await authenticate({ scopes: SCOPES, keyfilePath: CREDENTIALS_PATH });
	if (client.credentials) {
		await saveCredentials(client, CREDENTIALS_PATH, TOKEN_PATH);
	}
	return client;
}