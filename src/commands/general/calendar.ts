/* eslint-disable */
import {
	ChatInputCommandInteraction,
	ButtonBuilder,
	ButtonStyle,
	ActionRowBuilder,
	EmbedBuilder,
	ApplicationCommandOptionType,
	ApplicationCommandStringOptionData,
	ComponentType,
	StringSelectMenuBuilder,
	ButtonInteraction,
	CacheType,
	StringSelectMenuInteraction,
	Message,
} from 'discord.js';
import { Command } from '@lib/types/Command';
import 'dotenv/config';
import { MongoClient } from 'mongodb';
import * as fs from 'fs';
import { CALENDAR_CONFIG } from '@lib/CalendarConfig';
import { PagifiedSelectMenu } from '@root/src/lib/utils/calendarUtils';
import { calendar_v3 } from 'googleapis';
import { retrieveEvents } from '@root/src/lib/auth';
import path from 'path';
//import event from '@root/src/models/calEvent';

// Define the Master Calendar ID constant.
const MASTER_CALENDAR_ID = CALENDAR_CONFIG.MASTER_ID;

interface Event {
	calEvent: calendar_v3.Schema$Event;
	calendarName: string;
}

interface Filter {
	customId: string;
	placeholder: string,
	values: string[];
	newValues: string[];
	flag: boolean;
	condition: (newValues: string[], event: Event) => boolean;
}

export default class extends Command {
	name = "calendar";
	description = "Retrieve calendar events with pagination and filters";

	options: ApplicationCommandStringOptionData[] = [
		{
			type: ApplicationCommandOptionType.String,
			name: "classname",
			description: "Enter the event holder (e.g., class name).",
			required: false,
		}
	];

	async run(interaction: ChatInputCommandInteraction): Promise<void> {
		/** Helper Functions **/

		// Filters calendar events based on slash command inputs and filter dropdown selections.
		function filterEvents(events: Event[], eventsPerPage: number, filters: Filter[]) {
			let temp: Event[] = [];
			let filteredEvents: Event[][] = [];

			let allFiltersFlags = true;
			let eventHolderFlag: boolean = true;
			let eventDateFlag: boolean = true;
			events.forEach((event) => {
				const lowerCaseSummary: string = event.calEvent.summary.toLowerCase();

				// Extract class name (works for "CISC108-..." and "CISC374010")
				const classNameMatch = lowerCaseSummary.match(/cisc\d+/i);
				const extractedClassName = classNameMatch ? classNameMatch[0].toUpperCase() : "";

				// Dynamically update filter options.
				const classFilter = filters.find((f) => f.customId === "class_name_menu");
				if (extractedClassName && classFilter && !classFilter.values.includes(extractedClassName)) {
					classFilter.values.push(extractedClassName);
				}

				if (filters.length) {
					filters.forEach((filter) => {
						filter.flag = true;
						if (filter.newValues.length) {
							filter.flag = filter.condition(filter.newValues, event);
						}
					});
					allFiltersFlags = filters.every((f) => f.flag);
				}

				if (allFiltersFlags && eventHolderFlag && eventDateFlag) {
					temp.push(event);
					if (temp.length % eventsPerPage === 0) {
						filteredEvents.push(temp);
						temp = [];
					}
				}
			});
			if (temp.length) filteredEvents.push(temp);
			return filteredEvents;
		}

		// Generates the embed for displaying events.
		function generateEmbed(filteredEvents: Event[][], currentPage: number, maxPage: number): EmbedBuilder {
			let embed: EmbedBuilder;
			if (
				filteredEvents.length &&
				filteredEvents[currentPage] &&
				filteredEvents[currentPage].length
			) {
				embed = new EmbedBuilder()
					.setTitle(`Events - ${currentPage + 1} of ${maxPage}`)
					.setColor("Green");
				filteredEvents[currentPage].forEach((event) => {
					embed.addFields({
						name: `**${event.calEvent.summary}**`,
						value: `Date: ${new Date(event.calEvent.start.dateTime).toLocaleDateString()}
						Time: ${new Date(event.calEvent.start.dateTime).toLocaleTimeString()} - ${new Date(event.calEvent.end.dateTime).toLocaleTimeString()}
						Location: ${event.calEvent.location ? event.calEvent.location : "`NONE`"}
						Email: ${event.calEvent.creator.email}\n`,
					});
				});
			} else {
				embed = new EmbedBuilder()
					.setTitle("No Events Found")
					.setColor("Green")
					.addFields({
						name: "Try adjusting your filters",
						value: "No events match your selections, please change them!",
					});
			}
			return embed;
		}

		// Generates the pagination buttons (Previous, Next, Download Calendar, Download All, Done).
		function generateButtons(currentPage: number, maxPage: number, selectedCount: number) {
			const nextButton = new ButtonBuilder()
			  .setCustomId("next")
			  .setLabel("Next")
			  .setStyle(ButtonStyle.Primary)
			  .setDisabled(currentPage + 1 >= maxPage);
		  
			const prevButton = new ButtonBuilder()
			  .setCustomId("prev")
			  .setLabel("Previous")
			  .setStyle(ButtonStyle.Primary)
			  .setDisabled(currentPage === 0);
		  
			// ONE download button—label changes if you’ve selected events
			const downloadLabel = selectedCount > 0
			  ? `Download Selected (${selectedCount})`
			  : "Download All";
			const downloadBtn = new ButtonBuilder()
			  .setCustomId("download")
			  .setLabel(downloadLabel)
			  .setStyle(ButtonStyle.Success);
		  
			const doneButton = new ButtonBuilder()
			  .setCustomId("done")
			  .setLabel("Done")
			  .setStyle(ButtonStyle.Danger);
		  
			return new ActionRowBuilder<ButtonBuilder>().addComponents(
			  prevButton,
			  nextButton,
			  downloadBtn,
			  doneButton
			);
		  }
		  

		// Generates filter dropdown menus.
		function generateFilterMessage(filters: Filter[]) {
			const filterMenus: PagifiedSelectMenu[] = filters.map((filter) => {
				if (filter.values.length === 0) {
					filter.values.push("No Data Available");
				}
				const filterMenu = new PagifiedSelectMenu();
				filterMenu.createSelectMenu(
					{
						customId: filter.customId,
						placeHolder: filter.placeholder,
						minimumValues: 0,
						maximumValues: 25
					}
				);

				filter.values.forEach((value) => {
					let isDefault: boolean = false;
					if (filter.newValues[0]) {
						if (filter.newValues[0].toLowerCase() === value.toLowerCase()) {
							isDefault = true;
						}
					}
					filterMenu.addOption({label: value, value: value.toLowerCase(), default: isDefault})
				});
				return filterMenu;
			});

			return filterMenus;
		}

		// Generates a row of toggle buttons – one for each event on the current page.
		function generateEventSelectButtons(eventsPerPage: number): ActionRowBuilder<ButtonBuilder> {
			const selectEventButtons: ButtonBuilder[] = []

			// This is to ensure that the number of buttons does not exceed to the limit per row
			// We should probably change to a pagified select menu later on
			if (eventsPerPage > 5) {
				eventsPerPage = 5;
			}

			// Create buttons for each event on the page (up to 5)
			for (let i = 1; i <= eventsPerPage; i++) {
				const selectEvent = new ButtonBuilder()
					.setCustomId(`toggle-${i}`)
					.setLabel(`Select #${i}`)
					.setStyle(ButtonStyle.Secondary);
				selectEventButtons.push(selectEvent);
			}

			// Create row containing all of the select buttons
			const selectRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
				...selectEventButtons
			);

			return selectRow;
		}

		// Downloads events by generating an ICS file.
		// This version includes recurrence rules (if the event has them).
		async function downloadEvents(selectedEvents: Event[], calendars: { calendarId: string; calendarName: string; }[], interaction?: ChatInputCommandInteraction<CacheType>) {
			const formattedEvents: string[] = [];
			const parentEvents: calendar_v3.Schema$Event[] = [];

			for (const calendar of calendars) {
				const newParentEvents = await retrieveEvents(calendar.calendarId, interaction, false);
				parentEvents.push(...newParentEvents)
			}

			const recurrenceRules: Record<string, string> = Object.fromEntries(parentEvents.map((event) => {
				if (event.recurrence) {
                    return [event.id, event.recurrence[0]]
                };
                return [];;
			}));

			const recurringIds: Set<string> = new Set();

			selectedEvents.forEach((event) => {
				let append: boolean = false;
				const iCalEvent = {
					UID: `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`,
					CREATED: new Date(event.calEvent.created).toISOString().replace(/[-:.]/g, ''),
					DTSTAMP: event.calEvent.updated.replace(/[-:.]/g, ''),
					DTSTART: `TZID=${event.calEvent.start.timeZone}:${event.calEvent.start.dateTime.replace(/[-:.]/g, '')}`,
					DTEND: `TZID=${event.calEvent.end.timeZone}:${event.calEvent.end.dateTime.replace(/[-:.]/g, '')}`,
					SUMMARY: event.calEvent.summary,
					DESCRIPTION: `Contact Email: ${event.calEvent.creator.email || 'NA'}`,
					LOCATION: event.calEvent.location ? event.calEvent.location : 'NONE',
				};

				if (!event.calEvent.recurringEventId) {
					append = true
				}
				else {
					if (!recurringIds.has(event.calEvent.recurringEventId)) {
						recurringIds.add(event.calEvent.recurringEventId);
						append = true;
					}
				}

				if (append) {
					const icsFormatted = 
					`BEGIN:VEVENT
					UID:${iCalEvent.UID}
					CREATED:${iCalEvent.CREATED}
					DTSTAMP:${iCalEvent.DTSTAMP}
					DTSTART;${iCalEvent.DTSTART}
					DTEND;${iCalEvent.DTEND}
					SUMMARY:${iCalEvent.SUMMARY}
					DESCRIPTION:${iCalEvent.DESCRIPTION}
					LOCATION:${iCalEvent.LOCATION}
					STATUS:CONFIRMED
					${event.calEvent.recurringEventId ? recurrenceRules[event.calEvent.recurringEventId] : ''}
					END:VEVENT
					`.replace(/\t/g, '');
					formattedEvents.push(icsFormatted);
				}
			});

			const icsCalendar = `BEGIN:VCALENDAR
			VERSION:2.0
			PRODID:-//YourBot//Discord Calendar//EN
			${formattedEvents.join('')}
			END:VCALENDAR
			`.replace(/\t/g, '');
			fs.writeFileSync('./events.ics', icsCalendar);
		}

		/******************************************************************************************************************/
		// Initial reply to acknowledge the interaction.
		await interaction.reply({
			content: "Authenticating and fetching events...",
			ephemeral: true,
		});

		// Define filters for dropdowns.
		const filters: Filter[] = [
			{
				customId: "calendar_menu",
				placeholder: "Select Calendar",
				values: [],
				newValues: [],
				flag: true,
				condition: (newValues: string[], event: Event) => {
					const calendarName = event.calendarName.toLowerCase() || "";
					return newValues.some((value) => calendarName === value.toLowerCase());
				},
			},
			{
				customId: "class_name_menu",
				placeholder: "Select Classes",
				values: [],
				newValues: [interaction.options.getString('classname') ? interaction.options.getString('classname') : ''],
				flag: true,
				condition: (newValues: string[], event: Event) => {
					const summary = event.calEvent.summary?.toLowerCase() || "";
					return newValues.some((value) => summary.includes(value.toLowerCase()));
				},
			},
			{
				customId: "location_type_menu",
				placeholder: "Select Location Type",
				values: ["In Person", "Virtual"],
				newValues: [],
				flag: true,
				condition: (newValues: string[], event: Event) => {
					const locString = event.calEvent.summary?.toLowerCase() || '';
					return newValues.some((value) => locString.includes(value.toLowerCase()));
				},
			},
			{
				customId: "week_menu",
				placeholder: "Select Days of Week",
				values: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
				newValues: [],
				flag: true,
				condition: (newValues: string[], event: Event) => {
					if (!event.calEvent.start?.dateTime) return false;
					const dt = new Date(event.calEvent.start.dateTime);
					const weekdayIndex = dt.getDay(); // 0 = Sunday, 1 = Monday, etc.
					const dayName = [
						"Sunday",
						"Monday",
						"Tuesday",
						"Wednesday",
						"Thursday",
						"Friday",
						"Saturday",
					][weekdayIndex];
					return newValues.some((value) => value.toLowerCase() === dayName.toLowerCase());
				},
			},
		];

		const MONGO_URI = process.env.DB_CONN_STRING || "";
		const DB_NAME = "CalendarDatabase";
		const COLLECTION_NAME = "calendarIds";

		// Fetch calendar IDs from MongoDB.
		async function fetchCalendars() {
			const client = new MongoClient(MONGO_URI, { useUnifiedTopology: true });
			await client.connect();
			const db = client.db(DB_NAME);
			const collection = db.collection(COLLECTION_NAME);

			const calendarDocs = await collection.find().toArray();
			await client.close();

			const calendars: {calendarId: string, calendarName: string}[] = calendarDocs.map((doc) => ({
				calendarId: doc.calendarId,
				calendarName: doc.calendarName || "Unnamed Calendar",
			}));

			if (!calendars.some((c) => c.calendarId === MASTER_CALENDAR_ID)) {
				calendars.push({
					calendarId: MASTER_CALENDAR_ID,
					calendarName: "Master Calendar",
				});
			}

			return calendars;
		}

		// Retrieve events from all calendars in the database
		let events: Event[] = [];
		const calendars = await fetchCalendars();
		const calendarMenu = filters.find((f) => f.customId === "calendar_menu");
		if (calendarMenu) {
			calendarMenu.values = calendars.map((c) => c.calendarName);
		}

		for (const cal of calendars) {
			const retrivedEvents = await retrieveEvents(cal.calendarId, interaction)
			if (retrivedEvents === null) {
				return;
			}
			retrivedEvents.forEach((retrivedEvent) => {
				const newEvent: Event = {calEvent: retrivedEvent, calendarName: cal.calendarName}
				events.push(newEvent);
			});
		}

		// Sort events by their start time.
		events.sort(
			(a, b) =>
				new Date(a.calEvent.start?.dateTime || a.calEvent.start?.date).getTime() -
				new Date(b.calEvent.start?.dateTime || b.calEvent.start?.date).getTime()
		);

		const eventsPerPage: number = 3;
		let filteredEvents: Event[][] = filterEvents(events, eventsPerPage, filters);
		if (!filteredEvents.length) {
			await interaction.followUp({
				content: "No matching events found based on your filters. Please adjust your search criteria.",
				ephemeral: true,
			});
			return;
		}

		let maxPage: number = filteredEvents.length;
		let currentPage: number = 0;
		let selectedEvents: Event[] = [];

		const embed = generateEmbed(filteredEvents, currentPage, maxPage);
		const initialComponents: ActionRowBuilder<ButtonBuilder>[] = [];
		initialComponents.push(generateButtons(currentPage, maxPage, selectedEvents.length));
		if (filteredEvents[currentPage]) {
			if (filteredEvents[currentPage].length) {
				initialComponents.push(generateEventSelectButtons(filteredEvents[currentPage].length));
			}
		}

		const dm = await interaction.user.createDM();
		let message: Message<false>;
		try {
			message = await dm.send({
				embeds: [embed],
				components: initialComponents,
			});
		} catch (error) {
			console.error("Failed to send DM:", error);
			await interaction.followUp({
				content: "⚠️ I couldn't send you a DM. Please check your privacy settings.",
				ephemeral: true,
			});
			return;
		}

		const filterComponents = generateFilterMessage(filters);
		let content: string =  '**Select Filters**';

		const singlePageMenus: (ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>)[] = [];
		filterComponents.forEach((component) => {
			if (component.menus.length > 1) {
				component.generateRowsAndSendMenu(async (i) => {
					await i.deferUpdate();
					const filter = filters.find((f) => f.customId === i.customId);
					if (filter) {
						filter.newValues = i.values;
					}
					filteredEvents = filterEvents(events, eventsPerPage, filters);
					currentPage = 0;
					maxPage = filteredEvents.length;
					selectedEvents = []
					const newEmbed = generateEmbed(filteredEvents, currentPage, maxPage);
					const newComponents: ActionRowBuilder<ButtonBuilder>[] = [];
					newComponents.push(generateButtons(currentPage, maxPage, selectedEvents.length));
					if (filteredEvents[currentPage]) {
						if (filteredEvents[currentPage].length) {
							newComponents.push(generateEventSelectButtons(filteredEvents[currentPage].length));
						}
					}
					message.edit({
						embeds: [newEmbed],
						components: newComponents,
					});
				}, interaction, dm, content);
				content = '';
			}
			else {
				singlePageMenus.push(component.generateActionRows()[0]);
			}
		});

		// Send filter message
		let filterMessage: Message<false>;
		try {
			filterMessage = await dm.send({
				content: content,
				components: singlePageMenus
			});
		} catch (error) {
			console.error("Failed to send DM:", error);
			await interaction.followUp({
				content: "⚠️ I couldn't send you a DM. Please check your privacy settings.",
				ephemeral: true,
			});
			return;
		}
		await filterMessage.edit({
			content: content,
			components: singlePageMenus
		});

		// Create collectors for button and menu interactions.
		const buttonCollector = message.createMessageComponentCollector({ time: 300000 });
		const menuCollector = filterMessage.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 300000 });

		// Assuming inside your `run` method, after you've sent `message` and `filterMessage` and created collectors:

buttonCollector.on("collect", async (btnInt: ButtonInteraction<CacheType>) => {
	try {
	  await btnInt.deferUpdate();
  
	  // 1️⃣ Toggle selection buttons (#1–#5)
	  if (btnInt.customId.startsWith("toggle-")) {
		const idx = Number(btnInt.customId.split("-")[1]) - 1;
		const evt = filteredEvents[currentPage][idx];
		if (selectedEvents.includes(evt)) {
		  selectedEvents = selectedEvents.filter(e => e !== evt);
		  const m = await dm.send(`➖ Removed **${evt.calEvent.summary}**`);
		  setTimeout(() => m.delete().catch(console.error), 3000);
		} else {
		  selectedEvents.push(evt);
		  const m = await dm.send(`➕ Added **${evt.calEvent.summary}**`);
		  setTimeout(() => m.delete().catch(console.error), 3000);
		}
  
	  // 2️⃣ Pagination
	  } else if (btnInt.customId === "next") {
		if (currentPage + 1 < maxPage) currentPage++;
	  } else if (btnInt.customId === "prev") {
		if (currentPage > 0) currentPage--;
	  
	  // 3️⃣ Single Download button, context‑aware
	  } else if (btnInt.customId === "download") {
		// Decide whether to download Selected or All
		const toDownload = selectedEvents.length > 0
		  ? selectedEvents
		  : filteredEvents.flat();
		if (toDownload.length === 0) {
		  await dm.send("⚠️ No events to download!");
		  return;
		}
  
		const prep = await dm.send(`⏳ Preparing ${toDownload.length} event(s)…`);
		try {
		  // downloadEvents writes to './events.ics'
		  await downloadEvents(toDownload, calendars, interaction);
		  await prep.edit({
			content: `📥 Here are your ${toDownload.length} event(s):`,
			files: ["./events.ics"],
		  });
		  fs.unlinkSync("./events.ics");
		} catch (e) {
		  console.error("Download failed:", e);
		  await prep.edit("⚠️ Failed to generate calendar file.");
		}
		return;  // skip the re‑render below
  
	  // 4️⃣ Done / Close
	  } else if (btnInt.customId === "done") {
		await message.edit({ content: "📅 Calendar session closed.", embeds: [], components: [] });
		await filterMessage.edit({ content: "Filters closed.", embeds: [], components: [] });
		buttonCollector.stop();
		menuCollector.stop();
		return;
	  }
  
	  // 🔄 Re‑render embed & buttons for toggles / pagination
	  const embed = generateEmbed(filteredEvents, currentPage, maxPage);
	  const navRow = generateButtons(currentPage, maxPage, selectedEvents.length);
	  const rows: ActionRowBuilder<ButtonBuilder>[] = [navRow];
	  if (filteredEvents[currentPage]?.length) {
		rows.push(generateEventSelectButtons(filteredEvents[currentPage].length));
	  }
	  await message.edit({ embeds: [embed], components: rows });
  
	} catch (error) {
	  console.error("Button Collector Error:", error);
	  await btnInt.followUp({
		content: "⚠️ An error occurred navigating events. Please try again.",
		ephemeral: true,
	  });
	}
  });
  
		  

		menuCollector.on("collect", async (i: StringSelectMenuInteraction<CacheType>) => {
			await i.deferUpdate();
			const filter = filters.find((f) => f.customId === i.customId);
			if (filter) {
				filter.newValues = i.values;
			}
			filteredEvents = filterEvents(events, eventsPerPage, filters);
			currentPage = 0;
			maxPage = filteredEvents.length;
			selectedEvents = []
			const newEmbed = generateEmbed(filteredEvents, currentPage, maxPage);
			const newComponents: ActionRowBuilder<ButtonBuilder>[] = [];
			newComponents.push(generateButtons(currentPage, maxPage, selectedEvents.length));
			if (filteredEvents[currentPage]) {
				if (filteredEvents[currentPage].length) {
					newComponents.push(generateEventSelectButtons(filteredEvents[currentPage].length));
				}
			}
			message.edit({
				embeds: [newEmbed],
				components: newComponents,
			});
		});
	}
}
