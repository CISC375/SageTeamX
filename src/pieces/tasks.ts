import { CHANNELS, DB } from "@root/config";
import { ChannelType, Client, EmbedBuilder, TextChannel } from "discord.js";
import { schedule } from "node-cron";
import { Reminder } from "@lib/types/Reminder";
import { Poll, PollResult } from "@lib/types/Poll";
import { retrieveEvents } from "../lib/auth";
import { ObjectId } from "mongodb";

async function register(bot: Client): Promise<void> {
	schedule("0/30 * * * * *", () => {
		handleCron(bot).catch(async (error) => bot.emit("error", error));
	});
}

async function handleCron(bot: Client): Promise<void> {
	checkPolls(bot);
	checkReminders(bot);
}

async function checkPolls(bot: Client): Promise<void> {
	const polls: Poll[] = await bot.mongo
		.collection<Poll>(DB.POLLS)
		.find({
			expires: { $lte: new Date() },
		})
		.toArray();
	const emotes = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

	polls.forEach(async (poll) => {
		const mdTimestamp = `<t:${Math.floor(Date.now() / 1000)}:R>`;

		// figure out the winner and also put the results in a map for ease of use
		const resultMap = new Map<string, number>();
		let winners: PollResult[] = [];
		poll.results.forEach((res) => {
			resultMap.set(res.option, res.users.length);
			if (!winners[0]) {
				winners = [res];
				return;
			}

			if (winners[0] && res.users.length > winners[0].users.length) {
				winners = [res];
			} else if (res.users.length === winners[0].users.length) {
				winners.push(res);
			}
		});

		// build up the win string
		let winMessage: string;
		const winCount = winners[0].users.length;
		if (winCount === 0) {
			winMessage = `It looks like no one has voted!`;
		} else if (winners.length === 1) {
			winMessage = `**${
				winners[0].option
			}** has won the poll with ${winCount} vote${
				winCount === 1 ? "" : "s"
			}!`;
		} else {
			winMessage = `**${winners
				.slice(0, -1)
				.map((win) => win.option)
				.join(", ")} and ${
				winners.slice(-1)[0].option
			}** have won the poll with ${winners[0].users.length} vote${
				winCount === 1 ? "" : "s"
			} each!`;
		}

		// build up the text that is on the final poll embed
		let choiceText = "";
		let count = 0;
		resultMap.forEach((value, key) => {
			choiceText += `${emotes[count++]} ${key}: ${value} vote${
				value === 1 ? "" : "s"
			}\n`;
		});

		const pollChannel = await bot.channels.fetch(poll.channel);
		if (pollChannel.type !== ChannelType.GuildText) {
			throw "something went wrong fetching the poll's channel";
		}
		const pollMsg = await pollChannel.messages.fetch(poll.message);
		const owner = await pollMsg.guild.members.fetch(poll.owner);
		const pollEmbed = new EmbedBuilder()
			.setTitle(poll.question)
			.setDescription(
				`This poll was created by ${owner.displayName} and ended **${mdTimestamp}**`
			)
			.addFields({
				name: `Winner${winners.length === 1 ? "" : "s"}`,
				value: winMessage,
			})
			.addFields({ name: "Choices", value: choiceText })
			.setColor("Random");

		pollMsg.edit({ embeds: [pollEmbed], components: [] });

		pollMsg.channel.send({
			embeds: [
				new EmbedBuilder()
					.setTitle(poll.question)
					.setDescription(`${owner}'s poll has ended!`)
					.addFields({
						name: `Winner${winners.length === 1 ? "" : "s"}`,
						value: winMessage,
					})
					.addFields({
						name: "Original poll",
						value: `Click [here](${pollMsg.url}) to see the original poll.`,
					})
					.setColor("Random"),
			],
		});

		await bot.mongo.collection<Poll>(DB.POLLS).findOneAndDelete(poll);
	});
}

async function checkReminders(bot: Client): Promise<void> {
	const now = new Date();
	// 1) Fetch all reminders due
	const reminders: Reminder[] = await bot.mongo
		.collection<Reminder>(DB.REMINDERS)
		.find({ expires: { $lte: now } })
		.toArray();

	const handledIds: ObjectId[] = [];

	// 2) Send each one
	for (const rem of reminders) {
		const embed = new EmbedBuilder()
			.setTitle("⏰ Reminder")
			.setDescription(rem.content)
			.setColor("Blue")
			.setTimestamp(now);

		if (rem.repeat) {
			embed.addFields({
				name: "🔁 Repeats",
				value:
					rem.repeat === "every_event" ? "Every event" : rem.repeat,
				inline: true,
			});
		}

		try {
			const user = await bot.users.fetch(rem.owner);
			await user.send({ embeds: [embed] });
		} catch {
			const fallbackChannel = (await bot.channels.fetch(
				CHANNELS.SAGE
			)) as TextChannel;
			await fallbackChannel.send({ embeds: [embed] });
		}

		// 3) Reschedule if it's a repeating reminder
		if (rem.repeat === "every_event") {
			await tryRescheduleReminder(rem, now, bot);
		}

		// Collect ID to delete after loop
		if (rem._id) handledIds.push(rem._id);
	}

	// 4) Remove all processed reminders
	if (handledIds.length > 0) {
		await bot.mongo.collection(DB.REMINDERS).deleteMany({
			_id: { $in: handledIds },
		});
	}
}
async function tryRescheduleReminder(
	rem: Reminder,
	now: Date,
	bot: Client
): Promise<void> {
	try {
		const futureEvents = await retrieveEvents(rem.calendarId);
		const nextEvent = futureEvents
			.filter(
				(e) =>
					new Date(e.start?.dateTime || 0) > now &&
					e.summary === rem.summary
			)
			.sort(
				(a, b) =>
					new Date(a.start.dateTime).getTime() -
					new Date(b.start.dateTime).getTime()
			)[0];

		if (!nextEvent) return;

		const nextStart = new Date(nextEvent.start.dateTime);
		const nextReminderTime = new Date(nextStart.getTime() - rem.offset);

		if (nextReminderTime > new Date(rem.repeatUntil)) return;

		// Prevent duplicate reminders
		const existing = await bot.mongo.collection(DB.REMINDERS).findOne({
			summary: rem.summary,
			calendarId: rem.calendarId,
			expires: nextReminderTime,
			owner: rem.owner,
		});

		if (existing) return;

		const tz = nextEvent.start.timeZone || "America/New_York";
		const formattedStart = nextStart.toLocaleString("en-US", {
			timeZone: tz,
			dateStyle: "short",
			timeStyle: "short",
		});

		const newContent = `${
			nextEvent.summary || "Untitled Event"
		}\nStarts at: ${formattedStart}${
			nextEvent.location ? `\nLocation: ${nextEvent.location}` : ""
		}${nextEvent.description ? `\nDetails: ${nextEvent.description}` : ""}`;

		// Reschedule with updated content
		const { _id: _, ...reminderData } = rem;
		await bot.mongo.collection(DB.REMINDERS).insertOne({
			...reminderData,
			expires: nextReminderTime,
			content: newContent,
		});
	} catch (err) {
		console.error("Failed to reschedule repeating reminder:", err);
	}
}

export default register;
