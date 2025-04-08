import {
	Client,
	TextChannel,
	Role,
	Message,
	EmbedBuilder,
	PartialMessage,
	ThreadChannel,
	ChannelType
} from 'discord.js';
import { DatabaseError } from '@lib/types/errors';
import { CHANNELS, DB, ROLES, GUILDS } from '@root/config';
import { SageUser } from '@lib/types/SageUser';
import { calcNeededExp } from '@lib/utils/generalUtils';

const startingColor = 80;
const greenIncrement = 8;
const maxGreen: [number, number, number] = [0, 255, 0];
const maxLevel = 20;
const countedChannelTypes = [
	ChannelType.GuildText,
	ChannelType.PublicThread,
	ChannelType.PrivateThread
];

async function register(bot: Client): Promise<void> {
	// On message creation, count messages
	bot.on('messageCreate', async (msg: Message) => {
		try {
			await countMessages(msg);
		} catch (error) {
			bot.emit('error', error);
		}
	});
	// On message deletion, handle experience detract (ignore if command messages)
	bot.on('messageDelete', async (msg: Message | PartialMessage) => {
		if (msg.content && msg.content.startsWith('s;')) return;
		await handleExpDetract(msg);
	});
}

async function countMessages(msg: Message): Promise<void> {
	const bot = msg.client;
	// Only process messages in allowed channel types, main guild, and if author is not a bot
	if (
		!countedChannelTypes.includes(msg.channel.type)
		|| msg.guild?.id !== GUILDS.MAIN
		|| msg.author.bot
		|| !msg.member
	) {
		return;
	}

	const { channel } = msg;
	let countInc = 0;
	const validChannel
		= (channel instanceof TextChannel)
		&& (!channel.topic || (channel.topic && !channel.topic.startsWith('[no message count]')));
	const validThread
		= (channel instanceof ThreadChannel) && channel.name.includes('private');
	if (validChannel || validThread) {
		countInc++;
	}

	try {
		// Use upsert so that if the user record doesn't exist, it gets created.
		const result = await bot.mongo.collection(DB.USERS).findOneAndUpdate(
			{ discordId: msg.author.id },
			{ $inc: { count: countInc, curExp: -1 } },
			{ upsert: true, returnDocument: 'after' }
		);
		const user = result.value as SageUser;
		await handleLevelUp(null, user, msg);
	} catch (err) {
		bot.emit('error', err);
	}
}

async function handleExpDetract(msg: Message | PartialMessage): Promise<void> {
	const bot = msg.client;
	let user: SageUser | null;
	try {
		user = await msg.author.client.mongo.collection(DB.USERS).findOne({ discordId: msg.author.id });
	} catch (error) {
		// If error occurs or message is partial, skip processing.
		return;
	}

	// If user record is not found, create a default record.
	if (!user) {
		const defaultUser: SageUser = {
			discordId: msg.author.id,
			curExp: 0,
			levelExp: 100, // Adjust as needed
			level: 1,
			count: 0,
			levelPings: false,
			email: '',
			hash: '',
			pii: false,
			isVerified: false,
			isStaff: false,
			roles: [],
			courses: []
		};
		await msg.author.client.mongo.collection(DB.USERS).insertOne(defaultUser);
		user = defaultUser;
	}

	// Now safe to use user properties.
	if (user.curExp < user.levelExp) {
		await bot.mongo.collection(DB.USERS).findOneAndUpdate(
			{ discordId: msg.author.id },
			{ $inc: { count: 0, curExp: +1 } }
		);
	} else if (user.level > 1) {
		await bot.mongo.collection(DB.USERS).findOneAndUpdate(
			{ discordId: msg.author.id },
			{ $set: { curExp: 1, levelExp: calcNeededExp(user.levelExp, '-') }, $inc: { level: -1 } }
		);
	}

	if (user.count >= 1) {
		await bot.mongo.collection(DB.USERS).findOneAndUpdate(
			{ discordId: msg.author.id },
			{ $inc: { count: -1, curExp: 0 } }
		);
	}
}

async function handleLevelUp(err: Error | null, entry: SageUser, msg: Message): Promise<void> {
	if (err) {
		throw err;
	}

	if (!entry) {
		throw new DatabaseError(`Member ${msg.author.username} (${msg.author.id}) not in database`);
	}

	// Decrement curExp and check if leveling up is needed.
	entry.curExp--;
	if (entry.curExp <= 0) {
		// Reset XP and increase level.
		entry.curExp = entry.levelExp = calcNeededExp(entry.levelExp, '+');
		entry.level++;
		if (entry.levelPings) {
			await sendLevelPing(msg, entry);
		}
		let addRole: Role | undefined;
		// Check if a role for this level exists; if not, create it.
		if (!(addRole = msg.guild.roles.cache.find(r => r.name === `Level ${entry.level}`)) && entry.level <= maxLevel) {
			addRole = await msg.guild.roles.create({
				name: `Level ${entry.level}`,
				color: createLevelRgb(entry.level),
				position: msg.guild.roles.cache.get(ROLES.VERIFIED)?.position + 1,
				permissions: BigInt(0),
				reason: `${msg.author.username} is the first to get to Level ${entry.level}`
			});
		}

		if (entry.level <= maxLevel && msg.member) {
			const oldRole = msg.member.roles.cache.find(r => r.name.startsWith('Level'));
			if (oldRole) await msg.member.roles.remove(oldRole, `${msg.author.username} leveled up.`);
			if (addRole) await msg.member.roles.add(addRole, `${msg.author.username} leveled up.`);
		}

		if (entry.level > maxLevel && msg.member) {
			let powerRole = msg.guild.roles.cache.find(r => r.name === `Power User`);
			if (!powerRole) {
				powerRole = await msg.guild.roles.create({
					name: `Power User`,
					color: maxGreen,
					position: msg.guild.roles.cache.get(ROLES.VERIFIED)?.position + 1,
					permissions: BigInt(0),
					reason: `${msg.author.username} is the first to become a power user!`
				});
			}
			const oldRole = msg.member.roles.cache.find(r => r.name.startsWith('Level'));
			if (oldRole) await msg.member.roles.remove(oldRole, `${msg.author.username} leveled up.`);
			await msg.member.roles.add(powerRole, `${msg.author.username} leveled up.`);
		}

		await msg.client.mongo.collection(DB.USERS).updateOne(
			{ discordId: msg.author.id },
			{ $set: { ...entry } }
		);
	}
}

async function sendLevelPing(msg: Message, user: SageUser): Promise<Message> {
	let embedText: string;
	if (startingColor + (user.level * greenIncrement) >= 255 - greenIncrement) {
		embedText = `Congratulations, you have advanced to level ${user.level}!
		\nYou're about as green as you can get, but keep striving for higher levels to show off to your friends!`;
	} else {
		embedText = `Congratulations ${msg.author.username}, you have advanced to level ${user.level}!
Keep up the great work!`;
	}
	const embed = new EmbedBuilder()
		.setThumbnail(msg.author.avatarURL() || '')
		.setTitle('<:steve_peace:883541149032267816> Level up!')
		.setDescription(embedText)
		.addFields({ name: 'XP to next level:', value: user.levelExp.toString(), inline: true })
		.setColor(createLevelRgb(user.level))
		.setFooter({ text: 'You can turn the messages off by using the `/togglelevelpings` command' })
		.setTimestamp();

	const channel = msg.guild.channels.cache.get(CHANNELS.SAGE) as TextChannel;
	return channel.send({
		content: `${msg.member}, you have leveled up!`,
		embeds: [embed]
	});
}

function createLevelRgb(level: number): [number, number, number] {
	return [2, Math.min(startingColor + (level * greenIncrement), 255), 0];
}

export default register;
